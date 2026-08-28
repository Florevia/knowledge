## 如何检验 Agent 生成代码的质量？

不能只简单回答：人工review、跑单元测试。

应该从这个角度出发：**代码质量不是一个指标，而是多维度 Evaluation。**

**可以设计这样一个多维度评估模型：**

| 层级 | 检验内容   | 例子                             |
| ---- | ---------- | -------------------------------- |
| L0   | 能不能解析 | Syntax / Compile                 |
| L1   | 静态质量   | Lint、Type Check                 |
| L2   | 局部正确性 | Unit Test                        |
| L3   | 模块正确性 | Integration Test                 |
| L4   | 系统正确性 | E2E Test                         |
| L5   | 回归风险   | Regression Test                  |
| L6   | 安全性     | SAST / Dependency Scan           |
| L7   | 工程质量   | 可维护性、复杂度、Diff           |
| L8   | Agent 效率 | Token、Cost、Latency、Tool Calls |

---

**一个 Coding Agent 生成 patch 以后，至少应该跑：**

```
Build 构建
Lint 静态检查
Type Check 类型检查
Unit Test 单元测试
Integration Test 集成测试
Regression Test 回归测试
```

**但是测试通过 ≠ Agent 写得好。**

> 比如 Agent 为了解一个小问题：修改了 27 个文件、删除了异常处理、加了大量无关 abstraction、把 test 改成永远 pass，Tests 可能照样绿。

**因此还要评估：**

```
Patch correctness 补丁正确性
Patch scope 补丁范围
Code maintainability 代码可维护性
Test quality 测试质量
Security 安全性
API compatibility 接口兼容性
Performance regression 性能回归
```

**尤其要注意：Agent 可能通过修改测试来适配自己的错误实现**

**所以测试本身最好存在：**

```
Hidden Test 隐藏测试
External Evaluator 外部评估器
Independent Test Suite 独立测试套件
```

**Coding Agent 的质量可以粗略看成：**

```
代码质量 = Model × Context × Tools × Feedback Loop × Evaluation × Runtime
```

## 实现高质量 Coding Agent 的几个关键点

### 第一：给 Agent 正确的 Context

Agent 最容易出现的问题往往不是不会写，而是：不知道这个项目本来是什么样。

比如用户说：加一个登录按钮。

Agent需要知道：

```
项目目录
框架版本
现有 Auth 实现
Design System
API
Coding convention
测试方式
相关组件
相关类型
```

所以 Coding Agent 经常需要：

```
Symbol Search 符号搜索
Code Search 代码搜索
Dependency Graph 依赖图
LSP 语言服务器协议
AST 抽象语法树
Semantic Retrieval 语义检索
Git History  Git 历史
```

而不是把整个 repository 一股脑塞进 Context Window。

### 第二：增强 Agent 的工具能力

例如给 Agent：

```
read_file
search_code
edit_file
terminal
git diff
compiler
test runner
LSP
browser
```

因为 LLM 本身并不知道它写出的代码到底能不能运行。

真正运行 `npm test` 的是 Agent Harness / Runtime。

### 第三：建立闭环

```

理解任务
↓
读取代码
↓
定位影响范围
↓
修改
↓
Build
↓
Test
↓
观察错误
↓
修复
↓
重新 Test
↓
Review Diff
↓
结束
```

真正让 Agent 质量发生跃迁的通常是：闭环，而不是单次生成能力。

```
Generate 生成 → Execute 执行 → Observe 观察 → Repair 修复
```

### 第四：让 Agent 自己验证，而不是自己评价


### 第五：限制修改范围

Coding Agent 很常见的毛病是：为解决 A，顺便重构 B、C、D。

所以 Runtime 可以给约束：

```
最小差异
不要修改无关文件
不要修改公共 API
除非必要，不要修改测试
保持向后兼容
```

## Agent 原理

