# robots meta：noindex 与 nofollow

## 概述

搜索引擎通过 `robots` 元信息决定如何对待页面：是否收录、是否追踪链接。`noindex` / `nofollow` 是私有页、登录页、用户资产页的常见防护手段。

## 要点

- `noindex`：不要把页面加入搜索结果
- `nofollow`：不要继续追踪页面中的链接
- 常见组合：`<meta name="robots" content="noindex, nofollow">`
- 还可配合 HTTP 头 `X-Robots-Tag`；与 `robots.txt` 职责不同

## 详细内容

### 常用指令

| 指令 | 含义 |
|------|------|
| `index` / `noindex` | 是否允许出现在搜索结果中 |
| `follow` / `nofollow` | 是否跟随页面内链接继续爬取/传递权重 |
| `noarchive` | 不提供缓存页（按需） |
| `nosnippet` | 限制摘要展示（按需） |

### meta 与响应头

```html
<meta name="robots" content="noindex, nofollow">
```

```http
X-Robots-Tag: noindex, nofollow
```

两者语义接近，可叠加使用；框架层（如 Nuxt）常在配置里统一下发响应头，再在特定路由用中间件/工具向 HTML 注入 meta。

### 与 robots.txt 的区别

| | robots.txt | noindex |
|--|------------|---------|
| 主要问题 | 允不允许抓这条路径 | 抓到后要不要进搜索结果 |
| 典型用途 | 挡整站工具目录、API | 登录页、个人中心等 |
| 注意 | Disallow 后爬虫可能看不到页内 noindex | 要撤出结果应明确 noindex |

### 实践指引

- 公开内容页：默认允许 index，做好 title / description / 结构化数据
- 私有与账号相关页：noindex（通常加 nofollow）
- 框架落地示例见：[noindex-html：禁止收录页面](../nuxt/noindex-html：禁止收录页面.md)

## 参考 / 来源

- 整理自 Nuxt 项目 `noindex-html.ts` 相关说明与通用 SEO 实践
