#!/usr/bin/env node

import { crawlNovel } from "./crawler/crawlNovel.js";

interface CliOptions {
  sourceUrl: string;
  outputDir?: string;
  delayMs?: number;
  headful?: boolean;
  limit?: number;
  startChapter?: number;
  endChapter?: number;
  chapterCount?: number;
  skipChapters?: number;
}

interface HelpOptions {
  help: true;
}

/** Exit code used for invalid CLI input. */
const INVALID_INPUT_EXIT_CODE = 1;

/** Exit code used when crawling fails unexpectedly. */
const CRAWL_FAILURE_EXIT_CODE = 2;

const HELP_TEXT = `
Usage:
  npm run crawl -- "https://example.com/book-or-chapter-url"

Options:
  --out <dir>       Output directory. Defaults to ./output
  --delay <ms>      Delay between chapter requests. Defaults to 1000
  --headful         Show the browser while crawling
  --limit <number>  Crawl only the first N chapters for testing
  --count <number>  Sequential mode: crawl this many chapters
  --skip <number>   Sequential mode: skip the first N chapters
  --start <number>  Inclusive start chapter index (1-based)
  --end <number>    Inclusive end chapter index (1-based)
`;

const readValue = (args: string[], index: number, flag: string): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
};

const parsePositiveInteger = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
};

const parseArgs = (args: string[]): CliOptions | HelpOptions => {
  const options: Partial<CliOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--out") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--delay") {
      options.delayMs = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--start") {
      options.startChapter = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--end") {
      options.endChapter = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--count") {
      options.chapterCount = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--skip") {
      const parsed = Number.parseInt(readValue(args, index, arg), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${arg} must be a non-negative integer`);
      }
      options.skipChapters = parsed;
      index += 1;
      continue;
    }

    if (arg === "--headful") {
      options.headful = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.sourceUrl) {
      throw new Error("Only one source URL is supported in the first version");
    }

    options.sourceUrl = arg;
  }

  if (!options.sourceUrl) {
    throw new Error(HELP_TEXT.trim());
  }

  return options as CliOptions;
};

const main = async (): Promise<void> => {
  try {
    const options = parseArgs(process.argv.slice(2));

    if ("help" in options) {
      console.log(HELP_TEXT.trim());
      return;
    }

    const result = await crawlNovel(options);

    console.log(`Title: ${result.title}`);
    console.log(`Output: ${result.filePath}`);
    console.log(`Chapters: ${result.completedChapters}/${result.totalChapters}`);

    if (result.failedChapters > 0) {
      console.warn(`Failed chapters: ${result.failedChapters}. See ${result.checkpointDir} for details.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isInputError = message.includes("Usage:") || message.includes("Missing value") || message.includes("Unknown option");

    console.error(message);
    process.exitCode = isInputError ? INVALID_INPUT_EXIT_CODE : CRAWL_FAILURE_EXIT_CODE;
  }
};

await main();
