import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Menu, MenuButton, type MenuEntry } from "./Menu";

const entries = (spy: (id: string) => void): MenuEntry[] => [
  { id: "backlog", label: "Backlog", keys: "1", onSelect: () => spy("backlog") },
  { id: "todo", label: "Todo", keys: "2", checked: true, onSelect: () => spy("todo") },
  "divider",
  { id: "status", label: "Status", items: [{ id: "s1", label: "In Review", onSelect: () => spy("s1") }], filterable: true },
  { id: "off", label: "Unavailable", disabled: true, onSelect: () => spy("off") },
  { id: "keep", label: "Stay open", keepOpen: true, onSelect: () => spy("keep") },
];

test("arrow keys move, Enter chooses and closes; disabled items do nothing", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "Enter" });
  expect(spy).toHaveBeenCalledWith("todo");
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("menuitem", { name: "Unavailable" }));
  expect(spy).not.toHaveBeenCalledWith("off");
  expect(screen.getByRole("menuitemcheckbox", { name: "Todo" })).toHaveAttribute("aria-checked", "true");
});

test("a number picks the item with that keycap while the filter is empty", () => {
  const spy = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={() => {}} placeholder="Change status…" />);
  const input = screen.getByPlaceholderText("Change status…");
  fireEvent.keyDown(input, { key: "1" });
  expect(spy).toHaveBeenCalledWith("backlog");
  fireEvent.change(input, { target: { value: "to" } });
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Todo")]));
  expect(screen.queryByRole("menuitem", { name: "Backlog" })).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull(); // dividers hide while filtering
});

test("ArrowRight opens a submenu; Escape there closes only the submenu; a leaf closes everything", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  for (let i = 0; i < 2; i++) fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  const sub = screen.getByRole("menu", { name: "Status" });
  expect(within(sub).getByPlaceholderText("Filter…")).toBeInTheDocument();
  expect(fireEvent.keyDown(sub, { key: "Escape" })).toBe(false); // handled: the global Esc must not fire too
  expect(screen.queryByRole("menu", { name: "Status" })).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  fireEvent.click(within(screen.getByRole("menu", { name: "Status" })).getByRole("menuitem", { name: "In Review" }));
  expect(spy).toHaveBeenCalledWith("s1");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("keepOpen items leave the menu open", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  fireEvent.click(screen.getByRole("menuitem", { name: "Stay open" }));
  expect(spy).toHaveBeenCalledWith("keep");
  expect(onClose).not.toHaveBeenCalled();
});

test("MenuButton opens its menu under the button and closes it after a choice", () => {
  const spy = vi.fn();
  render(<MenuButton label="Grouping" entries={() => entries(spy)}
    button={({ open, toggle }) => <button type="button" aria-expanded={open} onClick={toggle}>Status</button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Status" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Backlog" }));
  expect(spy).toHaveBeenCalledWith("backlog");
  expect(screen.queryByRole("menu", { name: "Grouping" })).toBeNull();
});

