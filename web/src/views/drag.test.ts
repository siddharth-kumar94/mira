import type { DroppableContainer } from "@dnd-kit/core";
import { expect, test } from "vitest";
import type { Issue } from "../api/types";
import { makeIssue, SPRINT3, SPRINT3_AIML, SPRINT4 } from "../test/fixtures";
import { collisionDetection, FOCUS_HINT, REORDER_HINT, resolveDrop, type Drop, type DropResult } from "./drag";
import type { Group } from "./model";
import type { FilterValue, GroupBy } from "./types";

const group = (field: GroupBy, key: string, value: FilterValue, issues: Issue[] = [], cycleIds: number[] = []): Group =>
  ({ key, label: key, field, value, cycleIds, cycle: null, teamId: null, issues });
const a = makeIssue({ id: 1 });
const b = makeIssue({ id: 2 });
const c = makeIssue({ id: 3 });
const progress = group("status", "in_progress", "in_progress", [a, b, c]);
const cycles = { 301: SPRINT3, 302: SPRINT4, 401: SPRINT3_AIML };
const drop = (over: Partial<Drop>): DropResult =>
  resolveDrop({ issue: a, from: progress, to: progress, overId: null, orderBy: "manual", cycles, ...over });

test("dropping into another group sets that group's property", () => {
  expect(drop({ to: group("status", "done", "done") }).patch).toEqual({ status: "done" });
  expect(drop({ from: group("assignee", "u501", 501), to: group("assignee", "none", null) }).patch).toEqual({ assignee_id: null });
  expect(drop({ from: group("priority", "p2", 2), to: group("priority", "p1", 1) }).patch).toEqual({ priority: 1 });
  expect(drop({ from: group("project", "pr201", 201), to: group("project", "pr202", 202) }).patch).toEqual({ project_id: 202 });
});

test("drops that can't be written say why instead", () => {
  expect(drop({ from: group("project", "pr201", 201), to: group("project", "none", null) }).hint).toBe("Stories need a feature");
  const defect = makeIssue({ id: 9, kind: "defect", project_id: null });
  expect(drop({ issue: defect, from: group("project", "none", null), to: group("project", "pr201", 201) }).hint)
    .toBe("Defects can't belong to a feature");
});

test("a merged cycle group picks the cycle of the issue's own team", () => {
  const merged = group("cycle", "sprint3", 301, [], [301, 401]);
  const aiml = makeIssue({ id: 7, team_id: 9002 });
  expect(drop({ issue: aiml, from: group("cycle", "none", null), to: merged }).patch).toEqual({ cycle_id: 401 });
  expect(drop({ issue: aiml, from: group("cycle", "none", null), to: group("cycle", "sprint4", 302, [], [302]) }).hint)
    .toBe("That sprint isn't in this story's team");
  expect(drop({ from: merged, to: group("cycle", "none", null) }).patch).toEqual({ cycle_id: null });
});

test("between rows of one group: ranks when ordered manually, explains otherwise", () => {
  expect(drop({ overId: 3 }).rank).toEqual({ below: 3 });           // moving down lands below the row
  expect(drop({ issue: c, overId: 1 }).rank).toEqual({ above: 1 }); // moving up lands above it
  expect(drop({ overId: 3, orderBy: "priority" })).toEqual({ patch: null, rank: null, hint: REORDER_HINT });
  expect(drop({ overId: 1 })).toEqual({ patch: null, rank: null, hint: null }); // dropped on itself
});

test("onto a row of another group: sets the property, and lands above that row when manual", () => {
  const todo = group("status", "todo", "todo", [makeIssue({ id: 5 })]);
  expect(drop({ to: todo, overId: 5 })).toEqual({ patch: { status: "todo" }, rank: { above: 5 }, hint: null });
  expect(drop({ to: todo, overId: 5, orderBy: "updated" })).toEqual({ patch: { status: "todo" }, rank: null, hint: null });
});

// A group section holding two rows, with the pointer at the group's vertical centre (between the rows' centres).
const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 200, width: 200, height });
type Rect = ReturnType<typeof rect>;
const droppable = (id: string | number) => ({ id }) as unknown as DroppableContainer;
const detect = (pointer: { x: number; y: number } | null, containers: DroppableContainer[], rects: Record<string, Rect>) =>
  collisionDetection({
    active: { id: 99 } as never, collisionRect: rect(80, 40) as never, // the dragged card, centred on the group's centre
    droppableRects: new Map(Object.entries(rects).map(([id, r]) => [Number.isNaN(Number(id)) ? id : Number(id), r])) as never,
    droppableContainers: containers, pointerCoordinates: pointer,
  }).map((x) => x.id);
const list = { "group:todo": rect(0, 200), 1: rect(0, 40), 2: rect(160, 40) };
const all = [droppable("group:todo"), droppable(1), droppable(2)];

test("over a row the row wins, even where the group's centre is nearer", () => {
  expect(detect({ x: 50, y: 20 }, all, list)[0]).toBe(1);
  expect(detect({ x: 50, y: 180 }, all, list)[0]).toBe(2);
});

test("between rows the group is the target, and an empty group still takes the drop", () => {
  expect(detect({ x: 50, y: 100 }, all, list)).toEqual(["group:todo"]);
  expect(detect({ x: 50, y: 100 }, [droppable("group:empty")], { "group:empty": rect(0, 200) })).toEqual(["group:empty"]);
});

test("without a pointer (keyboard) the closest row is used, never a group", () => {
  expect(detect(null, all, list)[0]).toBe(1);
});

test("Focus groups are not drop targets and don't reorder", () => {
  const urgent = group("focus", "f:urgent", null, [a]);
  const other = group("focus", "f:active", null, [b, c]);
  expect(drop({ from: urgent, to: other, orderBy: "importance" }).hint).toBe(FOCUS_HINT);
  expect(drop({ issue: b, from: other, to: other, overId: 3, orderBy: "importance" }).hint).toBe(FOCUS_HINT);
  expect(drop({ issue: b, from: other, to: other, overId: 2, orderBy: "importance" })).toEqual({ patch: null, rank: null, hint: null });
});
