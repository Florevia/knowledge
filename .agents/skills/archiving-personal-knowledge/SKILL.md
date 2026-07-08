---
name: archiving-personal-knowledge
description: Use when the user shares raw knowledge, notes, chat excerpts, links, or any unstructured content and asks to save, organize, sort, or turn it into a document — especially when they mention personalDocs. Symptoms include "帮我整理一下", "把这个记录下来", "存到 personalDocs", "整理成文档".
---

# Archiving Personal Knowledge

## Overview

Turn content the user pastes/dictates in chat into a clean, well-structured Markdown document saved under `personalDocs/` in this repo. The user provides raw material; you provide structure and a permanent home for it.

## When to Use

- User pastes text, notes, a conversation excerpt, an article, or a list of tips and asks you to organize/save it
- User explicitly mentions `personalDocs`
- User says things like "整理成文档", "帮我记录一下这个知识点", "存起来以后能查"

**Don't use when** the user asks for a shareable/public doc (they say `shareDocs` or "分享" explicitly) — in that case write to `shareDocs/` instead, following the same structuring steps.

## Workflow

1. **Read the raw content** the user provided. Don't drop or invent facts — restructure, don't rewrite the substance.
2. **Derive a title** that summarizes the topic (Chinese if the source is Chinese, matching this repo's existing doc titles).
3. **Check for an existing file** at `personalDocs/<title>.md` (`Glob`/`ls`). If one already covers the same topic, ask the user whether to append/merge or create a new file — don't silently overwrite.
4. **Structure the document** using the template below.
5. **Write the file** to `personalDocs/<title>.md`.
6. **Report back**: file path written, and a one-line summary of what was captured.

## Document Template

```markdown
# <Title>

## 概述
<1-3 句话说明这篇内容是什么、解决什么问题>

## 要点
- <核心知识点 1>
- <核心知识点 2>

## 详细内容
<按主题分小节展开，保留用户原始内容中的关键细节、示例、数据>

## 参考 / 来源
<链接、出处，若用户提供了；没有则省略此节>
```

Adapt section names to fit the content (e.g. a how-to becomes numbered steps, a comparison becomes a table) — the template is a starting shape, not a rigid form.

## Rules

- **Preserve meaning**: don't add opinions, conclusions, or facts the user didn't provide.
- **Chinese in, Chinese out**: keep the document's language matching the source material.
- **File naming**: use the derived title as the filename, `.md` extension, no path prefixes — the file always lands directly in `personalDocs/`.
- **One document per topic**: don't split a single piece of shared knowledge across multiple files unless the user asks.
