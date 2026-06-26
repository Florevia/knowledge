import type { ChapterLink } from "../adapters/types.js";

export interface ChapterRangeOptions {
  /** Crawl only the first N chapters. */
  limit?: number;
  /** Inclusive start chapter index (1-based). */
  startChapter?: number;
  /** Inclusive end chapter index (1-based). */
  endChapter?: number;
}

/**
 * Selects chapters according to limit or inclusive index range.
 */
export const selectChapters = (
  chapters: ChapterLink[],
  options: ChapterRangeOptions,
): ChapterLink[] => {
  if (options.startChapter !== undefined || options.endChapter !== undefined) {
    const start = options.startChapter ?? 1;
    const end = options.endChapter ?? chapters.length;

    return chapters.filter((chapter) => chapter.index >= start && chapter.index <= end);
  }

  if (options.limit !== undefined) {
    return chapters.slice(0, options.limit);
  }

  return chapters;
};
