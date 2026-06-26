import { randomUUID } from "node:crypto";
import { crawlNovel, type CrawlNovelOptions, type CrawlNovelResult } from "../crawler/crawlNovel.js";

/** Crawl job lifecycle states exposed to the web UI. */
export const JOB_STATUS = {
  /** Job is queued but not started yet. */
  PENDING: "pending",
  /** Job is currently crawling chapters. */
  RUNNING: "running",
  /** Job finished and output file is ready. */
  COMPLETED: "completed",
  /** Job failed before producing output. */
  FAILED: "failed",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export interface CrawlJob {
  id: string;
  status: JobStatus;
  sourceUrl: string;
  options: CrawlNovelOptions;
  createdAt: string;
  updatedAt: string;
  progress?: {
    completedChapters: number;
    totalChapters: number;
  };
  result?: CrawlNovelResult;
  error?: string;
}

const jobs = new Map<string, CrawlJob>();

const touchJob = (job: CrawlJob): void => {
  job.updatedAt = new Date().toISOString();
};

export const createCrawlJob = (options: CrawlNovelOptions): CrawlJob => {
  const now = new Date().toISOString();
  const job: CrawlJob = {
    id: randomUUID(),
    status: JOB_STATUS.PENDING,
    sourceUrl: options.sourceUrl,
    options,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);
  return job;
};

export const getCrawlJob = (jobId: string): CrawlJob | undefined => {
  return jobs.get(jobId);
};

export const runCrawlJob = async (jobId: string): Promise<void> => {
  const job = jobs.get(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  job.status = JOB_STATUS.RUNNING;
  touchJob(job);

  try {
    const result = await crawlNovel({
      ...job.options,
      onProgress: (progress) => {
        job.progress = progress;
        touchJob(job);
      },
    });
    job.status = JOB_STATUS.COMPLETED;
    job.result = result;
    job.progress = {
      completedChapters: result.completedChapters,
      totalChapters: result.totalChapters,
    };
    touchJob(job);
  } catch (error) {
    job.status = JOB_STATUS.FAILED;
    job.error = error instanceof Error ? error.message : String(error);
    touchJob(job);
  }
};

export const startCrawlJob = (options: CrawlNovelOptions): CrawlJob => {
  const job = createCrawlJob(options);

  void runCrawlJob(job.id);

  return job;
};
