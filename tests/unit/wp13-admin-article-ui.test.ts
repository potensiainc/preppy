import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

async function source(file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8");
}

describe("WP-13 Admin Article editor UI contract", () => {
  it("uses the approved Admin-only StarterKit editor surface and bounded toolbar", async () => {
    const editor = await source("app/admin/_components/article-editor.tsx");
    const toolbar = await source(
      "app/admin/_components/article-editor-toolbar.tsx",
    );
    const combined = `${editor}\n${toolbar}`;
    expect(editor).toContain('"use client"');
    expect(editor).toContain("StarterKit.configure");
    expect(combined).toMatch(/@tiptap\/react/);
    expect(combined).toMatch(/@tiptap\/starter-kit/);
    expect(combined).not.toMatch(
      /extension-image|extension-table|Collaboration|autosave/i,
    );
    for (const command of [
      "setParagraph",
      "toggleHeading",
      "toggleBold",
      "toggleItalic",
      "toggleUnderline",
      "toggleStrike",
      "toggleBulletList",
      "toggleOrderedList",
      "toggleBlockquote",
      "toggleCode",
      "toggleCodeBlock",
      "setHorizontalRule",
      "setLink",
      "unsetLink",
      "undo",
      "redo",
    ])
      expect(combined).toContain(command);
    expect(combined).not.toMatch(
      /level:\s*1|setImage|insertTable|youtube|video/i,
    );
  });

  it("keeps sanitized initial HTML and explicit visual/source synchronization", async () => {
    const editor = await source("app/admin/_components/article-editor.tsx");
    expect(editor).toContain("initialSanitizedContentHtml");
    expect(editor).toContain("editor.getHTML()");
    expect(editor).toContain(
      "editor.commands.setContent(sourceHtml, { emitUpdate: true })",
    );
    expect(editor).toContain("server may remove unsafe markup");
    expect(editor).not.toMatch(/iframe|dangerouslySetInnerHTML/);
  });

  it("submits only candidates/expected tokens and keeps lifecycle actions explicit", async () => {
    const editor = await source("app/admin/_components/article-editor.tsx");
    const lifecycle = await source(
      "app/admin/_components/article-lifecycle-actions.tsx",
    );
    const relations = await source(
      "app/admin/_components/article-relations.tsx",
    );
    expect(editor).toContain("Publish Changes");
    expect(editor).toContain("Publish Article");
    expect(editor).toContain("Save Draft");
    expect(lifecycle).toContain("Unpublish");
    expect(lifecycle).toContain("Archive");
    expect(lifecycle).toContain("Change slug");
    expect(lifecycle).toContain("window.confirm");
    expect(lifecycle).toContain("onUpdated(payload.data.updatedAt)");
    expect(relations).toContain(
      'label === "Opportunity" ? "Opportunities" : "Institutions"',
    );
    expect(`${editor}\n${relations}\n${lifecycle}`).toContain(
      "다른 운영자가 먼저 변경했을 수 있습니다.",
    );
    expect(`${editor}\n${relations}\n${lifecycle}`).not.toMatch(
      /authorAdminId|publishedAt|unpublishedAt|archivedAt|contentFingerprint|eventType|currentCanonicalPath|previousCanonicalPath|emitCustomerOutbox/,
    );
  });

  it("shows stale guidance before the operator explicitly reloads current data", async () => {
    const editor = await source("app/admin/_components/article-editor.tsx");
    const lifecycle = await source(
      "app/admin/_components/article-lifecycle-actions.tsx",
    );
    const relations = await source(
      "app/admin/_components/article-relations.tsx",
    );
    const combined = `${editor}\n${lifecycle}\n${relations}`;
    expect(editor).toContain("Reload latest data");
    expect(lifecycle).toContain("Reload latest data");
    expect(relations).toContain("Reload latest data");
    expect(combined).toContain("response.status === 409");
    expect(combined).not.toMatch(
      /response\.status === 409[^}]+window\.location\.reload\(\)/s,
    );
  });

  it("keeps Tiptap imports out of public runtime modules", async () => {
    const publicArticle = await source("app/(public)/articles/[slug]/page.tsx");
    const prose = await source("app/_components/article-prose.tsx");
    expect(`${publicArticle}\n${prose}`).not.toContain("@tiptap");
  });
});
