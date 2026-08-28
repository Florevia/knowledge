# 支付幂等策略与 PayPal 实现

## 概述

幂等策略指：同一个操作执行一次，和重复执行多次，最终结果相同，不会产生重复副作用。在支付场景中，用户重复点击、网络超时自动重试、前端重复请求，都不能导致重复创建订单、重复扣款或重复发货。本文整理完整 PayPal 支付流程、前后端职责、Capture 与 Webhook 的配合方式，以及贯穿各环节的幂等落地。

## 要点

- **幂等 ≠ 无效**：不是「不做」，而是「重复做也只生效一次」
- 完整链路：`创建本地订单 → Create PayPal Order → 用户授权 → Capture → Webhook 确认 → 发货/解锁`
- **前端管交互与拉起支付，后端管建单、扣款、发货与对账**；权益发放以后端为准
- 拉起 PayPal：H5 优先用 **JS SDK**，可用 **Redirect** 兜底；可能 App Switch，但不是原生 App 内购
- **Capture = 你主动问能否收款；Webhook = PayPal 主动通知状态变化**；正式环境两者配合，不是二选一
- PayPal 通过请求头 `PayPal-Request-Id` 识别重复请求，返回原操作状态
- Key 必须按业务操作稳定生成，禁止每次重试随机 UUID
- 仅靠 PayPal 不够，本地还需：唯一约束 + 状态机 + Webhook 去重 + 只发货一次

## 详细内容

### 1. 完整支付流程

以 PayPal Orders v2（Create → Approve → Capture）为准，前后端与 PayPal 的主链路如下：

```text
用户点击 SKU / 购买
        │
        ▼
① 前端请求后端创建支付
        │
        ▼
② 后端创建本地订单（PENDING）
   生成 localOrderNo
        │
        ▼
③ 后端调用 PayPal Create Order
   Header: PayPal-Request-Id = create-${localOrderNo}
   拿到 paypalOrderId，回写本地订单
        │
        ▼
④ 前端拉起 PayPal（SDK / 跳转）
   用户登录并同意付款
        │
        ▼
⑤ 用户授权完成，回到站点
   前端把 paypalOrderId / localOrderNo 交给后端
        │
        ▼
⑥ 后端调用 PayPal Capture
   Header: PayPal-Request-Id = capture-${localOrderNo}
        │
        ├── 成功：本地订单 PENDING → PAID，记录 paypal_capture_id
        │         发放权益（金币 / 解锁章节等），只发一次
        │
        └── 超时/失败：用相同 Request-Id 重试，或等 Webhook
        │
        ▼
⑦ PayPal Webhook 推送（如 PAYMENT.CAPTURE.COMPLETED）
   按 event.id 去重
   若同步 Capture 未完成，这里补齐 PAID + 发货
        │
        ▼
⑧ 前端刷新订单/权益状态
   展示支付成功，进入阅读/使用
```

#### 1.1 各步骤职责

| 步骤 | 谁做 | 做什么 | 幂等点 |
|------|------|--------|--------|
| ① 发起支付 | 前端 | 防连点；携带 SKU、用户、归因参数请求后端 | 按钮禁用 / loading，避免短时间狂点 |
| ② 本地建单 | 后端 | 写入 `order_no`、金额、商品、用户、`PENDING` | `UNIQUE(order_no)`；同业务键可复用未支付单 |
| ③ Create Order | 后端 → PayPal | 创建 PayPal 订单，保存 `paypal_order_id` | `PayPal-Request-Id: create-${localOrderNo}` |
| ④ 用户授权 | 前端 + PayPal | SDK 或跳转收银台，用户同意付款 | 同一 `paypalOrderId` 继续支付，不重复 Create |
| ⑤ 回跳/回调 | 前端 → 后端 | 把授权结果交给后端触发 Capture | 不在此步直接发货 |
| ⑥ Capture | 后端 → PayPal | 正式扣款；成功后改状态并发货 | `PayPal-Request-Id: capture-${localOrderNo}` + 条件更新 |
| ⑦ Webhook | PayPal → 后端 | 异步确认扣款结果，兜底同步失败场景 | `event.id` 去重；已 PAID 则跳过发货 |
| ⑧ 展示结果 | 前端 | 轮询或拉取订单/权益，再展示成功 | 以服务端状态为准 |

#### 1.2 订单状态机（建议）

```text
PENDING ──Capture/Webhook 成功──▶ PAID ──▶ FULFILLED（已发货/已解锁）
   │
   ├── 用户取消 / 超时未付 ──▶ CANCELLED
   └── Capture 明确失败 ──▶ FAILED
```

状态迁移原则：

- 只有 `PENDING → PAID` 允许触发发货准备
- 只有「首次从未发货变为已发货」才真正发放权益
- `PAID` / `FULFILLED` 上的重复 Capture、重复 Webhook，一律当作成功回执，不再扣款、不再发货