**Agent 本质是把 LLM 放进一个“感知 → 决策 → 行动 → 获取反馈”的控制循环中。**

一个最小 Agent：

```
User Goal
            │
            ▼
     Context / State
            │
            ▼
          LLM
            │
       decide action
            ▼
          Tool
            │
      Environment
            │
       Observation
            │
            └──────────┐
                       ▼
                      LLM
```
不断循环：

```
Observe 观察
↓
Decide 决策
↓
Act 行动
↓
Observe 观察
↓
Decide 决策
↓
Act 行动
```
直到：
```
Goal Completed 任务完成
Stop Condition 停止条件
Error 错误
Budget Exhausted 预算耗尽
User Interrupt 用户中断
```

### 一个 Agent 一般有哪些组成部分？

**可以概括成：**

**注意：**

真正执行 shell、读文件、修改代码的通常不是 LLM。

**例如模型输出：**

```
{
"tool": "read_file",
"path": "src/app.ts"
}
```

```
Agent Runtime
↓
Tool Executor
↓
Filesystem
```   
然后把：
```
文件内容
```
作为 Observation 再返回给模型。

### Coding Agent 的完整工作过程

**假设：**

```
“修复登录以后页面白屏的问题。”
```

一个成熟 Coding Agent 可能是：

```
User
│
▼
Agent Runtime
│
├─ Repository Context
│
▼
LLM
│
├─ search_code("login")
│
▼
Tool Executor
│
▼
Search Result
│
▼
LLM
│
├─ read_file(...)
│
▼
LLM
│
├─ edit_file(...)
│
▼
LLM
│
├─ run_test(...)
│
▼
Terminal
│
├─ Test Failed
│
▼
LLM
│
├─ 修复
│
▼
Terminal
│
├─ Test Passed
│
▼
git diff
│
▼
Evaluator
│
▼
Final Answer
```
这才是 Coding Agent。

### Agent 和普通 Chatbot 最大区别

**这是非常容易被追问的。**

**Chatbot：**

```
Input
↓
LLM
↓
Output
```
Agent：

```
Goal
↓
LLM
↓
Action
↓
Environment
↓
Observation
↓
LLM
↓
Action
↓
...
↓
Result
```
关键不是“用了 Function Calling 就叫 Agent”。

**关键是：**

是否存在持续的状态、环境交互以及基于环境反馈动态决定下一步行动的控制循环。

### Workflow 和 Agent 又有什么区别？

Workflow：

```
A
↓
B
↓
C
↓
D
``` 
步骤主要由程序员提前定义。

**Agent：**

```
当前状态
↓
LLM
↙ ↓ ↘
A B C
```
下一步由模型根据环境动态决定。

**所以：**

**Workflow 是 deterministic orchestration 为主；Agent 是 model-driven decision 为主。**

实际生产系统通常不是纯 Agent，而是：

**Workflow + Agent 混合架构。**

比如：

固定：
```
Checkout repository
↓
Agent 自主：
```
分析 + 修改代码
↓
↓
固定：
Security Check
↓
Agent 自主：
固定：
Tests
↓
Agent 自主：
根据失败原因修复
↓
固定：
Final Verification
```
这种结构通常比“完全放飞 Agent”稳定很多。

如果我是你的面试官，我接下来会怎么追问



Tool Calling 就等于 Agent 吗？ Agent 定义
MCP 是 Agent 吗？ Protocol vs Runtime
Agent 如何知道任务完成？ Stop Condition / Evaluator
Agent 无限循环怎么办？ Budget / Step Limit
Agent 怎么处理 Context 太长？ Retrieval / Compression
Agent 改坏项目怎么办？ Sandbox / Git / Eval
怎么阻止 Agent 执行危险命令？ Permission / Policy
怎么评估两个 Coding Agent 谁更好？ Benchmark / Eval
Test 通过是不是代表代码正确？ Verification 边界
多 Agent 一定比单 Agent好吗？ Orchestration trade-off