test("keys inside a submenu do not reach the parent menu", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  for (let i = 0; i < 2; i++) fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  const sub = screen.getByRole("menu", { name: "Status" });
  const input = within(sub).getByPlaceholderText("Filter…");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(spy.mock.calls).toEqual([["s1"]]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a submenu's filter keeps its caret keys; closing it returns focus to the parent", () => {
  render(<Menu label="Pick" entries={entries(() => {})} onClose={() => {}} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  for (let i = 0; i < 2; i++) fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  const input = within(screen.getByRole("menu", { name: "Status" })).getByPlaceholderText<HTMLInputElement>("Filter…");
  fireEvent.change(input, { target: { value: "abc" } });
  input.setSelectionRange(2, 2);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(screen.getByRole("menu", { name: "Status" })).toBeInTheDocument();
  input.setSelectionRange(0, 0);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(screen.queryByRole("menu", { name: "Status" })).toBeNull();
  expect(document.activeElement).toBe(menu);
});

test("MenuButton returns focus to its button after Escape", () => {
  render(<MenuButton label="Grouping" entries={() => entries(() => {})}
    button={({ toggle }) => <button type="button" onClick={toggle}>Status</button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Status" }));
  fireEvent.keyDown(screen.getByRole("menu", { name: "Grouping" }), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Status" }));
});

test("MenuButton can open above its button", () => {
  render(<MenuButton label="Help" side="above" entries={[{ id: "a", label: "A" }]}
    button={({ toggle }) => <button type="button" onClick={toggle}>Help</button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  expect(screen.getByRole("menu", { name: "Help" }).className).toContain("bottom-full");
});

test("a printable key in an open menu does not reach window shortcuts", () => {
  const onWindow = vi.fn();
  window.addEventListener("keydown", onWindow);
  render(<Menu label="Pick" entries={entries(() => {})} onClose={() => {}} />);
  fireEvent.keyDown(screen.getByRole("menu", { name: "Pick" }), { key: "s" });
  const input = render(<Menu label="Filtered" entries={entries(() => {})} onClose={() => {}} placeholder="Filter…" />).getByPlaceholderText("Filter…");
  expect(fireEvent.keyDown(input, { key: "p" })).toBe(true); // typing in the filter still works
  window.removeEventListener("keydown", onWindow);
  expect(onWindow).not.toHaveBeenCalled();
});

test("a glyph letter opens the matching submenu", () => {
  render(<Menu label="Pick" entries={[{ id: "s", label: "Status", glyphs: "S", items: [{ id: "x", label: "Done" }] }]} onClose={() => {}} />);
  fireEvent.keyDown(screen.getByRole("menu", { name: "Pick" }), { key: "s" });
  expect(screen.getByRole("menu", { name: "Status" })).toBeInTheDocument();
});

test("a glyph letter with ⌘, Ctrl or Alt held opens nothing; the bare letter does", () => {
  const glyphed: MenuEntry[] = ["Assignee:A", "Priority:P", "Labels:L"].map((x) => {
    const [label, glyphs] = x.split(":");
    return { id: label, label, glyphs, items: [{ id: `${label}-x`, label: "Pick" }] };
  });
  render(<Menu label="Pick" entries={glyphed} onClose={() => {}} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  for (const key of ["a", "p", "l"]) {
    fireEvent.keyDown(menu, { key, metaKey: true });
    fireEvent.keyDown(menu, { key, ctrlKey: true });
    fireEvent.keyDown(menu, { key, altKey: true });
  }
  expect(screen.queryAllByRole("menu")).toHaveLength(1);
  fireEvent.keyDown(menu, { key: "a" });
  expect(screen.getByRole("menu", { name: "Assignee" })).toBeInTheDocument();
});

test("a submenu's onQuery hears its filter text, after a pause", () => {
  vi.useFakeTimers();
  const onQuery = vi.fn();
  render(<Menu label="Pick" entries={[{ id: "a", label: "Assignee", filterable: true, onQuery, items: [{ id: "x", label: "Dana" }] }]} onClose={() => {}} />);
  fireEvent.keyDown(screen.getByRole("menu", { name: "Pick" }), { key: "ArrowRight" });
  fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "pa" } });
  fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "pat " } });
  expect(onQuery).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(300));
  expect(onQuery.mock.calls).toEqual([["pat"]]);
  vi.useRealTimers();
});

test("submenus flip left from the parent's box, one after another", () => {
  const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ right: 1000, left: 800, top: 0, bottom: 0, width: 200, height: 0, x: 800, y: 0, toJSON() {} });
  Object.defineProperty(window, "innerWidth", { value: 1100, configurable: true });
  render(<Menu label="Filter" entries={[
    { id: "a", label: "Status", items: [{ id: "a1", label: "Todo" }] },
    { id: "b", label: "Assignee", items: [{ id: "b1", label: "Dana" }] },
  ]} onClose={() => {}} />);
  for (const name of ["Status", "Assignee", "Status"]) {
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name }));
    expect(screen.getByRole("menu", { name }).className).toContain("right-full");
  }
  spy.mockRestore();
});
