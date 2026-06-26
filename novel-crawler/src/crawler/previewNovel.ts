import { chromium } from "playwright";
import { getAdapterForUrl } from "../adapters/registry.js";
import {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_USER_AGENT,
} from "../config.js";
import type { NovelPreview } from "../adapters/types.js";
import { fetchRenderedPage } from "./fetchPage.js";
import { retry } from "./retry.js";

export interface PreviewNovelOptions {
  sourceUrl: string;
  headful?: boolean;
}

/**
 * Loads lightweight book metadata without downloading chapter bodies or building a full catalog.
 */
export const previewNovel = async (options: PreviewNovelOptions): Promise<NovelPreview> => {
  const browser = await chromium.launch({ headless: !options.headful });

  try {
    const context = await browser.newContext({
      isMobile: true,
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const adapter = getAdapterForUrl(options.sourceUrl);

    if (adapter.extractPreview) {
      return await retry(
        async () => adapter.extractPreview!(page, options.sourceUrl),
        { attempts: DEFAULT_RETRY_ATTEMPTS, delayMs: DEFAULT_RETRY_DELAY_MS },
      );
    }

    const bookInfo = await retry(
      async () => {
        await fetchRenderedPage({ page, url: options.sourceUrl });
        return adapter.extractBookInfo(page, options.sourceUrl);
      },
      { attempts: DEFAULT_RETRY_ATTEMPTS, delayMs: DEFAULT_RETRY_DELAY_MS },
    );

    return {
      title: bookInfo.title,
      author: bookInfo.author,
      sourceUrl: bookInfo.sourceUrl,
      crawlMode: adapter.crawlMode,
    };
  } finally {
    await browser.close();
  }
};
