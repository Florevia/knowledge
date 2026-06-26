/** Polling interval while a crawl job is running. */
const JOB_POLL_INTERVAL_MS = 1500;

/** Job status values returned by the API. */
const JOB_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

const sourceUrlInput = document.querySelector("#sourceUrl");
const previewBtn = document.querySelector("#previewBtn");
const crawlBtn = document.querySelector("#crawlBtn");
const previewPanel = document.querySelector("#previewPanel");
const statusPanel = document.querySelector("#statusPanel");
const bookTitle = document.querySelector("#bookTitle");
const bookMeta = document.querySelector("#bookMeta");
const crawlModeBadge = document.querySelector("#crawlModeBadge");
const previewHint = document.querySelector("#previewHint");
const chapterCountInput = document.querySelector("#chapterCount");
const skipChaptersInput = document.querySelector("#skipChapters");
const delayMsInput = document.querySelector("#delayMs");
const jobStatus = document.querySelector("#jobStatus");
const statusMessage = document.querySelector("#statusMessage");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const downloadLink = document.querySelector("#downloadLink");
const errorMessage = document.querySelector("#errorMessage");

let pollTimerId = null;

const showError = (message) => {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
};

const clearError = () => {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
};

const setLoading = (button, isLoading, loadingText) => {
  button.disabled = isLoading;
  button.dataset.originalText ??= button.textContent;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed: ${response.status}`);
  }

  return data;
};

const renderPreview = (preview) => {
  bookTitle.textContent = preview.title;
  bookMeta.textContent = preview.author ? `作者：${preview.author}` : `来源：${preview.sourceUrl}`;
  crawlModeBadge.textContent = preview.crawlMode === "sequential" ? "逐章爬取" : "目录爬取";

  if (preview.crawlMode === "sequential") {
    const startChapter = preview.startChapterNum ?? 1;
    previewHint.textContent = `将从第 ${startChapter} 章开始，按下一章连续爬取。不需要预先知道全书总章数。`;
  } else {
    previewHint.textContent = "该站点仍使用目录模式，会尝试从页面链接中识别章节。";
  }

  previewPanel.classList.remove("hidden");
};

const updateJobView = (job) => {
  statusPanel.classList.remove("hidden");
  jobStatus.textContent = job.status;

  const completed = job.progress?.completedChapters ?? 0;
  const total = job.progress?.totalChapters ?? job.result?.totalChapters ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${completed} / ${total}`;

  if (job.status === JOB_STATUS.PENDING) {
    statusMessage.textContent = "任务已创建，等待开始...";
  }

  if (job.status === JOB_STATUS.RUNNING) {
    statusMessage.textContent = "正在按章节顺序爬取，请稍候...";
  }

  if (job.status === JOB_STATUS.COMPLETED) {
    statusMessage.textContent = `爬取完成：${job.result?.title ?? "小说"}`;
    downloadLink.href = `/api/jobs/${job.id}/download`;
    downloadLink.classList.remove("hidden");
  }

  if (job.status === JOB_STATUS.FAILED) {
    statusMessage.textContent = job.error ?? "任务失败";
    downloadLink.classList.add("hidden");
  }
};

const pollJob = async (jobId) => {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await response.json();

  if (!response.ok) {
    throw new Error(job.error ?? "无法获取任务状态");
  }

  updateJobView(job);

  if (job.status === JOB_STATUS.PENDING || job.status === JOB_STATUS.RUNNING) {
    pollTimerId = window.setTimeout(() => {
      void pollJob(jobId);
    }, JOB_POLL_INTERVAL_MS);
    return;
  }

  pollTimerId = null;
  crawlBtn.disabled = false;
};

previewBtn.addEventListener("click", async () => {
  clearError();

  const sourceUrl = sourceUrlInput.value.trim();
  if (!sourceUrl) {
    showError("请先粘贴小说 URL");
    return;
  }

  try {
    setLoading(previewBtn, true, "识别中...");
    const preview = await postJson("/api/preview", { sourceUrl });
    renderPreview(preview);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    setLoading(previewBtn, false);
  }
});

crawlBtn.addEventListener("click", async () => {
  clearError();

  const sourceUrl = sourceUrlInput.value.trim();
  const chapterCount = Number.parseInt(chapterCountInput.value, 10);
  const skipChapters = Number.parseInt(skipChaptersInput.value, 10);
  const delayMs = Number.parseInt(delayMsInput.value, 10);

  if (!sourceUrl) {
    showError("请先粘贴小说 URL");
    return;
  }

  if (!Number.isFinite(chapterCount) || chapterCount <= 0) {
    showError("本次爬取章数必须是大于 0 的整数");
    return;
  }

  if (!Number.isFinite(skipChapters) || skipChapters < 0) {
    showError("跳过章节数不能小于 0");
    return;
  }

  try {
    crawlBtn.disabled = true;
    downloadLink.classList.add("hidden");
    statusPanel.classList.remove("hidden");

    if (pollTimerId) {
      window.clearTimeout(pollTimerId);
      pollTimerId = null;
    }

    const result = await postJson("/api/crawl", {
      sourceUrl,
      chapterCount,
      skipChapters,
      delayMs: Number.isFinite(delayMs) ? delayMs : undefined,
    });

    updateJobView({ id: result.jobId, status: result.status });
    await pollJob(result.jobId);
  } catch (error) {
    crawlBtn.disabled = false;
    showError(error instanceof Error ? error.message : String(error));
  }
});
