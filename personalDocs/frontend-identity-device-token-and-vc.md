# 前端身份、设备标识与请求参数 `vc`

本文整理 Novel H5 当前项目中的设备标识、匿名/登录账户、Token、SSR 同步和 `vc` 请求校验机制，并补充常见前端处理方式与安全边界。

> 本文分为“当前项目实现”和“通用建议”。接口字段含义与算法必须以上游接口文档为准，不能根据行业习惯自行修改。

## 一、先区分几个容易混淆的概念

### 1. `userId`

`userId` 表示业务账户身份，回答“当前用户是谁”。

- 匿名登录会得到匿名账户的 `userId`。
- Google 登录成功后会得到对应 Google 账户的 `userId`。
- 同一个正式账户在不同设备登录时，通常使用相同的 `userId`。
- `userId` 是标识，不是认证凭证，不能仅凭 `userId` 授权访问数据。

### 2. 业务 `accessToken`

业务 `accessToken` 表示当前账户会话的访问凭证，回答“当前请求凭什么被允许”。

当前项目中：

- 匿名登录返回一组 `accessToken + userId`。
- Google 登录成功后，使用接口返回的最新 `accessToken + userId` 原子替换匿名会话。
- 需要认证的上游接口通过名为 `accessToken` 的请求头携带凭证，不添加 `Bearer` 前缀。
- 业务会话当前保存在 `localStorage` 中。

登录后的 `accessToken` 是否与匿名阶段相同，必须以登录接口响应为准。前端应重新消费并保存完整登录响应，不能自行判断是否复用旧值。

### 3. 小说接口公共参数 `tk`

小说接口公共参数中的 `tk` 是 Web 浏览器实例标识，不是业务 `accessToken`，也不是 `userId`。

它用于让上游区分不同客户端实例，并参与公共参数 `vc` 的计算。

这里所说的“设备”并不是可靠的物理设备：

- 同一台电脑更换浏览器后会得到不同的 `tk`。
- 使用无痕窗口可能得到新的 `tk`。
- 清除站点 Cookie 和 `localStorage` 后会生成新的 `tk`。
- 同一浏览器配置被复制时，标识也可能被复制。

因此，更准确的名称是“浏览器实例标识”或“Web 安装实例标识”。

### 4. 埋点 SDK 中的 `tk`

当前埋点 SDK 也使用名为 `tk` 的字段，但它的含义不同：

```text
埋点 SDK tk = 当前业务 accessToken
businessuserid = 当前业务 userId
```

所以项目中存在两个同名字段：

| 使用位置 | `tk` 的实际含义 | 登录后是否可能变化 |
| --- | --- | --- |
| 小说接口公共查询参数 | 浏览器实例标识 | 正常登录不会改变 |
| 悬壶埋点 SDK | 当前业务 `accessToken` | 登录切换会话后可能改变 |

阅读代码和接口文档时必须先确认字段所属系统，不能因为字段名相同就认为语义相同。

## 二、浏览器实例标识 `tk` 如何产生

当前实现位于 `app/shared/api/device-token.ts`。

### 生成与读取顺序

客户端调用 `getOrCreateDeviceToken()` 时：

1. 优先读取 `localStorage` 中的 `novel-h5:device-token`。
2. 如果不存在或格式无效，尝试读取 Cookie `novel_device_token`。
3. 如果两处都没有有效值，调用 `crypto.randomUUID()` 生成随机 UUID。
4. 将最终值写入 `localStorage`。

有效格式要求：

```text
仅允许字母、数字、下划线和连字符，长度为 16～128
```

该标识不是从硬件序列号、IP 地址、浏览器指纹或 Google 账户中读取的，而是项目首次运行时随机生成的。

### 它什么时候会变化

正常情况下，下列操作不会改变小说接口公共参数 `tk`：

- 页面内跳转；
- 刷新页面；
- 关闭后重新打开浏览器；
- 匿名登录；
- Google 登录；
- 业务 `accessToken` 更新。

下列情况可能生成新的 `tk`：

- Cookie 和 `localStorage` 同时被清除；
- 用户使用新的浏览器或新的浏览器 Profile；
- 用户进入未复用原存储的无痕环境；
- 存储值格式无效；
- 浏览器存储被隐私策略、扩展或系统清理；
- 服务端首次收到既没有设备请求头、也没有设备 Cookie 的请求。

只清除其中一份时，项目通常可以用另一份恢复相同标识。

## 三、为什么同时使用 `localStorage` 和 Cookie

### `localStorage` 的作用

