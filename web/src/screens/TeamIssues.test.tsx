import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeTeamLoad, serve } from "../test/fixtures";
import { TeamIssues } from "./TeamIssues";
import { expectRallyWords } from "../test/vocabulary";

beforeEach(async () => {
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});

test("an unknown team says it can't be found instead of loading forever", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/4040": [404, { error: "no such team" }] });
  await appStore.getState().load();
  render(<TeamIssues teamId={4040} tab="active" />);
  expect(await screen.findByText("Couldn't find this team.")).toBeInTheDocument();
  expect(screen.queryByText(/Loading/)).toBeNull();
});

test("a transient failure still offers Retry", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/4041": [502, { error: "rally down" }] });
  await appStore.getState().load();
  render(<TeamIssues teamId={4041} tab="active" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
  expect(screen.queryByText("Couldn't find this team.")).toBeNull();
});

test("the empty states and the team's tabs are in Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001": makeTeamLoad() });
  await appStore.getState().load();
  const { container } = render(<TeamIssues teamId={9001} tab="all" />);
  await screen.findByRole("option", { name: /Example story/ });
  expect(screen.getByRole("tab", { name: "All stories" })).toBeInTheDocument();
  expectRallyWords(container);
});

const EMPTY_TEXT = { active: /^No active stories: /, backlog: "The backlog is empty.", all: "This team has no stories." } as const;

test.each(["active", "backlog", "all"] as const)("the %s empty state reads in Rally's words", async (tab) => {
  serve({ "GET /api/bootstrap": makeBootstrap({ issues: [] }), "GET /api/teams/9001": makeTeamLoad({ issues: [] }),
    "GET /api/teams/9001/issues": { issues: [], next_cursor: null, cycles: [], projects: [], users: [] } });
  await appStore.getState().load();
  const { container } = render(<TeamIssues teamId={9001} tab={tab} />);
  expect(await screen.findByText(EMPTY_TEXT[tab])).toBeInTheDocument(); // the sentence itself, not just the tabs
  expectRallyWords(container);
});
