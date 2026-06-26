import type { Page } from "playwright";
import { cleanChapterText } from "../../utils/cleanText.js";
import { fetchRenderedPage } from "../../crawler/fetchPage.js";
import { CRAWL_MODE, type ChapterContent, type NovelAdapter, type NovelPreview } from "../types.js";

/** Minimum cleaned chapter length treated as valid reader content. */
const MIN_VALID_CHAPTER_TEXT_LENGTH = 40;

/** Path segment used by obnovel book detail pages. */
const BOOK_PATH_SEGMENT = "/book";

/** Path segment used by obnovel reader pages. */
const READER_PATH_SEGMENT = "/reader";

/** Query parameter that stores the current chapter number. */
const CHAPTER_NUM_QUERY = "chapter_num";

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const getChapterNumFromUrl = (sourceUrl: string): number | undefined => {
  const chapterNum = new URL(sourceUrl).searchParams.get(CHAPTER_NUM_QUERY);
  if (!chapterNum) {
    return undefined;
  }

  const parsed = Number.parseInt(chapterNum, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const toReaderUrl = (sourceUrl: string): string => {
  const url = new URL(sourceUrl);
  url.pathname = url.pathname.replace(BOOK_PATH_SEGMENT, READER_PATH_SEGMENT);
  return url.toString();
};

const extractChapterContent = async (page: Page, chapterIndex: number): Promise<ChapterContent> => {
  const chapterTitle = normalizeText(
    (await page.locator(".reader-chapter-title").first().textContent().catch(() => "")) ?? "",
  );
  const rawContent = await page
    .locator(".reader-chapter-content")
    .first()
    .evaluate((element) => (element as HTMLElement).innerText)
    .catch(() => "");
  const content = cleanChapterText(rawContent);

  if (content.length < MIN_VALID_CHAPTER_TEXT_LENGTH) {
    throw new Error("Could not extract enough chapter text from the obnovel reader page");
  }

  return {
    chapter: {
      index: chapterIndex,
      title: chapterTitle ? `Chapter ${chapterTitle}` : `Chapter ${chapterIndex}`,
      url: page.url(),
    },
    content,
  };
};

export const obnovelAdapter: NovelAdapter = {
  id: "obnovel",
  crawlMode: CRAWL_MODE.SEQUENTIAL,

  canHandle(url: URL): boolean {
    return url.hostname === "obnovel.com" || url.hostname.endsWith(".obnovel.com");
  },

  async enterReader(page: Page, sourceUrl: string): Promise<void> {
    const readerUrl = toReaderUrl(sourceUrl);
    await fetchRenderedPage({ page, url: readerUrl });

    const startReadingButton = page.locator("button.book-detail-read-btn");
    if (await startReadingButton.isVisible().catch(() => false)) {
      await startReadingButton.click();
      await page.waitForURL(/\/reader/, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForSelector(".reader-chapter-content", { timeout: 15_000 });
    }
  },

  async extractNovelTitle(page: Page): Promise<string> {
    const readerTitle = normalizeText(
      (await page.locator(".reader-details-title").first().textContent().catch(() => "")) ?? "",
    );
    if (readerTitle) {
      return readerTitle;
    }

    const detailTitle = normalizeText(
      (await page.locator(".book-detail-title").first().textContent().catch(() => "")) ?? "",
    );
    if (detailTitle) {
      return detailTitle;
    }

    return normalizeText(await page.title()) || "Untitled Novel";
  },

  async extractPreview(page: Page, sourceUrl: string): Promise<NovelPreview> {
    await this.enterReader!(page, sourceUrl);

    return {
      title: await this.extractNovelTitle!(page),
      sourceUrl,
      crawlMode: CRAWL_MODE.SEQUENTIAL,
      startChapterNum: getChapterNumFromUrl(page.url()) ?? getChapterNumFromUrl(sourceUrl) ?? 1,
    };
  },

  async extractBookInfo(page: Page, sourceUrl: string): Promise<never> {
    void page;
    void sourceUrl;
    throw new Error("obnovel uses sequential crawling and does not expose a chapter catalog");
  },

  async extractCurrentChapter(page: Page, chapterIndex: number): Promise<ChapterContent> {
    return extractChapterContent(page, chapterIndex);
  },

  async goToNextChapter(page: Page): Promise<boolean> {
    const nextButton = page.locator("button.chapter-nav-next:not(.disabled)");
    const isVisible = await nextButton.isVisible().catch(() => false);

    if (!isVisible) {
      return false;
    }

    const previousUrl = page.url();
    await nextButton.click();
    await page.waitForFunction(
      (url) => window.location.href !== url,
      previousUrl,
      { timeout: 15_000 },
    ).catch(() => undefined);
    await page.waitForSelector(".reader-chapter-content", { timeout: 15_000 });

    return page.url() !== previousUrl;
  },

  async extractChapter(page: Page, chapter: { index: number }): Promise<ChapterContent> {
    return extractChapterContent(page, chapter.index);
  },
};