#### 1.3 同步 Capture 与 Webhook 如何配合

| 路径 | 作用 | 注意 |
|------|------|------|
| 同步 Capture | 你主动问 PayPal：现在能不能完成收款，并尽快给用户反馈 | 可能超时；超时后用相同 `PayPal-Request-Id` 重试 |
| Webhook | PayPal 主动通知：支付状态变化了（成功/待处理/退款/撤销等） | 必须验签；按 `event.id` 去重 |
| 发货 | Capture 成功或 Webhook 确认后执行 | 用状态机保证只发一次；两者谁先到都行 |

推荐口径：**权益发放以后端为准**；前端成功页只展示，不作为发货依据。详见 **1.7 Capture 与 Webhook**。

#### 1.4 异常与重试

| 异常 | 处理 |
|------|------|
| 用户重复点击购买 | 前端防抖；后端对同一业务单复用 `PENDING` 订单，或拒绝重复建单 |
| Create Order 超时 | 用相同 `create-${localOrderNo}` 重试，不要新生成 UUID |
| 用户授权后前端重复通知 Capture | 用相同 `capture-${localOrderNo}`；本地已 `PAID` 则直接返回成功 |
| Capture 超时但实际已扣款 | 相同 Request-Id 重试会拿到原结果；同时依赖 Webhook 补齐本地状态 |
| Webhook 重复推送 | `event.id` 已存在则直接 `200` |
| 用户付了钱但未发货 | 对账任务扫描 `PAID` 未履约订单，补发权益 |

#### 1.5 前端与后端各自职责

边界一句话：**前端负责体验与支付拉起，后端负责钱、单、权；前端展示结果，后端裁决结果。**

##### 前端职责

| 职责 | 说明 |
|------|------|
| 展示 SKU / Paywall | 展示商品、价格、余额不足引导等，不自行改价 |
| 发起支付请求 | 携带 SKU、用户标识、归因参数（如 `psi` / `fbclid`）请求后端建单；`psi` 与 Meta Pixel 区别见 [Meta Pixel 与 PSI 推广归因](./Meta-Pixel与PSI推广归因.md) |
| 防重复点击 | 按钮 loading / 禁用，避免短时间多次发起支付 |
| 拉起 PayPal | 用后端返回的 `paypalOrderId` 调 SDK 或跳转收银台 |
| 处理授权回跳 | 用户同意/取消后回到站点，把 `localOrderNo` / `paypalOrderId` 交给后端 Capture |
| 展示支付结果 | 轮询或拉取订单/权益接口，展示成功、失败、处理中 |
| 刷新业务状态 | 支付成功后刷新余额、已解锁章节、阅读器锁章状态等 |
| 体验兜底 | 超时、取消、网络失败时的提示与可重试入口 |

前端**不应**做的事：

- 不持有 PayPal Client Secret，不直连 Create / Capture 等需密钥的 API
- 不根据「PayPal 回跳成功」或前端本地标记直接发货/解锁
- 不自己生成最终金额去覆盖后端计价
- 不把 Webhook、对账、退款当成前端流程

##### 后端职责

| 职责 | 说明 |
|------|------|
| 校验与计价 | 校验用户、SKU、库存/可购状态，按服务端价格生成应付金额 |
| 创建本地订单 | 生成 `localOrderNo`，写入 `PENDING`，落归因与商品快照 |
| 调用 PayPal Create | 使用 `PayPal-Request-Id: create-${localOrderNo}`，回写 `paypal_order_id` |
| 调用 PayPal Capture | 授权完成后正式扣款，使用稳定 `capture-${localOrderNo}` |
| 订单状态机 | `PENDING → PAID → FULFILLED` 等迁移只由服务端执行 |
| 发放权益 | 加金币、解锁章节等；条件更新保证只发一次 |
| 接收 Webhook | 验签、按 `event.id` 去重，兜底同步 Capture 失败/丢失 |
| 查询接口 | 提供订单状态、权益状态给前端轮询/刷新 |
| 对账与补偿 | 扫描已扣款未履约订单，补发权益；处理退款等 |

后端**必须**守住的底线：

- Client Secret、Webhook 验签、幂等 Key、唯一约束都在服务端
- 发货/解锁只认 Capture 成功或可信 Webhook，不认前端「我成功了」
- 重复请求返回原结果，不重复扣款、不重复发货

##### 职责对照（谁拍板）

| 事项 | 前端 | 后端 |
|------|:----:|:----:|
| 展示商品与拉起支付 | ✅ | |
| 最终价格与建单 | | ✅ |
| `PayPal-Request-Id` / 密钥 | | ✅ |
| 用户授权交互 | ✅ | |
| Capture 扣款 | | ✅ |
| Webhook 验签与去重 | | ✅ |
| 发货 / 解锁 / 加余额 | | ✅ |
| 成功/失败 UI | ✅ | |
| 订单是否已支付的最终判断 | | ✅ |

