const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A comment or composer description typed as plain text, as the HTML Rally stores (blank line = paragraph). */
export function textToHtml(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/).map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
}
