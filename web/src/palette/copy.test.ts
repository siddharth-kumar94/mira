import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore } from "../store";
import { makeIssue } from "../test/fixtures";
import { copyIssueIds } from "./copy";

beforeEach(() => appStore.setState(appStore.getInitialState(), true));
afterEach(() => vi.unstubAllGlobals());

const toasts = () => appStore.getState().toasts.map((t) => t.message);

test("copying toasts on success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await copyIssueIds([makeIssue()]);
  expect(writeText).toHaveBeenCalledWith("US1001");
  expect(toasts()).toEqual(["Copied story ID"]);
});

test("copying toasts when the clipboard refuses", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  await copyIssueIds([makeIssue()]);
  expect(toasts()).toEqual(["Couldn't copy story ID"]);
});
