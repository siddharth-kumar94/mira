import { expect, test } from "vitest";
import { resolveKey, type KeyLike } from "./shortcuts";

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: document.body, ...over });

test("Linear's single keys (spec §10)", () => {
  const map: [string, string][] = [
    ["c", "create"], ["s", "pick-status"], ["p", "pick-priority"], ["a", "pick-assignee"], ["i", "assign-me"],
    ["l", "pick-labels"], ["x", "toggle-select"], ["j", "down"], ["k", "up"], [" ", "open-peek"], ["Enter", "open-page"],
    ["f", "filter"], ["?", "cheatsheet"],
  ];
  for (const [k, action] of map) expect(resolveKey(key(k), null).action, k).toBe(action);
});

test("Shift picks project, cycle and estimate; Caps Lock alone keeps the plain meaning", () => {
  expect(resolveKey(key("P", { shiftKey: true }), null).action).toBe("pick-project");
  expect(resolveKey(key("C", { shiftKey: true }), null).action).toBe("pick-cycle");
  expect(resolveKey(key("E", { shiftKey: true }), null).action).toBe("pick-estimate");
  expect(resolveKey(key("S"), null).action).toBe("pick-status");
  expect(resolveKey(key("J", { shiftKey: true }), null).action).toBeUndefined();
});

test("G then M, P or N", () => {
  expect(resolveKey(key("g"), null)).toEqual({ prefix: "g" });
  expect(resolveKey(key("m"), "g").action).toBe("go-my-issues");
  expect(resolveKey(key("p"), "g").action).toBe("go-projects");
  expect(resolveKey(key("n"), "g").action).toBe("go-initiatives");
  expect(resolveKey(key("x"), "g")).toEqual({ action: undefined, prefix: null });
});

test("⌘K, ⌘. and Escape", () => {
  expect(resolveKey(key("k", { metaKey: true }), null).action).toBe("palette");
  expect(resolveKey(key("k", { ctrlKey: true }), null).action).toBe("palette");
  expect(resolveKey(key(".", { metaKey: true }), null).action).toBe("copy-id");
  expect(resolveKey(key("Escape"), null).action).toBe("escape");
  expect(resolveKey(key("c", { metaKey: true }), null).action).toBeUndefined();
});

test("typing never triggers a shortcut, except ⌘K and Escape", () => {
  const input = document.createElement("input");
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  for (const target of [input, editor]) {
    expect(resolveKey(key("s", { target }), null).action).toBeUndefined();
    expect(resolveKey(key(".", { target, metaKey: true }), null).action).toBeUndefined();
    expect(resolveKey(key("k", { target, metaKey: true }), null).action).toBe("palette");
    expect(resolveKey(key("Escape", { target }), null).action).toBe("escape");
  }
});

test("buttons and checkboxes keep Space and Enter", () => {
  const button = document.createElement("button");
  const box = Object.assign(document.createElement("input"), { type: "checkbox" });
  expect(resolveKey(key(" ", { target: button }), null).action).toBeUndefined();
  expect(resolveKey(key("Enter", { target: box }), null).action).toBeUndefined();
  expect(resolveKey(key("s", { target: button }), null).action).toBe("pick-status");
});

test("a focused row checkbox is not typing: shortcuts work, Space and Enter stay native", () => {
  const box = Object.assign(document.createElement("input"), { type: "checkbox" });
  expect(resolveKey(key("s", { target: box }), null).action).toBe("pick-status");
  expect(resolveKey(key("j", { target: box }), null).action).toBe("down");
  expect(resolveKey(key(" ", { target: box }), null).action).toBeUndefined();
  expect(resolveKey(key("Enter", { target: box }), null).action).toBeUndefined();
  const text = Object.assign(document.createElement("input"), { type: "search" });
  expect(resolveKey(key("s", { target: text }), null).action).toBeUndefined();
});

test("⌘B toggles the layout, but not while typing", () => {
  expect(resolveKey(key("b", { metaKey: true }), null).action).toBe("toggle-layout");
  const input = document.createElement("input");
  expect(resolveKey(key("b", { metaKey: true, target: input }), null).action).toBeUndefined();
});