#### 1.6 如何拉起 PayPal

可以在当前 H5 页发起支付，但**通常不是「整页硬跳进某个 App」这一种形式**。Web/H5 常见有两类，另加手机上可能出现的 App Switch：

##### 方式一：JS SDK（优先）

页面内嵌 PayPal Smart Buttons：

1. 前端向后端建单，拿到 `paypalOrderId`
2. 用户点击 PayPal 按钮
3. PayPal SDK 弹出登录/确认层（弹窗或同页 overlay）
4. 用户同意后，前端把结果交给后端做 Capture

特点：人仍在站点上下文中，回跳与转化更可控。移动浏览器里也可能再跳到 PayPal 页面。

##### 方式二：整页跳转收银台（Redirect）

后端 Create Order 时配置 `return_url` / `cancel_url`，前端直接跳转：

```text
当前 H5 页 → PayPal 托管支付页 → 付完 redirect 回 return_url
```

特点：实现简单，适合不想接 SDK 或 SDK 兼容差的场景；回站后用 URL 中的订单信息触发后端 Capture。

##### 会不会进 PayPal App？

| 形态 | 说明 |
|------|------|
| Web / H5 主流程 | 浏览器内的 PayPal 弹层或托管页 |
| 手机 App Switch | 若已安装 PayPal App，可能浏览器 ↔ App 切换，付完再回 H5 |
| 不是什么 | 不是自研 PayPal App，也不是必须装 App 才能付，更不是 App 内购 |

##### H5 小说站选型建议

| 方式 | 建议 |
|------|------|
| JS SDK 按钮 | **优先**，转化和回跳可控性更好 |
| Redirect | 可做兜底，尤其 Facebook / Instagram 内置浏览器兼容差时 |
| 依赖拉起 App | **不要当主方案**；内置浏览器里 App Switch 更容易失败 |

文档前文「用 `paypalOrderId` 调 SDK 或跳转收银台」，指的就是上述两种 **Web 形态**，不是原生 App 内购。

#### 1.7 Capture 与 Webhook

一句话区分：

```text
Capture  = 你主动问 PayPal：「现在能不能完成收款？」并立即拿结果
Webhook  = PayPal 后续主动通知你的服务器：「这笔支付状态发生变化了。」
```

##### Webhook 是什么

Webhook 可以理解成「支付结果回调」。正常 API 方向是「你的服务器 → PayPal」；Webhook 方向相反：

```text
PayPal → 你的服务器（配置的 HTTPS 地址，如 https://example.com/api/paypal/webhook）
```

支付成功、失败、退款或撤销时，PayPal 会向该地址发 `POST`。PayPal 官方将其描述为由 PayPal 向商户服务器发送的反向 API 回调。

示例事件体：

```json
{
  "id": "WH-123456",
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "resource": {
    "id": "CAPTURE-987654",
    "status": "COMPLETED",
    "amount": {
      "currency_code": "USD",
      "value": "9.99"
    }
  }
}
```

服务器收到后可：把订单标为已支付、发放权益（解锁章节/加金币）、记录交易流水等。

##### 已经调用 Capture，为什么还要 Webhook

Capture 的成功响应可能到不了你的系统。例如：

```text
1. 用户完成 PayPal 付款
2. 后端调用 Capture
3. PayPal 已扣款成功
4. 你的服务器网络超时，没收到成功响应
5. 结果：PayPal 已收款，本地订单仍是未支付
```

随后 Webhook 推送 `PAYMENT.CAPTURE.COMPLETED`，系统即可补偿：订单改为已支付并发货。

##### 还有哪些场景需要 Webhook

| 场景 | 说明 |
|------|------|
| 用户付完就关页面 | 若只依赖前端 `onApprove`，可能从不触发 Capture/成功页；Webhook 不依赖页面是否还开着 |
| 支付非立即完成 | 可能先 `PENDING`，后变 `COMPLETED`；收到 `PAYMENT.CAPTURE.PENDING` **不要立即履约**，等 `PAYMENT.CAPTURE.COMPLETED` 再发货 |
| 事后退款 | 几天后可能收到 `PAYMENT.CAPTURE.REFUNDED`，据此关权限、记退款、停付费内容 |
| 撤销或拒绝 | 如 `PAYMENT.CAPTURE.DENIED`、`PAYMENT.CAPTURE.REVERSED` |

##### 两者如何配合（不是二选一）

```text
用户付款
   ↓
后端调用 Capture
   ↓
Capture 返回 COMPLETED → 立即更新订单（给用户即时反馈）
   ↓
Webhook 再次通知 COMPLETED → 核对并补偿遗漏
```

