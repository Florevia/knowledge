# Wappalyzer：网站技术栈识别工具

## 概述

Wappalyzer 是一个"网站技术栈识别工具"（technology profiler / technographic data 工具）。打开一个网站，它可以帮你判断这个网站大概用了什么技术，比如 WordPress、Shopify、React、Vue、Next.js、Google Analytics、Cloudflare、Nginx、Stripe、HubSpot 等，相当于给网站做一次"技术 X 光扫描"。

## 要点

- 通过分析网站**公开暴露的信号**（HTML、脚本、HTTP headers、cookies、指纹特征等）识别技术，不涉及源码或后端内部信息
- 官方技术目录跟踪 8,083 种 Web 技术，覆盖 106 个分类
- 使用形态：浏览器插件、官网技术查询、API（批量查询、CRM 丰富、子域名发现、邮箱验证等）
- 定位已从单纯的"技术识别"扩展到 **Sales / GTM（销售与市场）** 场景：线索挖掘、CRM 丰富、竞品技术监控
- 局限明显：只能看暴露线索，无法看真实架构；版本号不可靠；现代前端构建后可能识别不全

## 详细内容

### 能识别什么

| 类型 | 例子 |
| --- | --- |
| CMS 内容管理系统 | WordPress、Drupal、Joomla |
| 前端框架 | React、Vue、Angular、Next.js |
| JS 库 | jQuery、Lodash、Swiper |
| 电商平台 | Shopify、Magento、WooCommerce |
| 分析工具 | Google Analytics、Matomo |
| 广告/营销工具 | Facebook Pixel、HubSpot、Marketo |
| CDN / 服务器 | Cloudflare、Akamai、Nginx、Apache |
| 支付工具 | Stripe、PayPal |
| CRM / 客服工具 | Salesforce、Intercom、Zendesk |
| 编程语言/后端线索 | PHP、Django、Java、Node.js 相关特征 |

不只是 CMS/framework detector，还覆盖编程语言、分析、营销、支付、CRM、CDN 等很多类别。

### 识别原理

不是"黑进网站"，也不是看源码仓库，而是靠**公开可见的特征匹配**，主要用大量正则表达式检查 HTML 代码、JavaScript 变量、响应头等。示例：

- HTML 中出现 `/wp-content/themes/xxx` → 判断是 WordPress
- 响应头出现 `server: cloudflare` → 判断用了 Cloudflare
- 页面脚本引入 `https://www.googletagmanager.com/gtag/js` → 判断用了 Google Analytics / Google Tag Manager

### 使用形态

1. **浏览器插件**：Chrome / Firefox / Edge / Safari，装好后点图标即可查看当前网站的技术栈，还有 Salesforce、HubSpot、Pipedrive、Gmail、Zapier、Make 等集成形态。适合开发者看框架、产品/运营看竞品、安全人员做初步资产识别、销售找目标客户。
2. **官网技术查询**：直接输入网址查询，官方现在更强调面向 Sales / GTM 团队的用途（按技术栈筛选潜在客户、丰富 CRM 记录、监控竞对技术变化）。
3. **API**：批量查询网站技术栈，可返回技术、公司信息、邮箱、电话、社媒资料、关键词、元数据等，用于自动化工作流；技术查询 API 既可查数据库结果，也可做 live analysis。

### 适合的使用场景

1. **学习竞品技术栈**：快速看一个体验好的网站是不是用了 Next.js、Shopify、Cloudflare、Stripe。
2. **技术选型参考**：观察同类网站普遍用什么技术（电商常用 Shopify，内容站常用 WordPress，SaaS 官网常用 Webflow、HubSpot、Intercom）。
3. **销售线索挖掘**：例如卖 Shopify 插件的公司找"正在使用 Shopify 的网站"，卖 HubSpot 服务的公司找"用了 HubSpot 的公司"；lead lists、technology lookup、website alerts、CRM enrichment 是官方核心产品方向。
4. **安全侦察 / 资产梳理**：做被动技术识别，先判断目标网站可能用的服务器、CMS、框架、CDN，再决定后续检查方向；不是漏洞扫描器，只能辅助判断技术暴露面。

### 局限性

- **只能看到公开暴露的线索**：响应头被隐藏、JS 打包混淆、后端在 CDN 后面时，识别可能不准
- **不等于源码分析**：无法得知真实目录结构、后端真实架构、数据库设计、微服务划分
- **版本号不一定可靠**：网站可能隐藏版本、库可能留旧文件、响应头可能被伪装
- **复杂现代前端可能误判**：Next.js、React、Vue、Nuxt、Vite、Webpack 构建后可能只留部分特征，识别不一定完整

### 与同类工具的区别

| 工具 | 更偏向 |
| --- | --- |
| Wappalyzer | 浏览器即时识别 + 技术画像 + API/销售数据 |
| BuiltWith | 大规模互联网技术趋势、市场分析、销售线索 |
| WhatRuns | 浏览器插件，轻量看网站用了什么 |
| WhatWeb | 安全/侦察方向的网站指纹识别 |
| Netcraft / Shodan | 更偏网络资产、安全暴露面、基础设施 |

BuiltWith 更强调大规模技术趋势、销售情报、市场分析；Wappalyzer 更适合日常浏览网页时快速判断某个网站的技术栈。

### 实战使用建议

1. 先用 Wappalyzer 快速扫一眼网站技术栈
2. 再用浏览器 DevTools 验证关键判断：Network 看响应头、Sources 看 JS bundle、Elements 看 DOM 特征、Application 看 cookies/localStorage
3. 如果是安全分析，不要只信 Wappalyzer，需结合 nmap、httpx、whatweb、nuclei、资产平台等工具
4. 如果是竞品研究，重点看工具组合（CMS、分析工具、营销工具、客服工具、支付工具），而不只是 React/Vue 这类框架

## 总结

Wappalyzer 本质上是一个网站技术指纹识别工具，最适合回答"这个网站大概是用什么搭起来的？"，但不适合回答"源码怎么写的""后端真实架构是什么""有没有漏洞"这类问题。一句话记住：**Wappalyzer 是技术栈侦察工具，不是源码查看器，也不是漏洞扫描器。**

## 参考 / 来源

- [Technologies - Wappalyzer](https://www.wappalyzer.com/technologies/)
- [Wappalyzer - Technology profiler - Chrome Web Store](https://chromewebstore.google.com/detail/wappalyzer-technology-pro/gppongmhjkpfnbhagpmjfkannfbllamg?hl=en)
- [GitHub - tomnomnom/wappalyzer](https://github.com/tomnomnom/wappalyzer)
- [WhatWeb & Wappalyzer Online Website Recon - HackerTarget.com](https://hackertarget.com/whatweb-scan/)
- [Apps - Wappalyzer](https://www.wappalyzer.com/apps/)
- [Find out what websites are built with - Wappalyzer](https://www.wappalyzer.com/)
- [APIs - Wappalyzer](https://www.wappalyzer.com/api/)
- [Technology lookup - Wappalyzer Docs](https://www.wappalyzer.com/docs/api/v2/lookup/)
- [BuiltWith Technology Lookup](https://builtwith.com/)
