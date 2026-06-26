import type { Page } from "playwright";
import type { NovelAdapter } from "../adapters/types.js";
import { CRAWL_MODE } from "../adapters/types.js";
import type { NovelChapterContent } from "../output/txtWriter.js";
import { fetchRenderedPage } from "./fetchPage.js";
import { retry } from "./retry.js";
import { throttle } from "./throttle.js";

export interface SequentialCrawlOptions {
  sourceUrl: string;
  /** Number of chapters to crawl in this run. */
  chapterCount: number;
  /** Skip this many chapters before collecting content. */
  skipChapters?: number;
  delayMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  onProgress?: (progress: { completedChapters: number; totalChapters: number }) => void;
}

export interface SequentialCrawlResult {
  title: string;
  author?: string;
  sourceUrl: string;
  chapters: NovelChapterContent[];
  failedChapters: Array<{
    index: number;
    title: string;
    url: string;
    error: string;
  }>;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const assertSequentialAdapter = (adapter: NovelAdapter): void => {
  if (
    adapter.crawlMode !== CRAWL_MODE.SEQUENTIAL
    || !adapter.enterReader
    || !adapter.extractNovelTitle
    || !adapter.extractCurrentChapter
    || !adapter.goToNextChapter
  ) {
    throw new Error(`Adapter "${adapter.id}" does not support sequential crawling`);
  }
};

/**
 * Crawls chapters one-by-one via next-chapter navigation without preloading a catalog.
 */
export const crawlSequential = async (
  adapter: NovelAdapter,
  page: Page,
  options: SequentialCrawlOptions,
): Promise<SequentialCrawlResult> => {
  assertSequentialAdapter(adapter);

  const skipChapters = options.skipChapters ?? 0;
  const chapters: NovelChapterContent[] = [];
  const failedChapters: SequentialCrawlResult["failedChapters"] = [];

  await retry(
    async () => {
      await adapter.enterReader!(page, options.sourceUrl);
    },
    { attempts: options.retryAttempts, delayMs: options.retryDelayMs },
  );

  const title = await adapter.extractNovelTitle!(page);
  options.onProgress?.({ completedChapters: 0, totalChapters: options.chapterCount });

  for (let skipped = 0; skipped < skipChapters; skipped += 1) {
    await throttle({ delayMs: options.delayMs });
    const hasNext = await adapter.goToNextChapter!(page);

    if (!hasNext) {
      throw new Error(`Cannot skip ${skipChapters} chapters; reached end of book at chapter ${skipped + 1}`);
    }
  }

  for (let collected = 0; collected < options.chapterCount; collected += 1) {
    const chapterIndex = skipChapters + collected + 1;

    try {
      const extractedChapter = await retry(
        async () => adapter.extractCurrentChapter!(page, chapterIndex),
        { attempts: options.retryAttempts, delayMs: options.retryDelayMs },
      );

      chapters.push({
        index: chapterIndex,
        title: extractedChapter.chapter.title,
        url: extractedChapter.chapter.url,
        content: extractedChapter.content,
      });
      options.onProgress?.({
        completedChapters: chapters.length,
        totalChapters: options.chapterCount,
      });
    } catch (error) {
      failedChapters.push({
        index: chapterIndex,
        title: `Chapter ${chapterIndex}`,
        url: page.url(),
        error: getErrorMessage(error),
      });
    }

    if (collected < options.chapterCount - 1) {
      await throttle({ delayMs: options.delayMs });

      const hasNext = await adapter.goToNextChapter!(page);
      if (!hasNext) {
        break;
      }
    }
  }

  return {
    title,
    sourceUrl: options.sourceUrl,
    chapters,
    failedChapters,
  };
};
