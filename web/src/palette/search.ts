import type { Issue } from "../api/types";

/** Local ⌘K matches: exact key, key prefix, title prefix, then anywhere. */
export function searchIssues(issues: Record<number, Issue>, query: string, limit = 8): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (i: Issue) => {
    const key = i.key.toLowerCase();
    const title = i.title.toLowerCase();
    if (key === q) return 0;
    if (key.startsWith(q)) return 1;
    if (title.startsWith(q)) return 2;
    return title.includes(q) || key.includes(q) ? 3 : -1;
  };
  return Object.values(issues)
    .map((i) => [score(i), i] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].key.localeCompare(b[1].key))
    .slice(0, limit)
    .map(([, i]) => i);
}
