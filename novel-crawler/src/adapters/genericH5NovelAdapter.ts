import type { Page } from "playwright";
import { cleanChapterText } from "../utils/cleanText.js";
import type { BookInfo, ChapterContent, ChapterLink, NovelAdapter } from "./types.js";

export interface GenericAdapterOptions {
  id: string;
  hosts?: string[];
  titleSelectors?: string[];
  authorSelectors?: string[];
  chapterLinkSelectors?: string[];
  contentSelectors?: string[];
}

/** Minimum text length for a DOM block to be considered chapter content. */
const MIN_CONTENT_TEXT_LENGTH = 120;

/** Minimum cleaned chapter length that can be treated as a successful extraction. */
const MIN_VALID_CHAPTER_TEXT_LENGTH = 40;

/** Default selectors commonly found on mobile H5 novel pages. */
const DEFAULT_TITLE_SELECTORS = [
  "h1",
  "[class*='book'][class*='title']",
  "[class*='novel'][class*='title']",
  "[class*='title']",
];

/** Default author selectors commonly found on mobile H5 novel pages. */
const DEFAULT_AUTHOR_SELECTORS = [
  "[class*='author']",
  "[class*='writer']",
];

/** Default chapter link selectors for table-of-contents pages. */
const DEFAULT_CHAPTER_LINK_SELECTORS = [
  "a[href*='chapter']",
  "a[href*='reader']",
  "a[href*='read']",
  "[class*='chapter'] a",
  "[class*='catalog'] a",
  "[class*='directory'] a",
];

/** Default content containers for reader pages. */
const DEFAULT_CONTENT_SELECTORS = [
  "article",
  "[class*='content']",
  "[class*='reader']",
  "[class*='chapter']",
  "main",
];

/** Link text that navigates around a reader but is not a real chapter title. */
const NAVIGATION_LINK_TITLE_PATTERN = /^(previous|prev|next|previous chapter|next chapter|back|home|library|profile)$/i;

/** Text that indicates the H5 app is not ready or failed to load content. */
const LOADING_OR_ERROR_TEXT_PATTERN = /^(loading\b|system is busy\b|reload\b)/i;

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const pickFirstText = async (page: Page, selectors: string[]): Promise<string | undefined> => {
  for (const selector of selectors) {
    const text = await page.locator(selector).first().textContent().catch(() => undefined);
    const normalized = normalizeText(text ?? "");
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

const collectChapterLinks = async (
  page: Page,
  selectors: string[],
  sourceUrl: string,
): Promise<ChapterLink[]> => {
  const chapterCandidates = await page.evaluate(
    ({ selectorList, baseUrl }) => {
      const anchors = selectorList.flatMap((selector) => Array.from(document.querySelectorAll<HTMLAnchorElement>(selector)));

      return anchors.map((anchor) => ({
        title: anchor.textContent?.replace(/\s+/g, " ").trim() ?? "",
        url: anchor.href ? new URL(anchor.href, baseUrl).toString() : "",
      }));
    },
    { selectorList: selectors, baseUrl: sourceUrl },
  );

  const uniqueByUrl = new Map<string, ChapterLink>();

  for (const candidate of chapterCandidates) {
    if (
      !candidate.url
      || !candidate.title
      || NAVIGATION_LINK_TITLE_PATTERN.test(candidate.title)
      || uniqueByUrl.has(candidate.url)
    ) {
      continue;
    }

    uniqueByUrl.set(candidate.url, {
      index: uniqueByUrl.size + 1,
      title: candidate.title,
      url: candidate.url,
    });
  }

  return [...uniqueByUrl.values()];
};

const createCurrentChapter = (title: string, sourceUrl: string, pageUrl: string): ChapterLink => ({
  index: 1,
  title,
  url: pageUrl || sourceUrl,
});

const extractLargestTextBlock = async (page: Page): Promise<string> => {
  return page.evaluate((minimumLength) => {
    const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "HEADER", "FOOTER", "NAV"]);
    const elements = Array.from(document.body.querySelectorAll<HTMLElement>("body *"));
    let bestText = "";

    for (const element of elements) {
      if (ignoredTags.has(element.tagName)) {
        continue;
      }

      const text = element.innerText?.trim() ?? "";
      if (text.length >= minimumLength && text.length > bestText.length) {
        bestText = text;
      }
    }

    return bestText || document.body.innerText || "";
  }, MIN_CONTENT_TEXT_LENGTH);
};

const extractChapterText = async (page: Page, selectors: string[]): Promise<string> => {
  for (const selector of selectors) {
    const text = await page
      .locator(selector)
      .first()
      .evaluate((element) => (element as HTMLElement).innerText)
      .catch(() => undefined);
    const cleaned = cleanChapterText(text ?? "");
    if (cleaned.length >= MIN_CONTENT_TEXT_LENGTH) {
      return cleaned;
    }
  }

  const fallbackText = cleanChapterText(await extractLargestTextBlock(page));

  if (
    fallbackText.length < MIN_VALID_CHAPTER_TEXT_LENGTH
    || LOADING_OR_ERROR_TEXT_PATTERN.test(normalizeText(fallbackText))
  ) {
    throw new Error("Could not extract enough chapter text from the rendered page");
  }

  return fallbackText;
};

export const createGenericH5NovelAdapter = (options: GenericAdapterOptions): NovelAdapter => {
  const titleSelectors = options.titleSelectors ?? DEFAULT_TITLE_SELECTORS;
  const authorSelectors = options.authorSelectors ?? DEFAULT_AUTHOR_SELECTORS;
  const chapterLinkSelectors = options.chapterLinkSelectors ?? DEFAULT_CHAPTER_LINK_SELECTORS;
  const contentSelectors = options.contentSelectors ?? DEFAULT_CONTENT_SELECTORS;

  return {
    id: options.id,

    canHandle(url: URL): boolean {
      if (!options.hosts?.length) {
        return true;
      }

      return options.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    },

    async extractBookInfo(page: Page, sourceUrl: string): Promise<BookInfo> {
      const pageTitle = await page.title();
      const extractedTitle = await pickFirstText(page, titleSelectors);
      const titleCandidate = extractedTitle ?? normalizeText(pageTitle);
      const title = titleCandidate || "Untitled Novel";
      const author = await pickFirstText(page, authorSelectors);
      const chapters = await collectChapterLinks(page, chapterLinkSelectors, sourceUrl);
      const currentChapter = createCurrentChapter(title, sourceUrl, page.url());
      const normalizedChapters = chapters.length ? chapters : [currentChapter];

      return {
        title,
        author,
        sourceUrl,
        chapters: normalizedChapters,
      };
    },

    async extractChapter(page: Page, chapter: ChapterLink): Promise<ChapterContent> {
      return {
        chapter,
        content: await extractChapterText(page, contentSelectors),
      };
    },
  };
};

export const genericH5NovelAdapter = createGenericH5NovelAdapter({ id: "generic-h5" });
