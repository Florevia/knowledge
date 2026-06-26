import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { previewNovel } from "./crawler/previewNovel.js";
import { DEFAULT_DELAY_MS, DEFAULT_WEB_PORT } from "./config.js";
import { getCrawlJob, JOB_STATUS, startCrawlJob } from "./jobs/jobManager.js";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PUBLIC_DIR = join(PACKAGE_ROOT, "public");

/** MIME types for static assets served by the web UI. */
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? (JSON.parse(rawBody) as T) : ({} as T);
};

const parsePositiveInteger = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
};

const serveStaticFile = async (response: ServerResponse, filePath: string): Promise<void> => {
  await access(filePath);
  const extension = extname(filePath);
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
};

const handlePreview = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const body = await readJsonBody<{ sourceUrl?: string }>(request);

  if (!body.sourceUrl) {
    sendJson(response, 400, { error: "sourceUrl is required" });
    return;
  }

  try {
    const preview = await previewNovel({ sourceUrl: body.sourceUrl });
    sendJson(response, 200, preview);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const handleStartCrawl = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const body = await readJsonBody<{
    sourceUrl?: string;
    chapterCount?: number;
    skipChapters?: number;
    startChapter?: number;
    endChapter?: number;
    limit?: number;
    delayMs?: number;
  }>(request);

  if (!body.sourceUrl) {
    sendJson(response, 400, { error: "sourceUrl is required" });
    return;
  }

  try {
    const parsedSkipChapters = body.skipChapters === undefined || body.skipChapters === null
      ? undefined
      : Number.parseInt(String(body.skipChapters), 10);

    if (parsedSkipChapters !== undefined && (!Number.isFinite(parsedSkipChapters) || parsedSkipChapters < 0)) {
      throw new Error("skipChapters must be a non-negative integer");
    }

    const job = startCrawlJob({
      sourceUrl: body.sourceUrl,
      chapterCount: parsePositiveInteger(body.chapterCount, "chapterCount"),
      skipChapters: parsedSkipChapters,
      startChapter: parsePositiveInteger(body.startChapter, "startChapter"),
      endChapter: parsePositiveInteger(body.endChapter, "endChapter"),
      limit: parsePositiveInteger(body.limit, "limit"),
      delayMs: parsePositiveInteger(body.delayMs, "delayMs") ?? DEFAULT_DELAY_MS,
    });

    sendJson(response, 202, { jobId: job.id, status: job.status });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const handleGetJob = (response: ServerResponse, jobId: string): void => {
  const job = getCrawlJob(jobId);

  if (!job) {
    sendJson(response, 404, { error: "Job not found" });
    return;
  }

  sendJson(response, 200, job);
};

const handleDownload = async (response: ServerResponse, jobId: string): Promise<void> => {
  const job = getCrawlJob(jobId);

  if (!job) {
    sendJson(response, 404, { error: "Job not found" });
    return;
  }

  if (job.status !== JOB_STATUS.COMPLETED || !job.result?.filePath) {
    sendJson(response, 409, { error: "Job is not completed yet" });
    return;
  }

  const filePath = job.result.filePath;
  await access(filePath);
  const fileStats = await stat(filePath);
  const fileName = filePath.split("/").pop() ?? "novel.txt";

  response.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    "Content-Length": fileStats.size,
  });
  createReadStream(filePath).pipe(response);
};

const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = requestUrl.pathname;

  try {
    if (request.method === "POST" && pathname === "/api/preview") {
      await handlePreview(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/crawl") {
      await handleStartCrawl(request, response);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/download")) {
      const jobId = pathname.slice("/api/jobs/".length, -"/download".length);
      await handleDownload(response, jobId);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/jobs/")) {
      const jobId = pathname.slice("/api/jobs/".length);
      handleGetJob(response, jobId);
      return;
    }

    const staticPath = pathname === "/" ? join(PUBLIC_DIR, "index.html") : join(PUBLIC_DIR, pathname);
    await serveStaticFile(response, staticPath);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
};

export const startWebServer = (port = DEFAULT_WEB_PORT): void => {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  server.listen(port, () => {
    console.log(`Novel Crawler UI running at http://localhost:${port}`);
  });
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_WEB_PORT), 10);
  startWebServer(Number.isFinite(port) ? port : DEFAULT_WEB_PORT);
}
