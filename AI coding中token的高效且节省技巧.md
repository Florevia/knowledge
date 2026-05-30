# AI coding中token的高效且节省技巧

# 一、为什么要关注 Token

## Token 成本到底花在哪里？

> 总token = 输入 token \+  输出 token
> 
> 

- **输入 Token 包括：                **

    - System Prompt

    - 历史对话

    - 用户当前问题

    - RAG 检索结果

    - 工具调用参数

    - 文件 / 图片 / 代码上下文

    - 多轮 Agent 中间过程

- **输出 Token 包括：**

    - 模型回答

    - Markdown / JSON / 代码

    - 工具调用解释

    - 推理过程或长文本生成

真正昂贵的是多轮循环：一次 AI coding 任务通常会经历搜索、读文件、修改、跑测试、修复、复查，每一轮都会继续携带上下文。

Anthropic 把这类问题称为 context engineering：核心不是塞入更多上下文，而是在有限注意力预算里放入最小且高信号的信息。

## Token 浪费的典型场景

- 整仓扫描、选中整段长日志。

- 问题边界不清，Agent 盲目探索无关目录。

- 重复解释项目背景、需求和约束。

- 让 AI 输出完整文件，而不是只输出修改点或 diff。

- 长会话不清理。

- 把动态内容放进常驻规则，破坏 prompt cache。

> 很多模型/API（OpenAI、Anthropic 等）会对请求的前缀做缓存：
> 
> - 请求开头有一段完全相同的内容（系统提示、工具定义、仓库规则等）→ 可以复用上次算过的结果，便宜、也快。
> 
> - 前缀里哪怕差一个字（多一个时间戳、换一行状态）→ 整段前缀算“变了”，缓存失效，按全新输入计费/计算。
> 
> 官方文档的核心就是：静态内容放前面，变量内容放后面
> 
> 

# 二、Prompt 层面的优化

## 把 Prompt 写短，但写准

原则：缩小范围 \-\&gt; 明确目标 \-\&gt; 限制输出 \-\&gt; 允许执行。

推荐模板：

```Plain Text
目标：修复 xxx 问题。
范围：只看 src/modules/xxx 和相关 API，不做无关重构。
现象：xxx 操作后出现 xxx。
验收：xxx 测试通过，且页面 xxx 行为正常。
输出：先说明改动计划，再改代码，最后给验证结果。

```

## 明确输出格式，减少无效输出

- 只读分析：要求输出“结论、证据、风险、下一步”。

- 写代码：要求输出“改了什么、为什么、如何验证”。

- Debug：要求输出“假设、证据、验证命令、结果”。

- Code review：要求按严重程度列问题，不要泛泛总结。

## 代码任务优先输出 diff，而不是完整文件

企业代码库里，完整文件输出往往包含大量未变化内容。更省 token 的方式是让 AI 只说明修改点，并直接应用补丁：

- 小改动：指定文件和函数，让 AI 直接改。

- 中等改动：先让 AI 给计划，再分批改。

- 大改动：先拆任务，不要一次性让 Agent 横扫全仓。

## Rules 要短、分层、按需触发

Cursor 的 Rules 会作为持久上下文注入到模型上下文中；规则可以放在 `\.cursor/rules`，支持按项目、路径、相关性等方式应用。



但Rules 太长会导致每次请求消耗额外的token，推荐 **拆成小规则**，例如：


```Plain Text
.cursor/rules/
  frontend-style.mdc
  react-component.mdc
  api-client.mdc
  testing.mdc
```

示例：`\`\.cursor/rules/react\-component\.mdc\``

```Markdown
description: React component conventions
globs:
  - "src/components/***/**.tsx"
  - "src/pages/***/**.tsx"
alwaysApply: false
---

- 使用 React 函数组件和 TypeScript。
- Props 必须显式声明类型。
- 避免 any。
- 样式优先使用 Tailwind CSS。
- 不要引入新的状态管理库，除非用户明确要求。
```

关键点：能不用 **Always** 就不用 Always。否则每次对话都会带上这段规则。

> `alwaysApply: false` 不是「关掉这条规则」，而是 「不要每次对话都强制带上」；需要时仍会通过 **路径匹配、任务相关性、主动引用** 等方式注入。
> 
> 

# 三、上下文管理

## 按需加载，而不是预加载

好的上下文不是“越多越好”，而是“刚好够用”。Anthropic 建议使用 just\-in\-time context：保留文件路径、链接、查询条件等轻量引用，需要时再读取具体内容。

实践方法：

