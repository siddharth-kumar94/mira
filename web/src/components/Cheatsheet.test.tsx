import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { Cheatsheet } from "./Cheatsheet";

beforeEach(() => uiStore.setState(uiStore.getInitialState(), true));

test("the shortcuts cheatsheet is in Rally's words", () => {
  uiStore.getState().setCheatsheet(true);
  const { container } = render(<Cheatsheet />);
  for (const text of ["Create story", "Feature", "Sprint", "My stories", "Features", "Capabilities"]) expect(screen.getByText(text)).toBeInTheDocument();
  expectRallyWords(container);
});
