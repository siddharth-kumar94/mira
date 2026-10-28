import { Cheatsheet } from "./components/Cheatsheet";
import { Composer } from "./components/Composer";
import { RowMenu } from "./components/RowMenu";
import { Toasts } from "./components/Toasts";
import { PeekCard } from "./issue/PeekCard";
import { CommandPalette } from "./palette/CommandPalette";

export function Overlays() {
  return (
    <>
      <PeekCard />
      <CommandPalette />
      <Composer />
      <RowMenu />
      <Cheatsheet />
      <Toasts />
    </>
  );
}
