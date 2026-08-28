# Google GIS：ID Token 与 Access Token

## 概述

两种 `platformToken` 表面上都是 Google 返回的 Token，但用途完全不同：**ID Token 证明「你是谁」；Access Token 证明「你允许我访问哪些 Google 数据」**。Google Identity Services（GIS）把身份认证与 API 授权拆成两套接口；做「使用 Google 登录」时应传 `response.credential`（ID Token），不要把 Access Token 当登录凭证。

## 要点

- **ID Token / `credential`**：身份认证 → 适合 Google 登录；后端验签后用 `sub` 绑本地用户
- **Access Token**：API 授权 → 适合 Drive / Calendar / Gmail 等；按 scope 调 Google API
- 登录契约推荐：`platformToken = response.credential`，不要一个字段同时塞两种 Token
- 既要登录又要调 Google API：先 ID Token 登录，再按需 OAuth 增量授权
- Access Token 若需后端长期访问，优先 Authorization Code 模型拿 Refresh Token
- **采用方案 A 时**：正式开发前先备齐 Google Cloud / 前后端 Client ID / 验签与 `sub` 绑定 / 自有 JWT；通常不需要 Client Secret、Access Token、敏感 Scope

## 详细内容

### 1. 一句话对比

| | ID Token / `credential` | OAuth Access Token |
|--|-------------------------|-------------------|
| 核心目的 | 身份认证 | API 授权 |
| 回答的问题 | 用户是谁 | 应用能访问什么 |
| GIS 接口 | `google.accounts.id` | `google.accounts.oauth2` |
| 常见返回字段 | `response.credential` | `response.access_token` |
| 常见格式 | JWT（`xxxxx.yyyyy.zzzzz`） | 通常是不透明字符串（如 `ya29...`） |
| 接收方 | 你的应用后端 | Google API |
| 包含用户身份声明 | 是 | 不保证 |
| 包含 scope | 通常不以 API 授权为目的 | 是 |
| 是否适合登录本系统 | 是 | 不推荐作首选 |
| 能否调 Google API | 通常不能 | 可以（在 scope 内） |
| 后端处理 | 验证签名与 claims | 调 Google API 或校验授权状态 |
| 推荐场景 | 「使用 Google 登录」 | Drive、Calendar、Gmail 等 |

### 2. Google GIS ID Token：`credential`

#### 2.1 是什么

用户点击「使用 Google 登录」后，GIS 登录组件回调：

```js
function handleCredentialResponse(response) {
  console.log(response.credential); // Google ID Token（JWT）
}
```

解码后大致包含：

```json
{
  "iss": "https://accounts.google.com",
  "aud": "你的 Google Client ID",
  "sub": "Google 用户唯一 ID",
  "email": "user@gmail.com",
  "email_verified": true,
  "name": "张三",
  "picture": "https://...",
  "iat": 1780000000,
  "exp": 1780003600
}
```

官方定义：这是身份声明，告诉你的系统「当前用户已通过 Google 身份验证」。

#### 2.2 适合的登录流程

```text
用户点击 Google 登录
        ↓
Google 完成账号选择和身份验证
        ↓
前端拿到 response.credential
        ↓
前端把 ID Token 传给自己的后端
        ↓
后端验证 Google 签名、aud、iss、exp
        ↓
读取 sub / email
        ↓
创建或查找本地用户
        ↓
签发本系统的 session / JWT
```

前端示例：

```js
google.accounts.id.initialize({
  client_id: "xxx.apps.googleusercontent.com",
  callback: async ({ credential }) => {
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformToken: credential }),
    });
    const result = await response.json();
    localStorage.setItem("accessToken", result.accessToken); // 本系统 Token
  },
});
```

后端验证示例（Node.js）：

```js
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client();

async function verifyGoogleLogin(platformToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken: platformToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  return {
    googleUserId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
    avatar: payload.picture,
  };
}
```

**后端必须验证 Token**，不能只在前端 Base64 解码后相信内容；应校验签名以及 `aud`、`iss`、`exp` 等声明。

#### 2.3 ID Token 不能做什么

通常不能拿来调 Google Drive / Calendar / Gmail / Photos / YouTube 等 API。

错误示例：

```http
Authorization: Bearer <Google ID Token>
GET https://www.googleapis.com/drive/v3/files
```

原因：ID Token 的 `aud` 指向你的 Client ID（接收方是你的应用），不是给 Google API 用的授权凭证。

