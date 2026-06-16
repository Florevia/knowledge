# Novel Crawler

独立的 Node.js + TypeScript 小说爬虫。第一版面向移动端 H5 小说站，输入一本小说详情页或章节页 URL，渲染页面后提取章节并合并输出为 TXT。

## Install

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
npm run crawl -- "https://example.com/book-or-chapter-url"
```

常用参数：

```bash
npm run crawl -- "https://example.com/book" --out output --delay 1000 --limit 3
npm run crawl -- "https://example.com/book" --headful
```

- `--out <dir>`：输出目录，默认 `output`。
- `--delay <ms>`：章节间延迟，默认 `1000`。
- `--limit <number>`：只抓前 N 章，适合调试站点规则。
- `--headful`：显示浏览器窗口，适合观察动态页面。

## Test Domains

已注册这些测试域名的初始 adapter，并带有通用 H5 fallback：

- `https://fb-11-2.h5.obnovel.com/`
- `https://h5.unlimitednovels.com/`
- `https://001.novelmuster.com/`
- `https://book-251208-4206631182883361.oceread.com/`
- `https://fb-322-1813.h5.novel-master.com/`

这些站点可能需要具体小说页或章节页 URL。首页如果只有 `Loading...` 或入口内容不足，建议用 `--headful` 观察页面，再在对应 `src/adapters/sites/*` adapter 里补选择器。

## Output

默认输出：

```text
output/
  <book-title>.txt
  .checkpoints/
    <adapter-book-id>.json
```

TXT 包含书名、来源 URL、生成时间和按顺序排列的章节正文。checkpoint 会记录已完成章节、失败章节和错误信息，避免失败后整本重爬。

## Development

```bash
npm test
npm run build
```

测试覆盖：

- 正文清洗：去除导航噪声、压缩空行。
- 文件名：保留可读中文，移除路径非法字符。
- 重试：临时失败后重试，最终失败抛出最后错误。
- TXT 写入：写入元数据和按序章节。

## Adding A Site Adapter

1. 在 `src/adapters/sites/` 新增站点文件。
2. 使用 `createGenericH5NovelAdapter` 配置 `hosts` 和选择器。
3. 在 `src/adapters/registry.ts` 注册 adapter。
4. 用 `--limit 1 --headful` 做 smoke test。

## Boundaries

这个工具只处理公开可访问页面，不实现登录绕过、付费章节绕过、验证码绕过或反爬规避。默认低速串行抓取，降低对站点的影响。
