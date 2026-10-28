// Guard for Mira's on-screen words (spec D39): Rally's words, not Linear's.
// Known limits: text is scanned per text node, so a word split across inline elements
// (<b>Sub</b>-issue) is missed; only the attributes listed below are scanned.
const BANNED = /\b(sub-issues?|issues?|cycles?|projects?|initiatives?)\b/gi;
const ATTRIBUTES = ["aria-label", "title", "placeholder", "alt", "aria-description"];
const SKIPPED = new Set(["SCRIPT", "STYLE"]);

/** Throws, listing every offender, if `root` contains a Linear word (hidden content included; pass the real root). `allow` is lower-case singular words to ignore. */
export function expectRallyWords(root: ParentNode, opts: { allow?: string[] } = {}): void {
  const allow = new Set(opts.allow ?? []);
  const offenders: string[] = [];
  let scanned = 0;

  const check = (text: string, where: string) => {
    if (text.trim()) scanned++;
    const hits = (text.match(BANNED) ?? []).filter((w) => !allow.has(w.toLowerCase().replace(/s$/, "")));
    if (hits.length) offenders.push(`${where}: "${text.trim()}" (${hits.join(", ")})`);
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      check(node.textContent ?? "", "text");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIPPED.has(el.tagName.toUpperCase())) return;
      for (const attr of ATTRIBUTES) {
        const value = el.getAttribute(attr);
        if (value) check(value, `<${el.tagName.toLowerCase()}> ${attr}`);
      }
    }
    node.childNodes.forEach(walk);
  };
  walk(root as unknown as Node);

  if (scanned === 0) throw new Error("expectRallyWords: nothing to scan — render the screen first");
  if (offenders.length) {
    throw new Error(`Linear words on screen (use Rally's, see D39):\n${offenders.join("\n")}`);
  }
}
