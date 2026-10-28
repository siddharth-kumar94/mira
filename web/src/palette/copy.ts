import type { Issue } from "../api/types";
import { appStore } from "../store";

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    appStore.getState().pushToast(`Copied ${what}`);
  } catch {
    appStore.getState().pushToast(`Couldn't copy ${what}`);
  }
}

export const issueUrl = (key: string) => `${window.location.origin}/issue/${key}`;
export const copyIssueIds = (xs: Issue[]) => copy(xs.map((i) => i.key).join(", "), xs.length > 1 ? "story IDs" : "story ID");
export const copyIssueUrls = (xs: Issue[]) => copy(xs.map((i) => issueUrl(i.key)).join("\n"), xs.length > 1 ? "story URLs" : "story URL");
export const copyIssueTitles = (xs: Issue[]) => copy(xs.map((i) => i.title).join("\n"), xs.length > 1 ? "story titles" : "story title");
/** The header's "Copy page URL" (project and initiative pages): the address as it is, tab included. */
export const copyPageUrl = () => copy(window.location.href, "page URL");
