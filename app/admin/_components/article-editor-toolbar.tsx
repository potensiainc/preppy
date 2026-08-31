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
      "HTTP(S) 주소나 허용된 PREPPY 경로를 입력해 주세요.",
      previous ?? "",
    );
    if (href === null) return;
    if (href.trim() === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };
  const actions: readonly ToolbarAction[] = [
    {
      label: "문단",
      active: editor.isActive("paragraph"),
      run: () => void editor.chain().focus().setParagraph().run(),
    },
    ...([2, 3, 4] as const).map((level) => ({
      label: `H${level}`,
      active: editor.isActive("heading", { level }),
      run: () => void editor.chain().focus().toggleHeading({ level }).run(),
    })),
    {
      label: "굵게",
      active: editor.isActive("bold"),
      run: () => void editor.chain().focus().toggleBold().run(),
    },
    {
      label: "기울임",
      active: editor.isActive("italic"),
      run: () => void editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "밑줄",
      active: editor.isActive("underline"),
      run: () => void editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: "취소선",
      active: editor.isActive("strike"),
      run: () => void editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "글머리 기호",
      active: editor.isActive("bulletList"),
      run: () => void editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "번호 목록",
      active: editor.isActive("orderedList"),
      run: () => void editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "인용문",
      active: editor.isActive("blockquote"),
      run: () => void editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "코드",
      active: editor.isActive("code"),
      run: () => void editor.chain().focus().toggleCode().run(),
    },
    {
      label: "코드 블록",
      active: editor.isActive("codeBlock"),
      run: () => void editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "구분선",
      run: () => void editor.chain().focus().setHorizontalRule().run(),
    },
    { label: "링크 추가", active: editor.isActive("link"), run: link },
    {
      label: "링크 제거",
      disabled: !editor.isActive("link"),
      run: () => void editor.chain().focus().unsetLink().run(),
    },
    {
      label: "실행 취소",
      disabled: !editor.can().chain().focus().undo().run(),
      run: () => void editor.chain().focus().undo().run(),
    },
    {
      label: "다시 실행",
      disabled: !editor.can().chain().focus().redo().run(),
      run: () => void editor.chain().focus().redo().run(),
    },
  ];

  return (
    <div
      className="admin-article-toolbar"
      role="toolbar"
      aria-label="아티클 서식"
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
