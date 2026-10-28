import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { expectRallyWords } from "./vocabulary";

test("Rally's words pass", () => {
  const { container } = render(<p>Your stories</p>);
  expect(() => expectRallyWords(container)).not.toThrow();
});

test("an aria-label with a banned word throws and names the attribute", () => {
  const { container } = render(<button aria-label="Create issue" />);
  expect(() => expectRallyWords(container)).toThrow(/aria-label/);
});

test("a placeholder with a banned word throws", () => {
  const { container } = render(<input placeholder="Add to project…" />);
  expect(() => expectRallyWords(container)).toThrow(/placeholder/);
});

test("a title with a banned word throws", () => {
  const { container } = render(<span title="Show cycles" />);
  expect(() => expectRallyWords(container)).toThrow(/title/);
});

test("alt and aria-description are scanned", () => {
  const { container } = render(
    <div>
      <img alt="Initiative chart" />
      <span aria-description="A sub-issue" />
    </div>,
  );
  expect(() => expectRallyWords(container)).toThrow(/alt[\s\S]*aria-description/);
});

test("visible text with a banned word throws", () => {
  const { container } = render(<p>Sub-issues</p>);
  expect(() => expectRallyWords(container)).toThrow(/Sub-issues/);
});

test("every offender is listed in one error", () => {
  const { container } = render(
    <div>
      <p>Cycles</p>
      <button aria-label="New project" />
    </div>,
  );
  expect(() => expectRallyWords(container)).toThrow(/Cycles[\s\S]*New project/);
});

test("allow lets a listed word through", () => {
  const { container } = render(<p>Capabilities by Initiative</p>);
  expect(() => expectRallyWords(container)).toThrow(/Initiative/);
  expect(() => expectRallyWords(container, { allow: ["initiative"] })).not.toThrow();
});

test("allow does not excuse other words", () => {
  const { container } = render(<p>Initiative and cycle</p>);
  expect(() => expectRallyWords(container, { allow: ["initiative"] })).toThrow(/cycle/);
});

test("a banned word inside another word passes", () => {
  const { container } = render(<p>Reissue Subprojects</p>);
  expect(() => expectRallyWords(container)).not.toThrow();
});

test("script and style contents are skipped", () => {
  const { container } = render(
    <div>
      <p>Stories</p>
      <script>{"const issue = 1"}</script>
      <style>{".project { color: red }"}</style>
    </div>,
  );
  expect(() => expectRallyWords(container)).not.toThrow();
});

test.each([
  ["<p>The project's lead</p>", true],
  ["<p>No projects.</p>", true],
  ["<p>ISSUE</p>", true],
  ["<p>Bicycle</p>", false],
  ["<p>bicycle</p>", false],
  ["<p>Cycling</p>", false],
])("regex edge case %s throws=%s", (html, throws) => {
  const { container } = render(<div dangerouslySetInnerHTML={{ __html: html }} />);
  const run = () => expectRallyWords(container);
  if (throws) expect(run).toThrow(/Linear words/);
  else expect(run).not.toThrow();
});

test("an empty root throws instead of passing silently", () => {
  const { container } = render(<div />);
  expect(() => expectRallyWords(container)).toThrow(
    "expectRallyWords: nothing to scan — render the screen first",
  );
});
