import type { Page } from "playwright";

export interface FetchRenderedPageOptions {
  page: Page;
  url: string;
}

/** Maximum time to wait for the initial navigation. */
const NAVIGATION_TIMEOUT_MS = 45_000;

/** Small post-network wait for SPAs that render after API responses settle. */
const POST_LOAD_WAIT_MS = 800;

/**
 * Opens a URL in Playwright and waits for rendered DOM text to become available.
 */
export const fetchRenderedPage = async (options: FetchRenderedPageOptions): Promise<Page> => {
  await options.page.goto(options.url, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  await options.page.waitForLoadState("networkidle", { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
  await options.page.waitForTimeout(POST_LOAD_WAIT_MS);

  return options.page;
};
