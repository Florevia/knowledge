import { describe, expect, it } from "vitest";
import { createSafeFilename } from "../src/utils/filename.js";

describe("createSafeFilename", () => {
  it("keeps readable unicode while removing path separators and illegal characters", () => {
    expect(createSafeFilename("  霸总/Novel: A*Story?  ")).toBe("霸总_Novel_ A_Story");
  });

  it("falls back when title has no usable characters", () => {
    expect(createSafeFilename("///:::")).toBe("untitled");
  });
});
