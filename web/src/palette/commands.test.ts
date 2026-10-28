import { beforeEach, expect, test } from "vitest";
import { appStore } from "../store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { buildCommands } from "./commands";

beforeEach(() => appStore.setState({ ...appStore.getInitialState(), meta: { me: { id: 501, name: "Dana Demo" }, workspace: { id: 1, name: "W" },
  writeGuard: "demo", demoPrefix: "[DEMO] ", demoTag: "collabathon-demo", demoTeamId: 9001,
  projectPriority: false, initiativePriority: false } }, true));

test("contextual commands follow Linear's order, with no heading, and their keycaps", () => {
  const cmds = buildCommands({ targets: [makeIssue()], teams: [] }).filter((c) => c.group === null);
  expect(cmds.map((c) => [c.label, c.shortcut])).toEqual([
    ["Assign to…", "A"], ["Un-assign from me", "I"], ["Change status…", "S"], ["Change priority…", "P"], ["Move to feature…", "⇧ P"],
    ["Add labels…", "L"], ["Change estimate…", "⇧ E"], ["Move to sprint…", "⇧ C"], ["Mark as blocked", undefined],
    ["Copy story ID", "⌘ ."], ["Copy story URL", undefined], ["Copy story title", undefined], ["Open story", "Enter"],
  ]);
  expect(cmds.every((c) => c.icon)).toBe(true);
});

test("Assign to me when it isn't yours; navigation and Mira's own commands keep their groups", () => {
  const cmds = buildCommands({ targets: [makeIssue({ assignee: null })], teams: makeBootstrap().teams });
  expect(cmds.find((c) => c.id === "assign-me")?.label).toBe("Assign to me");
  expect([...new Set(cmds.map((c) => c.group))]).toEqual([null, "Navigation", "Mira"]);
});