#### 2.4 最重要的用户标识是 `sub`

绑定时优先用 `payload.sub`，不要只靠 `payload.email`：

- `sub` 是 Google 账号稳定唯一标识
- 邮箱可能变更
- 某些场景邮箱不能当永久主键

建议表结构：

```text
users
├── id
├── email
├── nickname
└── avatar

user_identities
├── user_id
├── provider      = google
├── provider_uid  = payload.sub
└── email
```

### 3. Google OAuth Access Token

#### 3.1 是什么

OAuth 2.0 授权凭证。回答的不是「用户是谁」，而是「用户是否允许应用访问某些 Google API」。

```js
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: "xxx.apps.googleusercontent.com",
  scope: "https://www.googleapis.com/auth/calendar.readonly",
  callback: (response) => {
    console.log(response.access_token);
  },
});

tokenClient.requestAccessToken();
```

返回类似：

```json
{
  "access_token": "ya29.a0AfH6S...",
  "token_type": "Bearer",
  "expires_in": 3599,
  "scope": "https://www.googleapis.com/auth/calendar.readonly"
}
```

Access Token 通常是不透明字符串，**不要假设它一定是 JWT，也不要自行解码依赖**。

#### 3.2 适合的场景

读取/写入 Calendar、Drive、Gmail、YouTube 等。调用示例：

```js
await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

Google 会检查：是否有效、是否过期、是否撤销、是否含对应 scope。例如 `calendar.readonly` 只能读不能建；创建日程需更高 scope（如 `calendar.events`）。敏感/受限 scope 可能触发 Google OAuth 审核。

#### 3.3 不应用作登录核心凭证

技术上可用 Access Token 再调 UserInfo，但不推荐作为普通 Google 登录主路径：

- 比验 ID Token 多一层外部网络调用
- Access Token 代表授权，ID Token 代表身份
- scope、生命周期、权限可能不符预期
- 可能缺少你要的身份信息
- 把 OAuth 授权与应用登录错误耦合

GIS 设计明确：**认证返回 ID Token；访问 Google API 单独申请 Access Token**。

### 4. 推荐契约：Google 登录用 ID Token

后端接口语义应清晰：

```http
POST /auth/social-login
```

```json
{
  "platform": "google",
  "platformToken": "<Google ID Token / response.credential>"
}
```

后端流程：

```text
根据 platform 选择验证器
        ↓
Google ID Token verifier
        ↓
provider_uid = sub
        ↓
关联本地账号
        ↓
签发本平台 Token
```

统一社交登录契约：

```ts
interface SocialLoginRequest {
  platform: "google" | "apple" | "facebook";
  platformToken: string;
}
```

| 平台 | `platformToken` 含义 |
|------|----------------------|
| Google | `response.credential`（ID Token） |
| Apple | `identityToken` |

都是「身份凭证」，抽象一致。**不要让一个 `platformToken` 同时兼容 ID Token 和 Access Token**，否则后端无法从契约判断是「身份」还是「权限」。

### 5. 前端接入差异

#### 方案 A：Google 登录按钮（推荐用于登录）

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

```js
google.accounts.id.initialize({
  client_id: GOOGLE_CLIENT_ID,
  callback: ({ credential }) => {
    login({ platform: "google", platformToken: credential });
  },
});

google.accounts.id.renderButton(document.getElementById("google-login"), {
  theme: "outline",
  size: "large",
});
```

```text
登录一次 → ID Token → 业务后端 → 换成本平台登录态
```

#### 方案 B：OAuth 授权客户端（用于调 Google API）

```js
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: GOOGLE_CLIENT_ID,
  scope: "https://www.googleapis.com/auth/calendar.readonly",
  callback: ({ access_token }) => {
    authorizeGoogleApi(access_token);
  },
});

tokenClient.requestAccessToken();
```

```text
用户授权某些 Google 权限 → Access Token → 调用 Google API
```

更像「连接 Calendar / Drive」，不是单纯「使用 Google 登录」。

### 6. 既要登录又要调 Google API：认证与授权分离

不要二选一，分两阶段：

```text
第一阶段（登录）：
Sign in with Google → ID Token → 登录本系统
（只请求基本身份，不弹 Calendar/Drive 等额外权限）

