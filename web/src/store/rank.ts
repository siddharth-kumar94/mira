/** Rally's DragAndDropRank strings: printable ASCII, ordered by code point (spec D11, verified on real data). */
const MIN = 32; // " "
const MAX = 126; // "~"

/**
 * A rank strictly between `lo` and `hi` (null means no bound), for placing a dropped issue before the server
 * answers. Returns null when no printable string fits; the caller then waits for the server's rank.
 */
export function rankBetween(lo: string | null, hi: string | null): string | null {
  if (lo !== null && hi !== null && lo >= hi) return null;
  let out = "";
  let onLo = lo !== null; // out is still equal to lo's prefix
  let onHi = hi !== null; // out is still equal to hi's prefix
  for (let i = 0; i < 512; i++) {
    if (onHi && i >= hi!.length) return null; // out would equal hi: no room below it on this path
    const a = onLo && i < lo!.length ? lo!.charCodeAt(i) : MIN - 1;
    const b = onHi ? hi!.charCodeAt(i) : MAX + 1;
    if (b - a >= 2) return out + String.fromCharCode(Math.floor((a + b) / 2));
    if (a >= MIN) {
      out += String.fromCharCode(a); // keep lo's character and look one place deeper
      onHi = onHi && a === b;
    } else {
      out += String.fromCharCode(b); // lo has ended and hi's character is the lowest printable one
      onLo = false;
    }
  }
  return null;
}

export function byRank(a: { rank: string; id: number }, b: { rank: string; id: number }): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return a.id - b.id;
}
