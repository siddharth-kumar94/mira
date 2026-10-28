import DOMPurify from "dompurify";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Rally descriptions are HTML written by anyone with edit rights. Sanitize before rendering or editing. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
    FORBID_ATTR: ["style"],
  });
}

/** TipTap's StarterKit has no tables or images; editing such a description would silently drop them (spec assumption 7). */
export function editableInline(html: string): boolean {
  return !/<(table|img)\b/i.test(html);
}
