import { describe, expect, it } from "vitest";
import { retry } from "../src/crawler/retry.js";

describe("retry", () => {
  it("retries a failing operation until it succeeds", async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary failure");
        }
        return "ok";
      },
      { attempts: 3, delayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws the last error after all attempts fail", async () => {
    await expect(
      retry(
        async () => {
          throw new Error("still failing");
        },
        { attempts: 2, delayMs: 0 },
      ),
    ).rejects.toThrow("still failing");
  });
});
