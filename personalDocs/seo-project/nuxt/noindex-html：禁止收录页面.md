# noindex-html：禁止搜索引擎收录页面

## 概述

`noindex-html.ts` 用于在返回 HTML 前，给指定路由注入 `<meta name="robots" content="noindex, nofollow">`，避免登录、个人中心、钱包等不应被公开检索的页面进入搜索结果。它与 `nuxt.config.ts` 中的 `X-Robots-Tag`、`robots` 配置一起构成 Nuxt 项目的 SEO 防护层。

## 要点

- 文件名是 **`noindex-html`**（不是 moindex）：`noindex` = 不要收录该页
- 主要做三件事：指定禁收录路径、匹配子路由、向 `<head>` 注入 robots meta
- `noindex` 管「别进搜索结果」；`nofollow` 管「别顺着本页链接继续爬」
- 若 HTML 已有 robots 标签，则不重复添加
- 正式环境中，私有页应用 **meta + 响应头 + robots 规则** 多层防护，而不是只靠一种

## 详细内容

### 1. `noindex` / `nofollow` 是什么

| 指令 | 含义 |
|------|------|
| `noindex` | 不要把该页面加入搜索引擎结果 |
| `nofollow` | 不要继续追踪（传递权重给）页面中的链接 |

常见写法：

```html
<meta name="robots" content="noindex, nofollow">
```

相关概念（便于对照）：

| 手段 | 作用层级 | 说明 |
|------|----------|------|
| `<meta name="robots">` | HTML 文档 | 爬虫解析页面后遵守（本文件注入的就是这个） |
| `X-Robots-Tag` HTTP 头 | 响应头 | 不改 HTML 也能声明；适合非 HTML 或统一网关策略 |
| `robots.txt` | 站点入口规则 | 主要管「允不允许抓取路径」，**不等于** noindex；Disallow 阻止抓取，已收录页有时仍需 noindex 才能撤出结果 |

`robots.txt` Disallow 与 `noindex` 不要混用误解：不想被搜到但可能已被抓过时，应明确 `noindex`；只 Disallow 有时反而让引擎无法看到 noindex 标签。

### 2. `noindex-html.ts` 做什么

该文件主要完成三件事：

1. **指定不允许收录的页面**  
   例如：`/login`、`/profile`、`/wallet`
2. **同时匹配子路由**  
   例如 `/profile` 也会覆盖 `/profile/settings`
3. **在返回 HTML 前注入 meta**  

```html
<meta name="robots" content="noindex, nofollow">
```

若页面 HTML 里**已经存在** robots 标签，则**不重复添加**。

### 3. 典型适用页面

适合加 noindex 的通常是：

- 登录 / 注册
- 个人中心、设置
- 钱包、订单、支付结果等用户私有页
- 仅登录可见的中间页、调试页、内部工具页

不适合对所有公开内容页盲目加 noindex，否则会伤害正常收录。

### 4. 与 Nuxt 其他 SEO 配置的关系

```text
noindex-html.ts          → 运行时向 HTML 注入 meta robots
nuxt.config 中 X-Robots-Tag → 响应头层面声明
nuxt.config 中 robots 配置  → 站点 robots 规则 / 模块配置
```

三者共同目标：避免登录、个人中心等页面被搜索引擎收录。任一环节遗漏都可能留下缺口，正式项目建议按路径清单对齐，而不是只改一处。

### 5. 实现时注意点

- **路径清单要完整**：漏掉子路由（如 `/wallet/history`）仍可能被收录
- **幂等注入**：已有 robots meta 时不要重复插入，避免冲突标签
- **SSR 时机**：应在最终 HTML 返回前注入，确保首屏源码里爬虫就能看到
- **与前端路由守卫区分**：登录拦截管「用户能不能进」；noindex 管「搜索引擎该不该收录」——两回事，都要做
- **验证方式**：查看页面源码（而非仅 DOM 面板事后插入）、检查响应头 `X-Robots-Tag`、用 Search Console / URL 检查工具确认

## 参考 / 来源

- 项目实践：`noindex-html.ts` 与 `nuxt.config.ts` 中的 robots / `X-Robots-Tag` 配置
- 审查记录：`docs/code-comment-audit-2026-07-20.md`（注释审查上下文）