第二阶段（按需授权）：
用户点击「连接 Google Calendar」
→ OAuth consent → Access Token 或 Authorization Code
→ 访问 Google Calendar
```

权限更小、用户更好理解，也符合增量授权。

### 7. 调 Google API 时的两种 Access Token 模式

#### 7.1 前端 Token Model

```js
google.accounts.oauth2.initTokenClient()
```

Google 直接向浏览器返回 Access Token。适合：前端临时调 API、页面打开期间使用、不要求服务器长期后台同步。通常**不会**给后端持久化 Refresh Token。

#### 7.2 Authorization Code Model（服务端更推荐）

```js
google.accounts.oauth2.initCodeClient()
```

前端得到一次性 `code`，交给后端换 Token：

```text
前端 authorization code
        ↓
你的后端 → Google Token Endpoint
        ↓
Access Token + 可能的 Refresh Token
```

适合：后端长期访问、后台自动同步、用户未开网页也要跑任务、需安全保存 Refresh Token。

即便用授权码模型，也不要把字段误标成 Access Token；应明确：

```json
{ "authorizationCode": "..." }
```

### 8. 采用方案 A：正式开发前的准备工作

选定流程：

```text
Google GIS 登录 → 前端拿到 ID Token（credential）
→ 传给后端 → 后端验证 → 签发你们自己的登录 Token
```

#### 8.1 Google Cloud 侧

**1）Google Cloud 项目**

在 Google Cloud Console 创建或选择项目（如 `YourApp`）。品牌配置、Client ID、使用范围都归属该项目。

**2）配置 Google Auth Platform**

需填写：应用名称、用户支持邮箱、开发者联系邮箱；Logo / 官网可选；正式上线通常应准备隐私政策；服务条款可选；用户范围选 Internal 或 External。

| 用户范围 | 适用 |
|----------|------|
| `Internal` | 仅公司 Google Workspace 内部员工 |
| `External` | 普通 Gmail 用户也能登录 |

单纯 Google 登录一般只用基础身份信息，**不必**申请 Gmail / Drive / Calendar 等敏感权限。

**3）创建 Web 类型 OAuth Client ID**

```text
Application type：Web application
```

得到形如：

```text
xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

即前后端共用的 `GOOGLE_CLIENT_ID`。Web 项目应使用 Web application 类型。

这套 ID Token 登录通常**不需要前端使用 Client Secret**；前端只能放 Client ID。

**4）配置 Authorized JavaScript origins**

把所有可能运行前端的来源加入白名单。Origin = `协议 + 域名 + 端口`，**不能带路径**。

| 环境 | 示例 |
|------|------|
| 本地 | `http://localhost:3000`、`http://localhost:5173`、`http://127.0.0.1:3000` |
| 测试 | `https://test.example.com` |
| 正式 | `https://www.example.com`、`https://example.com` |

```text
正确：https://www.example.com
错误：https://www.example.com/login
```

端口不同即不同 Origin，需分别配置（如 `3000` 与 `5173`）。

#### 8.2 前端需要准备

**1）环境变量（仅 Client ID）**

```env
VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

不要在前端写 `GOOGLE_CLIENT_SECRET`。

**2）加载 GIS 脚本**

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

不要再优先接旧版 `gapi.auth2` / `platform.js` / Google Sign-In platform library（已弃用，应使用 GIS）。

**3）登录交互：官方按钮**

```js
google.accounts.id.initialize({
  client_id: GOOGLE_CLIENT_ID,
  callback: handleGoogleCredential,
});

google.accounts.id.renderButton(
  document.getElementById("google-login-button"),
  { type: "standard", theme: "outline", size: "large", text: "signin_with" }
);

function handleGoogleCredential(response) {
  const idToken = response.credential; // 即 platformToken
}
```

**4）前后端接口契约**

专用接口：

```http
POST /api/auth/google
Content-Type: application/json

{ "platformToken": "Google返回的credential" }
```

或统一三方登录：

```http
POST /api/auth/social-login

{ "platform": "google", "platformToken": "Google返回的credential" }
```

后端返回本系统登录态：

```json
{
  "accessToken": "业务系统JWT",
  "refreshToken": "业务系统刷新Token",
  "user": {
    "id": "10001",
    "nickname": "Tom",
    "avatar": "https://..."
  }
}
```

区分：

```text
platformToken：Google ID Token，短期凭证
accessToken：业务系统签发的登录 Token
```

前端不应长期把 Google ID Token 当成本系统登录 Token。

#### 8.3 后端需要准备

**1）相同 Client ID**

```env
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

