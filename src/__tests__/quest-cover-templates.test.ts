import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  QUEST_COVER_TEMPLATES,
  QUEST_COVER_TEMPLATE_CATEGORIES,
  findQuestCoverTemplateByUrl,
} from "@/lib/quest-cover-templates";

describe("quest cover templates manifest", () => {
  it("ships at least 16 templates spread across all four categories", () => {
    expect(QUEST_COVER_TEMPLATES.length).toBeGreaterThanOrEqual(16);
    const seenCategories = new Set(QUEST_COVER_TEMPLATES.map((t) => t.category));
    for (const c of QUEST_COVER_TEMPLATE_CATEGORIES) {
      expect(seenCategories.has(c)).toBe(true);
    }
  });

  it("has unique ids", () => {
    const ids = QUEST_COVER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template URL points to a real SVG file in /public", () => {
    for (const t of QUEST_COVER_TEMPLATES) {
      const path = join(process.cwd(), "public", t.url);
      expect(existsSync(path), `missing asset ${t.url}`).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content.startsWith("<svg")).toBe(true);
    }
  });

  it("findQuestCoverTemplateByUrl resolves known URLs and returns null for unknown", () => {
    const sample = QUEST_COVER_TEMPLATES[0];
    expect(findQuestCoverTemplateByUrl(sample.url)?.id).toBe(sample.id);
    expect(findQuestCoverTemplateByUrl("/nope.svg")).toBeNull();
    expect(findQuestCoverTemplateByUrl(null)).toBeNull();
    expect(findQuestCoverTemplateByUrl("")).toBeNull();
  });

  it("each SVG declares a 3:4 portrait viewBox to match the iOS quest card", () => {
    for (const t of QUEST_COVER_TEMPLATES) {
      const path = join(process.cwd(), "public", t.url);
      const content = readFileSync(path, "utf-8");
      // All templates ship at 600×800 (3:4) — checked literally so a template
      // that drifts off-aspect doesn't quietly slip in.
      expect(content, `${t.id} viewBox`).toMatch(/viewBox="0 0 600 800"/);
    }
  });
});
