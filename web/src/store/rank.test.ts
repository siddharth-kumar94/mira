import { expect, test } from "vitest";
import { byRank, rankBetween } from "./rank";

const between = (lo: string | null, hi: string | null, r: string | null) =>
  r !== null && (lo === null || lo < r) && (hi === null || r < hi) && [...r].every((c) => c >= " " && c <= "~");

test("a midpoint lands strictly between its neighbours", () => {
  expect(rankBetween("a", "c")).toBe("b");
  expect(between("a", "b", rankBetween("a", "b"))).toBe(true);
  expect(between("a", "a!", rankBetween("a", "a!"))).toBe(true);   // adjacent strings
  expect(between("O~~~", "O~~~~", rankBetween("O~~~", "O~~~~"))).toBe(true);
  expect(rankBetween(null, null)).toBe("O");
  expect(between("O~~", null, rankBetween("O~~", null))).toBe(true); // last place
  expect(between(null, "!", rankBetween(null, "!"))).toBe(true);     // first place
})

test("impossible requests return null", () => {
  expect(rankBetween("b", "a")).toBeNull();
  expect(rankBetween("a", "a")).toBeNull();
  expect(rankBetween(null, " ")).toBeNull(); // nothing printable sorts before a lone space
});

test("random neighbours always get a rank between them", () => {
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
  const word = () => Array.from({ length: 1 + rand(12) }, () => String.fromCharCode(33 + rand(94))).join("");
  for (let n = 0; n < 3000; n++) {
    const [lo, hi] = [word(), word()].sort();
    if (lo === hi) continue;
    expect(between(lo, hi, rankBetween(lo, hi)), `${lo} | ${hi}`).toBe(true);
    expect(between(lo, null, rankBetween(lo, null))).toBe(true);
    expect(between(null, hi, rankBetween(null, hi))).toBe(true);
  }
});

test("byRank sorts by code point, then id", () => {
  const xs = [{ id: 3, rank: "b" }, { id: 2, rank: "a" }, { id: 1, rank: "b" }, { id: 4, rank: "B" }];
  expect(xs.sort(byRank).map((x) => x.id)).toEqual([4, 2, 1, 3]);
});