正式设计建议：

```text
Capture 返回结果：用于立即反馈用户
Webhook：用于最终对账、状态补偿、处理后续退款/撤销
```

核心作用：无论前端是否关闭、网络是否超时、支付是否延迟完成，系统最终都能拿到可靠的支付状态。

##### Webhook 会不会导致重复发货

有可能收到重复通知，必须做幂等（见 4.3）。典型效果：

```text
第一次：PENDING → PAID，并发送权益
第二次：订单已是 PAID，不再重复发送
```

##### 是否一定要接

| 场景 | 建议 |
|------|------|
| 本地学习 / 临时 Demo | 可暂时只调 Capture |
| 正式上线、真实扣款与发货 | **强烈建议接 Webhook** |

不接 Webhook 时容易出现：用户已付款但未发货；已退款仍提供服务；`PENDING` 却提前发货；前端关页后订单状态丢失。

### 2. 什么是幂等策略

| 场景 | 有幂等保护 | 无幂等保护 |
|------|------------|------------|
| 用户支付 100 元，首次响应超时后重试 | 识别为同一次支付，不再扣款，最终只扣 100 元 | 第一次扣 100，第二次再扣 100，最终重复扣款 200 元 |

核心目标：重复请求 → 同一结果，无重复副作用。

### 3. PayPal 侧：`PayPal-Request-Id`

PayPal 使用请求头实现幂等：

```http
PayPal-Request-Id: capture-ORDER-20260713-001
```

同一项操作重试时，必须继续使用**相同的** `PayPal-Request-Id`。PayPal 会识别重复请求并返回原操作状态，而不是重新执行一次。

#### 正确示例（Capture）

```js
await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    // 同一个订单的 Capture 重试时，始终使用相同值
    "PayPal-Request-Id": `capture-${orderId}`,
  },
  body: "{}",
});
```

#### 错误做法

```js
// 错误：每次请求都不同，PayPal 会认为是新的操作
"PayPal-Request-Id": crypto.randomUUID()
```

#### 推荐的稳定 Key 约定

| 操作 | Key 模式 |
|------|----------|
| 创建订单 | `create-${localOrderNo}` |
| 捕获付款 | `capture-${localOrderNo}` |
| 退款 | `refund-${localOrderNo}-${refundNo}` |

### 4. 本地数据库也要做幂等

仅依靠 PayPal 还不够，自有系统也要防重复处理。

#### 4.1 条件更新（状态机）

```sql
UPDATE orders
SET
  status = 'PAID',
  paypal_capture_id = ?
WHERE
  order_no = ?
  AND status = 'PENDING';
```

| 执行次序 | 结果 |
|----------|------|
| 第一次 | `PENDING → PAID`，影响 1 行 |
| 第二次 | 订单已是 `PAID`，影响 0 行，不会重复发货 |

#### 4.2 唯一约束

```sql
UNIQUE(order_no)
UNIQUE(paypal_order_id)
UNIQUE(paypal_capture_id)
```

#### 4.3 Webhook 按 `event.id` 去重

```js
app.post("/api/paypal/webhook", async (req, res) => {
  const event = req.body;

  const exists = await db.webhookEvents.findUnique({
    where: { eventId: event.id },
  });

  if (exists) {
    // 已经处理过，直接返回成功
    return res.sendStatus(200);
  }

  await db.transaction(async (tx) => {
    await tx.webhookEvents.create({
      data: {
        eventId: event.id,
        eventType: event.event_type,
      },
    });

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      // 条件更新：只有 PENDING 才会变成 PAID，避免重复发货
      await tx.orders.updateMany({
        where: {
          paypalCaptureId: event.resource.id,
          status: "PENDING",
        },
        data: { status: "PAID" },
      });
    }
  });

  res.sendStatus(200);
});
```

生产环境还需：**验签**（确认请求来自 PayPal）、按 `event_type` 分支处理退款/撤销，以及在「首次变为 PAID」时触发发货。

### 5. 完整支付幂等策略

```text
PayPal-Request-Id
        +
数据库唯一约束
        +
订单状态机
        +
Webhook event.id 去重
        +
支付成功后只发货一次
```

PayPal 官方建议：在创建或修改数据的 API 请求中使用 `PayPal-Request-Id`，以避免重复交易；例如用户多次点击购买按钮，也不应因此被多次扣款。

## 参考 / 来源

- [PayPal Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [Making PayPal REST API requests](https://developer.paypal.com/api/make-api-requests)
- [PayPal Orders API](https://developer.paypal.com/docs/api/orders/v2/)
- [Webhooks guide](https://developer.paypal.com/api/rest/webhooks/)
- [Subscribe to checkout webhooks](https://developer.paypal.com/docs/multiparty/checkout/apm/reference/subscribe-to-webhooks/)
- [Webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/)
