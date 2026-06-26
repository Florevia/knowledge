# xhs-content-workflow

一个小红书内容生产与自动发布工作流：AI 负责选题文案、合规审核、图片提示词、图片生成、发布包导出和数据复盘，人只负责最终内容审核。

本项目不做自动登录、不读取 Cookie、不绕过验证码；发布动作通过本机已有的小红书自动化 CLI 执行。

## 目录

```text
xhs-content-workflow/
├── data/                  # 选题、笔记、数据复盘表
├── docs/                  # 账号定位、栏目、合规和风格文档
├── prompts/               # Claude 提示词模板
├── output/publish_packages/
├── src/                   # 命令行脚本和核心模块
└── tests/                 # 单元测试
```

## 初始化

```bash
cd xhs-content-workflow
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

在 `.env` 中填写：

```env
ANTHROPIC_API_KEY=你的 Claude API Key
CLAUDE_MODEL=claude-sonnet-4-5
```

## 使用流程

1. 在 `data/topics.csv` 维护选题，状态为 `draft` 的行会被生成。
2. 编辑 `docs/brand_guide.md`、`docs/content_pillars.md`、`docs/compliance_rules.md`。
3. 生成发布包：

```bash
PYTHONPATH=src python3 src/generate_note.py
```

4. 对某个发布包做二次合规审核：

```bash
PYTHONPATH=src python3 src/review_note.py output/publish_packages/001_新手如何选择第一台咖啡机.md
```

5. 审核内容后全自动生成图片并发布：

```bash
PYTHONPATH=src python3 src/auto_publish.py
```

也可以发布一个已有发布包：

```bash
PYTHONPATH=src python3 src/auto_publish.py --package output/publish_packages/001_新手如何选择第一台咖啡机.json
```

命令会展示标题、正文、话题和合规风险。审核通过请输入 `publish`，之后系统会调用 Gemini 自动生成图片，并调用小红书 CLI 一步发布。

如果要跳过审核提示：

```bash
PYTHONPATH=src python3 src/auto_publish.py --yes
```

## 自动发布前置条件

1. 已配置 `ANTHROPIC_API_KEY`。
2. Chrome、bridge server、Gemini 登录状态可用。
3. 小红书账号已登录，且 `/Users/lilin/.claude/skills/xiaohongshu-skills/scripts/cli.py check-login` 通过。
4. Gemini 图片生成脚本可用：`/Users/lilin/.claude/skills/lilin-rednote/scripts/gemini_automation.py`。
5. 发布频率要控制，避免短时间批量发布。

## 数据复盘

发布后维护 `data/metrics.csv`，生成复盘摘要：

```bash
PYTHONPATH=src python3 src/analyze_metrics.py
```

需要 Claude 深度复盘时：

```bash
PYTHONPATH=src python3 src/analyze_metrics.py --package output/publish_packages/001_新手如何选择第一台咖啡机.md
```

## 测试

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```