`localStorage` 只能由浏览器 JavaScript 读取，适合客户端长期保存标识。

但它不会自动随 HTTP 请求发送，而且 Nuxt SSR 服务端无法访问用户浏览器里的 `localStorage`。

因此客户端调用同源 BFF 时，`useApiFetch` 会把该值手动写入内部请求头：

```http
x-novel-device-token: <device-token>
```

### Cookie 的作用

Cookie 会自动随同源 HTTP 请求发送，因此 Nitro BFF 在以下场景也能取得设备标识：

- 页面首次请求；
- 浏览器整页刷新；
- Nuxt SSR 渲染；
- 客户端 JavaScript 尚未运行时。

当前 Cookie 配置为：

- 名称：`novel_device_token`
- 有效期：一年
- `Path=/`
- `SameSite=Lax`
- 生产环境启用 `Secure`
- `HttpOnly=false`

这里使用 `HttpOnly=false` 是因为客户端需要读取 Cookie，在 `localStorage` 不可用或尚未初始化时恢复设备标识。该值不能被当成敏感登录凭证。

### BFF 的取值优先级

Nitro BFF 在 `server/utils/novel-api.ts` 中按以下顺序解析：

```text
x-novel-device-token 请求头
    ↓ 无有效值
novel_device_token Cookie
    ↓ 无有效值
服务端 randomUUID()
```

如果最终使用的值与 Cookie 不一致，BFF 会通过 `Set-Cookie` 更新 Cookie。

因此这里的“同步”不是浏览器中的实时双向同步，而是请求过程中进行对齐：

```text
客户端 localStorage
    ↓
x-novel-device-token
    ↓
Nitro BFF
    ↓
写入或修正 Cookie
    ↓
后续 SSR 请求自动携带 Cookie
```

典型首次访问流程：

```text
1. 浏览器请求 SSR 页面
2. BFF 未收到有效设备 Cookie
3. BFF 生成 UUID，并通过 Set-Cookie 返回
4. 客户端启动后读取 Cookie
5. 客户端将相同 UUID 写入 localStorage
6. 后续客户端请求通过自定义请求头携带该值
```

## 四、BFF 如何组装小说上游请求

浏览器不直接访问需要统一参数和服务端配置的小说上游，而是调用同源 Nitro API。

数据流为：

```text
Vue 页面或组件
    ↓ useApiFetch()
Nitro BFF / server/api/**
    ↓ novelApiRequest()
小说上游 API
```

`novelApiRequest()` 会统一添加公共查询参数：

- `tk`：浏览器实例标识；
- `pkg`：包名；
- `v`：数字版本号；
- `vn`：版本名称；
- `lang`：语言；
- `ts`：当前时间戳；
- `vc`：公共参数校验摘要；
- `os`：当前固定为 `web`；
- `vitaTaskFlg`：当前固定为 `1`。

需要登录态的请求还会额外携带：

```http
accessToken: <业务访问凭证>
```

公共参数 `tk` 和业务请求头 `accessToken` 是两条独立的数据链路。

## 五、`vc` 是什么

`vc` 可以理解为 verification code，即根据若干公共参数生成的请求校验摘要。

它主要用于让上游检查参与计算的参数是否与 `vc` 匹配。它不是：

- 业务登录 Token；
- 用户 ID；
- 可解密的密文；
- 标准数字签名；
- 完整的防重放机制。

### 当前计算公式

根据上游文档，参与计算的字段按以下顺序直接拼接：

```text
tk + pkg + vn + lang + ts + 固定盐值
```

然后计算 MD5：

```text
vc = MD5(tk + pkg + vn + lang + ts + salt)
```

当前代码实现：

```ts
createHash('md5')
  .update(
    `${deviceToken}${pkg}${version}${language}${timestamp}${VC_SIGNATURE_SALT}`,
  )
  .digest('hex')
```

各行含义：

1. `createHash('md5')`：创建 Node.js MD5 摘要计算器。
2. `update(...)`：将拼接后的字符串输入摘要计算器。
3. `digest('hex')`：结束计算并输出十六进制字符串。

MD5 输出为 128 bit，使用十六进制表示后通常是 32 个字符。

### 参与和不参与计算的字段

参与计算：

- `tk`
- `pkg`
- `vn`
- `lang`
- `ts`
- 固定盐值

当前文档公式中不参与计算：

- 数字版本号 `v`
- `os`
- `vitaTaskFlg`
- 业务 `accessToken`
- 业务 `userId`

