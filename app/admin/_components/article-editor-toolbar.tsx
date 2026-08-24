"use client";

import type { Editor } from "@tiptap/react";

type ToolbarAction = Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}>;

export function ArticleEditorToolbar({ editor }: Readonly<{ editor: Editor }>) {
  const link = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(
      "HTTP(S) or approved PREPPY path",
      previous ?? "",
    );
    if (href === null) return;
    if (href.trim() === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };
  const actions: readonly ToolbarAction[] = [
    {
      label: "Paragraph",
      active: editor.isActive("paragraph"),
      run: () => void editor.chain().focus().setParagraph().run(),
    },
    ...([2, 3, 4] as const).map((level) => ({
      label: `H${level}`,
      active: editor.isActive("heading", { level }),
      run: () => void editor.chain().focus().toggleHeading({ level }).run(),
    })),
    {
      label: "Bold",
      active: editor.isActive("bold"),
      run: () => void editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      active: editor.isActive("italic"),
      run: () => void editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      active: editor.isActive("underline"),
      run: () => void editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Strike",
      active: editor.isActive("strike"),
      run: () => void editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Bullets",
      active: editor.isActive("bulletList"),
      run: () => void editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbers",
      active: editor.isActive("orderedList"),
      run: () => void editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      active: editor.isActive("blockquote"),
      run: () => void editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code",
      active: editor.isActive("code"),
      run: () => void editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Code block",
      active: editor.isActive("codeBlock"),
      run: () => void editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Rule",
      run: () => void editor.chain().focus().setHorizontalRule().run(),
    },
    { label: "Link", active: editor.isActive("link"), run: link },
    {
      label: "Unlink",
      disabled: !editor.isActive("link"),
      run: () => void editor.chain().focus().unsetLink().run(),
    },
    {
      label: "Undo",
      disabled: !editor.can().chain().focus().undo().run(),
      run: () => void editor.chain().focus().undo().run(),
    },
    {
      label: "Redo",
      disabled: !editor.can().chain().focus().redo().run(),
      run: () => void editor.chain().focus().redo().run(),
    },
  ];

  return (
    <div
      className="admin-article-toolbar"
      role="toolbar"
      aria-label="Article formatting"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          aria-pressed={action.active ?? false}
          disabled={action.disabled}
          onClick={action.run}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
