/** Default delay between chapter requests to avoid hammering H5 sites. */
export const DEFAULT_DELAY_MS = 1000;

/** Default retry attempts for page navigation and extraction. */
export const DEFAULT_RETRY_ATTEMPTS = 3;

/** Default retry delay for transient network or rendering failures. */
export const DEFAULT_RETRY_DELAY_MS = 1000;

/** Default output directory relative to the crawler package. */
export const DEFAULT_OUTPUT_DIR = "output";

/** Default mobile user agent for H5 novel sites. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
