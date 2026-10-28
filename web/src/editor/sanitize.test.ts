import { expect, test } from "vitest";
import { editableInline, sanitize } from "./sanitize";

test("scripts and event handlers are removed", () => {
  const out = sanitize('<p onclick="x()">Hi<img src="x" onerror="alert(1)"><script>alert(2)</script></p>');
  expect(out).not.toMatch(/script|onerror|onclick/);
  expect(out).toContain("<p>Hi");
});

test("javascript: links lose their href", () => {
  expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
});

test("normal links open safely in a new tab", () => {
  const out = sanitize('<a href="https://example.com">x</a>');
  expect(out).toContain('target="_blank"');
  expect(out).toContain('rel="noopener noreferrer"');
});

test("Rally's usual formatting survives", () => {
  const html = "<p><b>Bold</b> <i>it</i></p><ul><li>one</li></ul>";
  expect(sanitize(html)).toBe(html);
});

test("inline styles and iframes are dropped", () => {
  expect(sanitize('<p style="color:red">x</p><iframe src="https://example.com"></iframe>')).toBe("<p>x</p>");
});

test("descriptions with images are not edited inline", () => {
  expect(editableInline('<p>see <img src="https://rally.example/a.png"></p>')).toBe(false);
  expect(editableInline('<IMG SRC="x.png">')).toBe(false);
  expect(editableInline("<p>an image is not an <b>imgur</b> link</p>")).toBe(true);
});

test("descriptions with tables are not edited inline", () => {
  expect(editableInline("<p>ok</p>")).toBe(true);
  expect(editableInline("<table><tbody><tr><td>c</td></tr></tbody></table>")).toBe(false);
});
