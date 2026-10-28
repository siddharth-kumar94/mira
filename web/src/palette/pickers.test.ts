import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { makeIssue, makeProject, readyStore } from "../test/fixtures";
import { pickerOptions } from "./pickers";

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-16T12:00:00.000Z"), toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

test("status and priority list Linear's values and skip issues that already have them", async () => {
  const { store } = await readyStore();
  const issue = store.getState().issues[1001];
  const status = pickerOptions("status", store.getState(), [issue]);
  expect(status.map((o) => [o.label, o.keys, o.current])).toEqual([
    ["Backlog", "1", false], ["Todo", "2", false], ["In Progress", "3", true], ["In Review", "4", false], ["Done", "5", false]]);
  expect(status[2].apply(issue)).toBeNull();
  expect(status[4].apply(issue)).toEqual({ status: "done" });
  expect(pickerOptions("priority", store.getState(), [issue]).map((o) => [o.label, o.keys, o.current])).toEqual([
    ["No priority", "0", false], ["Urgent", "1", false], ["High", "2", true], ["Medium", "3", false], ["Low", "4", false]]);
});

test("assignee: No assignee, you, then people by name", async () => {
  const { store } = await readyStore();
  const opts = pickerOptions("assignee", store.getState(), [store.getState().issues[1001]]);
  expect(opts.map((o) => [o.label, o.hint])).toEqual([["No assignee", undefined], ["Dana Demo", "You"], ["Sam Sample", undefined]]);
});

test("project: a selection across two teams lists no project, only that projects come from one team", async () => {
  const { store } = await readyStore();
  const s = store.getState();
  const opts = pickerOptions("project", s, [s.issues[1001], s.issues[1201]]);
  expect(opts.map((o) => [o.label, Boolean(o.disabled)])).toEqual([["Features from one team only", true]]);
  expect(opts[0].apply(s.issues[1001])).toBeNull();
  // One team: that team's projects only, never another team's.
  expect(pickerOptions("project", s, [s.issues[1001], s.issues[1002]]).map((o) => o.label)).toEqual(["[DEMO] Feature A"]);
});

test("project: the targets' teams' open projects; never for defects", async () => {
  const { store } = await readyStore();
  store.setState((s) => ({ projects: { ...s.projects, 203: makeProject({ id: 203, key: "F203", name: "Real demo-team project" }),
                                       204: makeProject({ id: 204, key: "F204", name: "[DEMO] Done", status_category: "completed" }) } }));
  const opts = pickerOptions("project", store.getState(), [store.getState().issues[1001]]);
  expect(opts.map((o) => [o.label, Boolean(o.disabled)])).toEqual([["[DEMO] Feature A", false], ["Real demo-team project", false]]);
  expect(opts[0].apply(makeIssue({ kind: "defect", project_id: null }))).toBeNull();
});

test("cycle: current and upcoming cycles of the targets' teams, plus No cycle", async () => {
  const { store } = await readyStore();
  const opts = pickerOptions("cycle", store.getState(), [store.getState().issues[1001]]);
  expect(opts.map((o) => [o.label, o.hint])).toEqual([["No sprint", undefined], ["PI 4 · Sprint 3", "Oct 8 – Oct 21 · Current"], ["PI 4 · Sprint 4", "Oct 22 – Nov 4 · Upcoming"]]);
  expect(opts[1].current).toBe(true);
  expect(opts[2].apply(store.getState().issues[1201])).toBeNull(); // another team's issue can't take this cycle
});

test("estimate: 1, 2, 3, 5, 8, 13, any odd value in use, then No estimate", async () => {
  const { store } = await readyStore();
  const opts = pickerOptions("estimate", store.getState(), [makeIssue({ estimate: 50 })]);
  expect(opts.map((o) => o.label)).toEqual(["No estimate", "1 Point", "2 Points", "3 Points", "5 Points", "8 Points", "13 Points", "50 Points"]);
});

test("labels add or remove", async () => {
  const { store } = await readyStore();
  const issue = makeIssue({ labels: ["collabathon-demo", "ux"] });
  const opts = pickerOptions("labels", store.getState(), [issue], ["PI4", "ux"]); // remote labels join the cached ones
  expect(opts.map((o) => o.label)).toEqual(["Add PI4", "Remove collabathon-demo", "Remove ux"]);
  expect(opts.every((o) => !o.disabled)).toBe(true);
  expect(opts[1].apply(issue)).toEqual({ labels: ["ux"] });
  expect(opts[2].apply(issue)).toEqual({ labels: ["collabathon-demo"] });
  expect(opts[0].apply(issue)).toEqual({ labels: ["collabathon-demo", "ux", "PI4"] });
});
