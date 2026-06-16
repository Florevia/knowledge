/** Navigation and app chrome lines that should not be saved as novel content. */
const NOISE_LINE_PATTERNS = [
  /^previous chapter$/i,
  /^next chapter$/i,
  /^prev$/i,
  /^next$/i,
  /^back$/i,
  /^home$/i,
  /^library$/i,
  /^profile$/i,
  /^add to library$/i,
  /^favor$/i,
  /^reload$/i,
  /^go to home$/i,
];

/** Collapse excessive blank lines while preserving paragraph breaks. */
const MAX_CONSECUTIVE_BLANK_LINES = 1;

/**
 * Cleans raw chapter text extracted from H5 pages before writing it to TXT.
 */
export const cleanChapterText = (rawText: string): string => {
  const cleanedLines: string[] = [];
  let blankLineCount = 0;

  for (const rawLine of rawText.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();

    if (NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }

    if (!line) {
      blankLineCount += 1;
      if (blankLineCount <= MAX_CONSECUTIVE_BLANK_LINES) {
        cleanedLines.push("");
      }
      continue;
    }

    blankLineCount = 0;
    cleanedLines.push(line);
  }

  return cleanedLines.join("\n").replace(/^\n+|\n+$/g, "");
};