特别注意：代码参数名使用 `version`，但传入的是版本名称 `vn`，不是数字版本号 `v`。

### 为什么每次请求的 `vc` 通常不同

`ts` 是每次请求时生成的时间戳。即使其他字段完全相同，只要 `ts` 改变，参与 MD5 的输入就会改变，最终 `vc` 也会改变。

MD5 具有确定性：

- 相同输入一定得到相同输出；
- 任意输入字段变化，输出通常都会明显变化；
- 无法从输出直接还原原始输入。

## 六、上游可能如何校验 `vc`

按照该公式，服务端的基本校验过程应为：

```text
1. 读取请求中的 tk、pkg、vn、lang、ts 和 vc
2. 使用服务端持有的相同盐值重新计算 expectedVc
3. 比较 expectedVc 与请求中的 vc
4. 不一致则拒绝请求
```

伪代码：

```ts
const expectedVc = md5(tk + pkg + vn + lang + ts + salt)

if (receivedVc !== expectedVc) {
  rejectRequest()
}
```

如果请求中的 `tk`、`pkg`、`vn`、`lang` 或 `ts` 被修改，但 `vc` 没有同步重新计算，校验就会失败。

### 文档目前没有说明的校验项

仅凭现有公式不能确定上游是否还执行以下校验：

- `ts` 允许的时间偏差；
- 请求过期时间；
- 同一组 `ts + vc` 是否允许重复使用；
- 签名失败对应的业务错误码；
- 是否区分大小写；
- 字符串编码是否明确为 UTF-8；
- 是否会轮换固定盐值。

这些行为必须向后端确认，不能仅根据公式推断。

## 七、`vc` 的安全能力与限制

### 可以提供的能力

在盐值未泄露的前提下，它可以提高随意伪造或修改公共参数的成本，例如：

- 修改 `tk` 后不能继续使用原 `vc`；
- 修改 `lang` 或版本号后需要重新生成 `vc`；
- 普通脚本不能只复制参数格式就构造有效摘要。

### 不能单独解决的问题

#### 1. 不能代替身份认证

`vc` 只校验公共参数组合，不能证明请求属于某个业务用户。用户身份仍需要通过业务 `accessToken` 校验。

#### 2. 不能天然防止重放

攻击者如果复制完整有效请求，包括原始 `ts` 和 `vc`，可能再次发送相同请求。

只有当上游额外检查时间窗口、一次性随机数或请求唯一性时，才能限制重放。仅把 `ts` 放入摘要并不等于已经防重放。

#### 3. MD5 不适合现代高安全签名

MD5 已存在已知碰撞问题，不适合密码存储、证书签名和高安全完整性保护。

更标准的新设计通常使用：

```text
HMAC-SHA256(secret, canonicalRequest)
```

但当前项目必须严格兼容既有上游协议，前端不能单方面将 MD5 修改为其他算法。

#### 4. 固定盐值的保护能力有限

如果固定盐值出现在浏览器打包产物中，任何用户都可能提取它并自行生成 `vc`。

当前项目把计算放在 Nitro 服务端，避免直接将计算逻辑和盐值发送到浏览器，这比纯前端计算更合适。但如果盐值本身已公开在接口文档中，它更接近固定协议常量，而不是严格意义上的秘密密钥。

#### 5. 无分隔符拼接存在理论歧义

当前协议直接拼接字段，没有字段名、长度或分隔符。理论上可能出现不同字段组合得到相同拼接字符串的情况。

更规范的新协议会先构造 canonical request，例如：

```text
tk=<value>&pkg=<value>&vn=<value>&lang=<value>&ts=<value>
```

不过这是协议设计建议，不能用于修改当前实现。

## 八、账户登录的常见前端处理

### 匿名登录

当前应用首次打开时建立匿名账户会话：

```text
浏览器实例 tk
    ↓
匿名登录接口
    ↓
匿名 accessToken + 匿名 userId
    ↓
保存为 AccountSession
```

匿名 `accessToken` 与浏览器实例 `tk` 不应混为同一个字段。

### Google 登录

Google 登录的一般流程是：

```text
Google Identity Services credential
    ↓
业务后端验证 Google 身份
    ↓
业务后端返回自己的 accessToken + userId
    ↓
前端原子替换匿名 AccountSession
    ↓
重新初始化依赖身份的埋点和业务状态
```

Google 提供的 credential 用于让业务后端验证第三方身份，不等于本站业务 `accessToken`。

### 为什么强调“原子替换”

`accessToken` 和 `userId` 属于同一个会话快照。如果分别更新，可能出现短暂的错误组合：

