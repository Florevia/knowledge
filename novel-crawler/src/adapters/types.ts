import type { Page } from "playwright";

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

export interface NovelAdapter {
  id: string;
  canHandle(url: URL): boolean;
  extractBookInfo(page: Page, sourceUrl: string): Promise<BookInfo>;
  extractChapter(page: Page, chapter: ChapterLink): Promise<ChapterContent>;
}
