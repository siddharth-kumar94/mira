import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SPRINT3 } from "../test/fixtures";
import { ago, pickerRange, points, rangeLabel, shortDate } from "./format";
import { Chip, IconButton, Keys, Switch, Tile, tileColor } from "./ui";

test("a chip holds an icon and truncating text", () => {
  render(<Chip title="Full name" icon={<span data-testid="i" />}>Sprint 3</Chip>);
  expect(screen.getByTitle("Full name")).toHaveTextContent("Sprint 3");
  expect(screen.getByTestId("i")).toBeInTheDocument();
});

test("round icon buttons name themselves and can carry the modified dot", () => {
  const onClick = vi.fn();
  render(<IconButton label="Display options" icon="display" dot onClick={onClick} />);
  const button = screen.getByRole("button", { name: "Display options" });
  expect(button.className).toContain("size-7");
  expect(button.querySelector("[data-dot]")).not.toBeNull();
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalled();
});

test("a switch flips and reports its state", () => {
  const onChange = vi.fn();
  render(<Switch checked={false} onChange={onChange} label="Show empty groups" />);
  const sw = screen.getByRole("switch", { name: "Show empty groups" });
  expect(sw).toHaveAttribute("aria-checked", "false");
  fireEvent.click(sw);
  expect(onChange).toHaveBeenCalledWith(true);
});

test("switches are 22×14 in menus and 30×20 in settings", () => {
  render(<><Switch checked={false} onChange={() => {}} label="Menu" /><Switch size="settings" checked onChange={() => {}} label="Settings" /></>);
  expect(screen.getByRole("switch", { name: "Menu" })).toHaveClass("h-3.5", "w-[22px]");
  expect(screen.getByRole("switch", { name: "Settings" })).toHaveClass("h-5", "w-[30px]", "bg-accent");
});

test("one keycap per key", () => {
  const { container } = render(<Keys keys="⇧ P" />);
  expect([...container.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["⇧", "P"]);
});

test("tiles take a stable colour from the id and show initials", () => {
  expect(tileColor(9001)).toBe(tileColor(9001));
  expect(tileColor(9001)).not.toBe(tileColor(9002));
  const { container } = render(<Tile id={9002} name="AI/ML Solutions" size={20} />);
  expect(container.firstElementChild).toHaveTextContent("AS");
});

test("dates, ranges, relative times and points read like Linear", () => {
  expect(shortDate("2026-10-16T14:00:00.000Z")).toBe("Oct 16");
  expect(rangeLabel(SPRINT3)).toBe("Oct 8 → Oct 21");
  expect(pickerRange(SPRINT3)).toBe("Oct 8 – Oct 21");
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  expect(ago("2026-10-16T11:59:40.000Z", now)).toBe("just now");
  expect(ago("2026-10-16T10:00:00.000Z", now)).toBe("2h ago");
  expect(ago("2026-10-13T12:00:00.000Z", now)).toBe("3d ago");
  expect(ago("2026-08-01T12:00:00.000Z", now)).toBe("Aug 1");
  expect(points(1)).toBe("1 Point");
  expect(points(5)).toBe("5 Points");
});