- 给 AI 文件路径、函数名、错误信息，而不是整段无关代码。

- 让 AI 先搜索和阅读相关片段，再决定是否继续扩展范围。

- 对日志只给关键错误、复现步骤、最近几十行；必要时让 AI 自己读取完整日志。

- 把中间结果放在文件、终端、CI、issue 中，聊天里只保留结论和证据。

## 把稳定规则沉淀到仓库

重复出现的规范不要每次手打，放到仓库级说明里：

- `AGENTS\.md`：多 Agent 通用规则、构建命令、测试命令、代码边界。

- `\.github/copilot\-instructions\.md`：GitHub Copilot 仓库级规则。

- `\.github/instructions/\*\.instructions\.md`：按路径或技术栈生效的局部规则。

官方文档也建议把构建、测试、架构布局等稳定信息写进自定义指令，减少 Agent 每次重复搜索。

## 及时开新会话

❗️ 两个原因：

- 每次发消息，模型收到的上下文大致包括：

    - 系统提示、Rules、工具定义

    - 整段对话历史（你的问题、AI 回答、读过的文件片段、终端输出）

    - 本轮@的文件、需求、报错等

这些加起来占满 context window。窗口满了之后：

- 截断最前面的内容（直接丢信息）

- 摘要压缩旧对话（保留大意、丢细节）

- 单上下文原则（ Single Context ，cursor团队分享的思路），在一段对话里理解两个以上的目标，会出现：

    - 改错文件、改多余文件 （对话历史遗留上个任务的文件和假设）

    - 越聊越啰嗦、越跑题 （之前话题挤占注意力）



✅ 推荐：



> *AI 编码的瓶颈 increasingly 是 context，不是模型智商。*
> *一个 session 只做一件事 → 减少噪声和误改；切换任务就新开 → 不付上一任务的 token 税；长任务主动摘要 → 在爆窗前保留「目标、文件、决策、测试」，而不是保留「读了哪些无关目录」。*
> 
> 

## 长任务要做检查点

长任务每完成一个阶段，让 AI 产出短检查点：

```Plain Text
当前目标：
已改文件：
关键决策：
验证结果：
遗留风险：
下一步：

```

这样后续继续任务时，可以用一段高信号摘要替代完整历史。

# 四、缓存与模型调用策略

## 稳定前缀，动态内容后置

✅ 背景：

OpenAI 文档说明，prompt caching 依赖相同的 prompt 前缀；静态内容应放前面，变量内容放后面。Anthropic 文档也建议把工具定义、系统指令、上下文示例等稳定内容放在前面，并用 cache breakpoint 控制复用范围。

对企业研发的含义：

- 不要频繁改系统提示词、工具定义、全局规则。

- 不要把当前时间、临时状态、用户输入塞进常驻前缀。

- 工具列表和 schema 尽量保持稳定顺序。

- API 集成要观察 `cached\_tokens`、`cache\_read\_input\_tokens` 等指标，不要凭感觉优化。

## 小任务用小模型，大任务用强模型

- 小模型：命名、格式化、简单脚本、局部解释、日志摘要。

- 强模型：跨模块重构、复杂 bug、架构方案、风险评审、安全相关变更。

- 混合策略：让便宜模型做搜索和摘要，让强模型做最终判断和关键修改。

# 五、模式选择：先省探索成本，再省返工成本

## Ask 模式：只读分析

适合“弄清楚”：查调用链、解释模块、定位可能原因。它最省，因为不会引入修改和验证循环。

## Plan 模式：复杂任务先规划

适合跨文件、跨模块、有多种实现路径的任务。先规划能减少 Agent 盲改和返工。

## Agent 模式：让 AI 动手，但必须给边界

适合目标明确、验收明确的改动。关键是给出边界：允许改哪些文件、不能做什么、验证命令是什么。

# 六、企业团队可执行清单

- 每个任务先写清：目标、范围、验收、测试命令。

- 日志只给关键片段；大文件让 AI 自己按需读取。

- 仓库规则写进 `AGENTS\.md` 或 Copilot instructions，不在每次对话里重复。

- 复杂任务先 Plan，再 Agent；小问题直接 Ask 或局部 Agent。

- 长任务定期生成检查点，用摘要替代完整历史。

- API 场景优先利用 prompt caching，并监控缓存命中指标。

- 代码输出优先 patch/diff，少输出完整文件。

# 参考资料

- [Anthropic：Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

- [Anthropic：Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

- [OpenAI：Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

- [VS Code：Use custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

- [GitHub Docs：Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)

