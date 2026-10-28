import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DescriptionEditor } from "./DescriptionEditor";

async function mounted(onSave = vi.fn(), html = "<p>Hello</p>") {
  const view = render(<DescriptionEditor html={html} onSave={onSave} />);
  const el = await screen.findByLabelText("Description");
  return { ...view, el, onSave };
}

/** Types into the real ProseMirror view: it listens for DOM mutations and parses them into a transaction. */
async function edit(el: HTMLElement) {
  await act(async () => {
    el.querySelector("p")!.textContent = "Hello edited";
    await new Promise((r) => setTimeout(r, 50));
  });
}

test("unmounting without editing does not save", async () => {
  const { unmount, onSave } = await mounted();
  unmount();
  expect(onSave).not.toHaveBeenCalled();
});

test("unmounting inside the debounce window saves the pending edit once", async () => {
  const { el, unmount, onSave } = await mounted();
  await edit(el);
  expect(onSave).not.toHaveBeenCalled();
  unmount();
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toContain("Hello edited");
});

test("a newer description from Rally while not dirty does not save", async () => {
  const { rerender, onSave } = await mounted();
  rerender(<DescriptionEditor html="<p>From Rally</p>" onSave={onSave} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByLabelText("Description").textContent).toContain("From Rally");
  expect(onSave).not.toHaveBeenCalled();
});
