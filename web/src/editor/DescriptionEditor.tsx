import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { editableInline, sanitize } from "./sanitize";

const SAVE_AFTER_MS = 1000;

/** Saves only after the user actually edits, so an untouched Rally description is never re-serialized. */
export function DescriptionEditor({ html, onSave }: { html: string; onSave(html: string): void }) {
  const clean = useMemo(() => sanitize(html), [html]);
  const editable = editableInline(clean);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = (value: string) => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onSaveRef.current(sanitize(value));
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: clean,
    editable,
    editorProps: {
      attributes: { class: "prose-rally min-h-24 py-2 text-regular text-ink-2 outline-none", "aria-label": "Description" },
    },
    onUpdate: ({ editor: e }) => {
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(e.getHTML()), SAVE_AFTER_MS);
    },
    onBlur: ({ editor: e }) => flush(e.getHTML()),
  });

  // A newer description from Rally (a poll) replaces the content unless the user is mid-edit.
  useEffect(() => {
    if (editor && !editor.isFocused && !dirty.current) editor.commands.setContent(clean, { emitUpdate: false });
  }, [clean, editor]);
  const editorRef = useRef(editor);
  useLayoutEffect(() => {
    editorRef.current = editor;
  });
  // Unmount (Escape, navigation, another issue): save a pending edit instead of dropping it.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const e = editorRef.current;
      if (dirty.current && e && !e.isDestroyed) {
        dirty.current = false;
        onSaveRef.current(sanitize(e.getHTML()));
      }
    },
    [],
  );

  return (
    <div>
      <EditorContent editor={editor} />
      {!editable && <p className="text-mini text-ink-3">This description has a table or image. Edit it in Rally.</p>}
    </div>
  );
}
