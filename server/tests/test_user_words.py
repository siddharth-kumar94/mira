"""Server text that reaches the user must use Rally's words (sprint, feature,
capability, story, task), not Linear's (cycle, project, initiative, issue,
sub-issue). Identifiers are not strings, so they never trip the scan."""

import ast
import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
BANNED = re.compile(r"\b(sub-issues?|issues?|cycles?|projects?|initiatives?)\b", re.I)
# Calls whose arguments become a message the user reads (toast, 403/404/422 body, health chip title).
CALLS = {"GuardError", "BadRequest", "RallyError", "HTTPException", "ValueError", "_auto", "Health"}
# Inside these, every string in the body is a phrase the user reads (minus the docstring).
# Module-level constants that hold message text; SAFE entries may point to them as "scanned where defined".
MESSAGE_CONSTANTS = {"GUARD_MESSAGE", "BURNUP_UNAVAILABLE", "NOT_CONNECTED"}
PHRASE_FUNCS = {"_phrase", "activities_from_rally"}
# Message pieces that are not literals but cannot carry a banned word, keyed by their source text.
SAFE = {
    "e.status": "an HTTP status code, not text",
    "status": "an HTTP status code, not text",
    "e.message": "a Rally or guard message that is itself scanned where it is raised",
    "GUARD_MESSAGE": "a module constant, scanned where it is defined",
    "BURNUP_UNAVAILABLE": "a module constant, scanned where it is defined",
    "NOT_CONNECTED": "a module constant, scanned where it is defined",
    "self.prefix.strip()": "the configured [DEMO] prefix",
    "self.tag": "the configured demo tag",
    "_FIELD_WORD.get(name, name)": "a field name mapped to Rally's word; the other names are not Linear nouns",
    "name": "a field or label name, never a Linear noun",
    "text.upper()": "the story or feature ID the user typed",
    "cycle_id": "a numeric ID", "sub_id": "a numeric ID", "team_id": "a numeric ID", "post_id": "a numeric ID",
    "MAX_PAST_CYCLES": "a number", "MAX_TEAMS": "a number", "LOOKBACK_MAX": "a number", "total": "a number",
    "len(rows)": "a number", "len(active)": "a number", "blocked": "a number", "target": "a date",
    "update.created_at[:10]": "a date", "e.__class__.__name__": "a Python class name",
    "response.status_code": "an HTTP status code", "missing[0]": "a label name the user typed",
    "round(progress * 100)": "a number", "round(elapsed * 100)": "a number",
    "plural": "a literal chosen in the same function, scanned there",
    "type(e).__name__": "a Python class name",
    "'story' if blocked == 1 else 'stories'": "literals, scanned",
    "'s' if len(active) != 1 else ''": "literals, scanned",
    "cause": "the reason is logged, not shown",
    "value": "a health value such as on_track", "update.health": "a health value such as on_track",
    "worst": "a health value such as on_track",
    "reason": "the parameter of _auto, scanned at every call site",
    "'; '.join(envelope['Errors'])": "Rally's own error text, not ours to reword",
}


def _name(func: ast.expr) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _check_arg(node: ast.AST):
    """Yield (line, text, kind) for a message argument: literal text, or a non-literal that is not allow-listed."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, str):
            yield node.lineno, node.value, "text"
        return
    if isinstance(node, ast.JoinedStr):
        for part in node.values:
            if isinstance(part, ast.Constant):
                yield part.lineno, part.value, "text"
            elif isinstance(part, ast.FormattedValue):
                yield from _check_arg(part.value)
        return
    if isinstance(node, ast.IfExp):  # 'a' if x else 'b': the branches carry the text
        yield from _check_arg(node.body)
        yield from _check_arg(node.orelse)
        return
    src = ast.unparse(node)
    if src not in SAFE:
        yield node.lineno, src, "unverified"


def scan_source(source: str):
    """(line, text, kind) for every banned word ("banned") and every unverified non-literal ("unverified")."""
    tree = ast.parse(source)
    seen = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in MESSAGE_CONSTANTS for t in node.targets):
            seen.extend(_check_arg(node.value))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _name(node.func) in CALLS:
            for arg in [*node.args, *(k.value for k in node.keywords)]:
                seen.extend(_check_arg(arg))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in PHRASE_FUNCS:
            for stmt in node.body[1:] if ast.get_docstring(node) else node.body:
                for n in ast.walk(stmt):
                    if isinstance(n, ast.Constant) and isinstance(n.value, str):
                        seen.append((n.lineno, n.value, "text"))
    out = []
    for line, text, kind in seen:
        if kind == "unverified":
            out.append((line, text, "unverified"))
        elif BANNED.search(text):
            out.append((line, text, "banned"))
    return out


def test_user_facing_server_text_has_no_linear_words():
    found = []
    for path in sorted(APP.rglob("*.py")):
        for line, text, kind in scan_source(path.read_text()):
            found.append(f"{path.relative_to(APP.parent)}:{line}: [{kind}] {text!r}")
    assert not found, "Linear's words (or unverified message pieces) in user-facing text:\n" + "\n".join(found)


def test_scanner_catches_each_shape():
    def kinds(src):
        return {(t, k) for _, t, k in scan_source(src)}

    assert ("a cycle", "banned") in kinds('raise GuardError("a cycle")')
    assert ("an issue", "banned") in kinds('raise BadRequest("an issue")')
    assert ("project x", "banned") in kinds('raise RallyError(404, "project x")')
    assert ("Sub-issue ", "banned") in kinds('raise RallyError(404, f"Sub-issue {i}")')
    assert ("an initiative", "banned") in kinds('raise HTTPException(404, detail="an initiative")')
    assert ("a cycle", "banned") in kinds('raise ValueError("a cycle")')
    assert ("a project", "banned") in kinds('def _auto(v, r): ...\n_auto("x", "a project")')
    assert ("a project", "banned") in kinds('Health(value=1, reason="a project")')
    assert ("an issue", "banned") in kinds('def _phrase(f):\n    """doc"""\n    return "an issue"')
    assert ("an issue", "banned") in kinds('def activities_from_rally(o):\n    p = ["an issue"]\n    return p')
    assert ("word", "unverified") in kinds("raise BadRequest(word)")
    assert ("kind", "unverified") in kinds('raise BadRequest(f"no {kind} here")')
    assert ("x.y", "unverified") in kinds("raise RallyError(404, x.y)")
    # a message constant is scanned where it is defined
    src = 'GUARD_MESSAGE = "Demo mode: only [DEMO] issues can be edited"\nraise GuardError(GUARD_MESSAGE)'
    assert ("Demo mode: only [DEMO] issues can be edited", "banned") in kinds(src)
    assert kinds('GUARD_MESSAGE = "Demo mode: only [DEMO] items can be edited"\nraise GuardError(GUARD_MESSAGE)') == set()
    assert ("a cycle ", "banned") in kinds('NOT_CONNECTED = f"a cycle {x}"')
    # allow-listed pieces and clean text pass; an identifier named after a banned word is not text
    assert kinds('raise BadRequest(f"no {len(rows)} here")') == set()
    assert kinds('raise GuardError("a sprint of stories")') == set()
    assert kinds("cycle_names = 1\nx = cycle_names") == set()
