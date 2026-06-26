import { describe, expect, it } from "vitest";
import { selectChapters } from "../src/crawler/selectChapters.js";

const chapters = [
  { index: 1, title: "Chapter 1", url: "https://example.com/1" },
  { index: 2, title: "Chapter 2", url: "https://example.com/2" },
  { index: 3, title: "Chapter 3", url: "https://example.com/3" },
  { index: 4, title: "Chapter 4", url: "https://example.com/4" },
];

describe("selectChapters", () => {
  it("limits to the first N chapters", () => {
    expect(selectChapters(chapters, { limit: 2 })).toEqual(chapters.slice(0, 2));
  });

  it("selects an inclusive chapter range", () => {
    expect(selectChapters(chapters, { startChapter: 2, endChapter: 3 })).toEqual(chapters.slice(1, 3));
  });

  it("returns all chapters when no range is provided", () => {
    expect(selectChapters(chapters, {})).toEqual(chapters);
  });
});
