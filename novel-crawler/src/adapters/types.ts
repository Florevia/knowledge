import type { Page } from "playwright";

/** Adapter strategy for discovering chapters on a site. */
export const CRAWL_MODE = {
  /** Crawl a pre-built chapter URL list (catalog pages). */
  LIST: "list",
  /** Crawl chapters sequentially via next-chapter navigation. */
  SEQUENTIAL: "sequential",
} as const;

export type CrawlMode = (typeof CRAWL_MODE)[keyof typeof CRAWL_MODE];

export interface ChapterLink {
  index: number;
  title: string;
  url: string;
}

export interface BookInfo {
  title: string;
  author?: string;
  sourceUrl: string;
  chapters: ChapterLink[];
}

export interface ChapterContent {
  chapter: ChapterLink;
  content: string;
}

export interface NovelPreview {
  title: string;
  author?: string;
  sourceUrl: string;
  crawlMode: CrawlMode;
  /** Starting chapter number inferred from the URL, when available. */
  startChapterNum?: number;
}

export interface NovelAdapter {
  id: string;
  crawlMode: CrawlMode;
  canHandle(url: URL): boolean;
  extractBookInfo(page: Page, sourceUrl: string): Promise<BookInfo>;
  extractChapter(page: Page, chapter: ChapterLink): Promise<ChapterContent>;
  extractPreview?(page: Page, sourceUrl: string): Promise<NovelPreview>;
  enterReader?(page: Page, sourceUrl: string): Promise<void>;
  extractNovelTitle?(page: Page): Promise<string>;
  extractCurrentChapter?(page: Page, chapterIndex: number): Promise<ChapterContent>;
  goToNextChapter?(page: Page): Promise<boolean>;
}
