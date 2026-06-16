export interface RetryOptions {
  /** Total number of attempts, including the first try. */
  attempts: number;
  /** Delay between failed attempts in milliseconds. */
  delayMs: number;
}

const sleep = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

/**
 * Runs an async operation with fixed-delay retries.
 */
export const retry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < options.attempts) {
        await sleep(options.delayMs);
      }
    }
  }

  throw lastError;
};
