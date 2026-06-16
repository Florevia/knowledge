import { describe, expect, it } from "vitest";
import { cleanChapterText } from "../src/utils/cleanText.js";

describe("cleanChapterText", () => {
  it("removes navigation and normalizes repeated blank lines", () => {
    const rawText = [
      "Previous Chapter",
      "Chapter 1",
      "",
      "  The first paragraph.  ",
      "",
      "",
      "Next Chapter",
      "Add to Library",
      "The second paragraph.",
    ].join("\n");

    expect(cleanChapterText(rawText)).toBe(
      ["Chapter 1", "", "The first paragraph.", "", "The second paragraph."].join("\n"),
    );
  });
});