验证时检查 ID Token 的 `aud` 是否等于该值。

**2）官方验证库（不可只 Base64 解码）**

```bash
npm install google-auth-library
```

```ts
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error("Invalid Google ID token");
  }
  return payload;
}
```

禁止只做 `JSON.parse(atob(token.split('.')[1]))`——那只是解码，不验签，可被伪造。

服务端须校验：签名合法、`aud` 为本 Client ID、`iss` 来自 Google、`exp` 未过期。

**3）用户 / 身份绑定表**

用 `sub` 作稳定唯一标识，不要把邮箱当永久主键：

```sql
CREATE TABLE user_identity (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_provider_user (provider, provider_user_id)
);

CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255),
  nickname VARCHAR(100),
  avatar_url TEXT,
  created_at DATETIME NOT NULL
);
```

Google 绑定：`provider = google`，`provider_user_id = payload.sub`。

**4）首次登录与账号合并规则（提前定好）**

| 情况 | 建议处理 |
|------|----------|
| Google 用户第一次登录 | 查 `google + sub` → 不存在则创建本地用户、建绑定、签发业务 Token |
| Google 邮箱与现有账号相同 | **不要**仅因邮箱字符串相同就无条件合并 |

可选合并策略：

```text
方案 A：仅 email_verified=true 时才允许合并
方案 B：要求先登录原账号，再主动绑定 Google（更安全，推荐）
方案 C：始终创建独立账号，不按邮箱自动合并
```

**5）签发自己的 Session / JWT**

```ts
const appToken = jwtService.sign({ userId: user.id });
```

业务接口用：

```http
Authorization: Bearer <你们自己的 accessToken>
```

而不是 Google `credential`。

#### 8.4 产品与测试资料

**最低必备：**

```text
1. Google Cloud 项目
2. Google Auth Platform 品牌信息
3. Web application 类型 Client ID
4. 本地、测试、正式环境域名（Authorized JavaScript origins）
5. 前端 GOOGLE_CLIENT_ID
6. 后端 GOOGLE_CLIENT_ID
7. 后端 Google Token 验证逻辑
8. 本地用户和 Google sub 的绑定规则
9. 自有 Session/JWT 登录体系
```

**正式上线最好再准备：** 隐私政策、用户协议、账号删除、Google 解绑、登录失败与账号冲突提示、测试用 Google 账号。

#### 8.5 不需要提前准备的东西

单纯 `credential / ID Token` 登录通常不需要：

```text
Google API Key
Google Access Token / Refresh Token
Calendar / Drive / Gmail API
额外敏感 Scope
前端放置 Client Secret
```

需求只是验证身份并登录本系统，不是访问用户的 Google 数据。

#### 8.6 推荐落地步骤

```text
1. 创建 Google Cloud 项目
2. 配置 Google Auth Platform
3. 创建 Web Client ID
4. 配置 localhost、测试域名、正式域名
5. 前端加载 GIS SDK
6. 渲染 Google 登录按钮
7. 获取 response.credential
8. POST 给后端 platformToken
9. 后端验证 Google ID Token
10. 读取 sub、email、name、picture
11. 查找或创建本地用户
12. 签发你们自己的 accessToken
13. 前端进入已登录状态
```

前后端最终约定：

```text
platformToken 固定传 Google GIS 返回的 response.credential，
后端按 ID Token 校验，不接收 Google OAuth Access Token。
```

## 最终结论

- Google **登录**契约选：**A = GIS ID Token = `response.credential`**
- 后端验签后用 **`sub`** 作为 Google 用户唯一标识，再签发本系统 Token
- 只有业务明确要访问 Calendar / Drive / Gmail 等时，再单独申请 Access Token
- `platformToken` 不要同时兼容两种 Token
- 正式开发前按 **第 8 节** 备齐 Cloud / 前后端 / 绑定规则与自有登录态

## 参考 / 来源

- [Migrate to Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis)
- [OpenID Connect | Sign in with Google](https://developers.google.com/identity/openid-connect/openid-connect)
- [Verify the Google ID token on your server side](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes)
- [GIS Overview](https://developers.google.com/identity/gsi/web/guides/overview)
- [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Setup | Get Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Get your Google API client ID (OAuth web)](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- [Sign in with Google JavaScript API reference](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Sign in with Google HTML API reference](https://developers.google.com/identity/gsi/web/reference/html-reference)
