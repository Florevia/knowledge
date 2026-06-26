import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { getAdapterForUrl } from "../adapters/registry.js";
import { CRAWL_MODE } from "../adapters/types.js";
import type { ChapterLink } from "../adapters/types.js";
import {
  DEFAULT_DELAY_MS,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_USER_AGENT,
} from "../config.js";
import { loadCheckpoint, saveCheckpoint } from "../output/checkpoint.js";
import type { NovelChapterContent } from "../output/txtWriter.js";
import { writeNovelTxt } from "../output/txtWriter.js";
import { createSafeFilename } from "../utils/filename.js";
import { crawlSequential } from "./crawlSequential.js";
import { fetchRenderedPage } from "./fetchPage.js";
import { retry } from "./retry.js";
import { selectChapters, type ChapterRangeOptions } from "./selectChapters.js";
import { throttle } from "./throttle.js";

export interface CrawlNovelOptions extends ChapterRangeOptions {
  sourceUrl: string;
  outputDir?: string;
  delayMs?: number;
  headful?: boolean;
  /** Sequential mode: number of chapters to crawl in this run. */
  chapterCount?: number;
  /** Sequential mode: skip this many chapters before collecting. */
  skipChapters?: number;
  onProgress?: (progress: { completedChapters: number; totalChapters: number }) => void;
}

export interface CrawlNovelResult {
  title: string;
  filePath: string;
  checkpointDir: string;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const hasCompletedChapter = (chapters: NovelChapterContent[], chapter: ChapterLink): boolean => {
  return chapters.some((completedChapter) => completedChapter.index === chapter.index && completedChapter.url === chapter.url);
};

const resolveSequentialChapterCount = (options: CrawlNovelOptions): number => {
  if (options.chapterCount !== undefined) {
    return options.chapterCount;
  }

  if (options.limit !== undefined) {
    return options.limit;
  }

  if (options.startChapter !== undefined || options.endChapter !== undefined) {
    const start = options.startChapter ?? 1;
    const end = options.endChapter ?? start;
    return end - start + 1;
  }

  return 1;
};

const crawlListMode = async (
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  options: CrawlNovelOptions,
  outputDir: string,
  delayMs: number,
): Promise<CrawlNovelResult> => {
  const adapter = getAdapterForUrl(options.sourceUrl);

  const bookInfo = await retry(
    async () => {
      await fetchRenderedPage({ page, url: options.sourceUrl });
      return adapter.extractBookInfo(page, options.sourceUrl);
    },
    { attempts: DEFAULT_RETRY_ATTEMPTS, delayMs: DEFAULT_RETRY_DELAY_MS },
  );
  const bookId = `${adapter.id}-${createSafeFilename(bookInfo.title)}`;
  const checkpoint = await loadCheckpoint(outputDir, bookId, options.sourceUrl);
  const chapters = selectChapters(bookInfo.chapters, options);

  checkpoint.failedChapters = [];
  options.onProgress?.({ completedChapters: 0, totalChapters: chapters.length });

  for (const chapter of chapters) {
    if (hasCompletedChapter(checkpoint.completedChapters, chapter)) {
      continue;
    }

    try {
      await throttle({ delayMs });

      const chapterContent = await retry(
        async () => {
          await fetchRenderedPage({ page, url: chapter.url });
          const extractedChapter = await adapter.extractChapter(page, chapter);

          return {
            index: chapter.index,
            title: extractedChapter.chapter.title,
            url: extractedChapter.chapter.url,
            content: extractedChapter.content,
          };
        },
        { attempts: DEFAULT_RETRY_ATTEMPTS, delayMs: DEFAULT_RETRY_DELAY_MS },
      );

      checkpoint.completedChapters.push(chapterContent);
      await saveCheckpoint(outputDir, checkpoint);
      options.onProgress?.({
        completedChapters: checkpoint.completedChapters.length,
        totalChapters: chapters.length,
      });
    } catch (error) {
      checkpoint.failedChapters.push({
        index: chapter.index,
        title: chapter.title,
        url: chapter.url,
        error: getErrorMessage(error),
      });
      await saveCheckpoint(outputDir, checkpoint);
    }
  }

  const writeResult = await writeNovelTxt({
    outputDir,
    novel: {
      title: bookInfo.title,
      author: bookInfo.author,
      sourceUrl: bookInfo.sourceUrl,
      chapters: checkpoint.completedChapters,
    },
  });

  return {
    title: bookInfo.title,
    filePath: writeResult.filePath,
    checkpointDir: join(outputDir, ".checkpoints"),
    totalChapters: chapters.length,
    completedChapters: checkpoint.completedChapters.length,
    failedChapters: checkpoint.failedChapters.length,
  };
};

const crawlSequentialMode = async (
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  options: CrawlNovelOptions,
  outputDir: string,
  delayMs: number,
): Promise<CrawlNovelResult> => {
  const adapter = getAdapterForUrl(options.sourceUrl);
  const chapterCount = resolveSequentialChapterCount(options);
  const bookId = `${adapter.id}-${createSafeFilename(options.sourceUrl)}`;
  const checkpoint = await loadCheckpoint(outputDir, bookId, options.sourceUrl);

  const sequentialResult = await crawlSequential(adapter, page, {
    sourceUrl: options.sourceUrl,
    chapterCount,
    skipChapters: options.skipChapters,
    delayMs,
    retryAttempts: DEFAULT_RETRY_ATTEMPTS,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    onProgress: options.onProgress,
  });

  checkpoint.completedChapters = sequentialResult.chapters;
  checkpoint.failedChapters = sequentialResult.failedChapters;
  await saveCheckpoint(outputDir, checkpoint);

  const writeResult = await writeNovelTxt({
    outputDir,
    novel: {
      title: sequentialResult.title,
      author: sequentialResult.author,
      sourceUrl: sequentialResult.sourceUrl,
      chapters: sequentialResult.chapters,
    },
  });

  return {
    title: sequentialResult.title,
    filePath: writeResult.filePath,
    checkpointDir: join(outputDir, ".checkpoints"),
    totalChapters: chapterCount,
    completedChapters: sequentialResult.chapters.length,
    failedChapters: sequentialResult.failedChapters.length,
  };
};

/**
 * Crawls a single novel from a detail or chapter URL and writes a TXT file.
 */
export const crawlNovel = async (options: CrawlNovelOptions): Promise<CrawlNovelResult> => {
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const adapter = getAdapterForUrl(options.sourceUrl);
  const browser = await chromium.launch({ headless: !options.headful });

  try {
    const context = await browser.newContext({
      isMobile: true,
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    if (adapter.crawlMode === CRAWL_MODE.SEQUENTIAL) {
      return await crawlSequentialMode(page, options, outputDir, delayMs);
    }

    return await crawlListMode(page, options, outputDir, delayMs);
  } finally {
    await browser.close();
  }
};