```text
新 userId + 旧 accessToken
旧 userId + 新 accessToken
```

因此当前项目将 `accessToken`、`userId` 和账户类型组成单个 `AccountSession`，登录成功后一次性保存。

## 九、Token 与浏览器存储的通用安全建议

当前实现将业务会话保存在 `localStorage`。这样实现简单，也便于页面刷新后恢复，但需要认识到：

- `localStorage` 中的数据可以被同源 JavaScript 读取；
- 如果页面发生 XSS，攻击代码可能读取业务 `accessToken`；
- Token 不得写入 URL、日志、埋点参数或错误上报；
- 页面渲染外部 HTML 时必须先进行白名单清洗；
- 第三方脚本应控制来源、权限和加载范围。

在同源 BFF 架构下，更高安全级别的常见方案是：

```text
业务会话或 refreshToken
    → HttpOnly + Secure + SameSite Cookie

浏览器 JavaScript
    → 只维护用户展示状态，不直接读取长期敏感凭证
```

采用 Cookie 登录态后还需要配套 CSRF 防护，不能只看到 HttpOnly 的优点而忽略 Cookie 自动携带带来的跨站请求风险。

设备标识 `tk` 不具备业务授权能力，因此可以使用可读 Cookie；业务 `accessToken` 与它的安全等级不同。

## 十、常见问题

### `tk` 是不是硬件设备唯一 ID？

不是。当前 `tk` 是随机生成并保存在浏览器存储中的实例标识。

### `tk` 登录后会不会改变？

小说接口公共参数 `tk` 正常不会因登录改变。埋点 SDK 中同名的 `tk` 使用业务 `accessToken`，可能随登录会话切换。

### 为什么不用 IP 地址作为设备标识？

IP 地址可能变化，也可能被多个用户共享，不能稳定代表设备。

### 为什么不用浏览器指纹？

浏览器指纹存在隐私、合规、误识别和浏览器限制问题。当前项目采用随机 UUID 持久化，不依赖指纹识别。

### `vc` 能不能解密？

不能。MD5 是摘要算法，不是可逆加密算法。

### 知道 `vc` 能不能算出盐值？

不能直接“解密”得到盐值，但固定盐值和弱算法也不应被视为高强度安全边界。

### 为什么有 `ts` 还可能被重放？

因为攻击者可以原样复制 `ts` 和对应的 `vc`。只有服务端拒绝过旧时间戳或重复请求时，`ts` 才能真正限制重放。

### 前端可以自己调整字段顺序或补分隔符吗？

不可以。任何拼接顺序、编码或字段变化都会导致上游计算结果不同，必须由前后端共同升级协议。

## 十一、需要继续向后端确认的问题

1. `ts` 使用毫秒还是秒，允许的时钟偏差是多少？
2. 上游是否拒绝过期请求，具体有效时间窗口是多少？
3. 上游是否检测同一请求的重复提交？
4. `vc` 比较是否区分大小写？
5. Java 文档中的 `getBytes()` 是否明确使用 UTF-8？
6. 盐值是否会按环境或版本轮换？
7. 签名失败、时间戳过期和参数缺失分别返回什么错误码？
8. 公共参数 `tk` 是否只用于设备归因，还是还参与匿名资产或风控判断？
9. 清除浏览器数据后生成新 `tk`，匿名资产是否允许恢复？
10. 同一正式账户绑定多个 `tk` 时，服务端如何管理和解绑设备？

## 十二、当前实现索引

- `app/shared/api/device-token.ts`
  - 生成、校验和持久化浏览器实例标识；
  - 定义 `localStorage` 键、Cookie 名和内部请求头。
- `app/composables/useApiFetch.ts`
  - 客户端将设备标识写入 `x-novel-device-token`；
  - SSR 请求继承当前请求上下文。
- `server/utils/novel-api.ts`
  - 从请求头/Cookie 恢复设备标识；
  - 设置设备 Cookie；
  - 生成 `vc`；
  - 统一组装上游公共参数和业务 `accessToken` 请求头。
- `app/modules/account/composables/useAuthSession.ts`
  - 管理匿名/Google 账户会话；
  - 原子保存 `accessToken + userId + accountType`。
- `app/plugins/tracker.client.ts`
  - 埋点 SDK 的 `tk` 使用当前业务 `accessToken`；
  - `businessuserid` 使用当前 `userId`。
- `docs/api-open-questions.md`
  - 记录当前已确认的接口决策和仍需后端确认的问题。

