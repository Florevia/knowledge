import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeNovelTxt } from "../src/output/txtWriter.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  createdDirs.length = 0;
});

describe("writeNovelTxt", () => {
  it("writes novel metadata and ordered chapters into a txt file", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "novel-crawler-"));
    createdDirs.push(outputDir);

    const result = await writeNovelTxt({
      outputDir,
      novel: {
        title: "Test Novel",
        sourceUrl: "https://example.com/book/1",
        chapters: [
          { index: 1, title: "Chapter 1", url: "https://example.com/1", content: "Hello" },
          { index: 2, title: "Chapter 2", url: "https://example.com/2", content: "World" },
        ],
      },
    });

    const content = await readFile(result.filePath, "utf8");

    expect(result.filePath.endsWith("Test Novel.txt")).toBe(true);
    expect(content).toContain("Title: Test Novel");
    expect(content).toContain("Source: https://example.com/book/1");
    expect(content).toContain("Chapter 1\n\nHello");
    expect(content).toContain("Chapter 2\n\nWorld");
  });
});
