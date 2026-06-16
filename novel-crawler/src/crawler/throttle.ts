export interface ThrottleOptions {
  /** Delay in milliseconds before resolving. */
  delayMs: number;
}

/**
 * Waits between chapter requests.
 */
export const throttle = async (options: ThrottleOptions): Promise<void> => {
  if (options.delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, options.delayMs);
  });
};
