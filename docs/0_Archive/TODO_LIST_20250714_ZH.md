# 开发任务清单 (版本 2025-07-14)

本文档根据最新的代码评估报告，为项目后续开发提供一份按优先级排序的、可执行的任务清单。

---

### P0: 核心架构重构 (必须最优先完成)

**目标**: 解决当前代码中"配置来源不统一"的核心架构问题，将数据库确立为所有动态配置的"单一真实来源 (Single Source of Truth)"。

- [x] **[架构] 重构 `KeyManager` 的密钥加载逻辑**

  - **文件**: `src/lib/key-manager.ts`
  - **任务**:
    1.  移除 `getKeysFromEnv` 函数和所有从 `process.env.GEMINI_API_KEYS` 读取密钥的逻辑。
    2.  修改 `createKeyManager` 函数，使其**只从数据库 (`prisma.apiKey.findMany()`)** 加载密钥。
    3.  **可选但推荐**: 创建一个独立的一次性种子脚本 (`prisma/seed.ts`)，用于在首次部署时从环境变量向数据库注入初始密钥。

- [x] **[架构] 重构 `Middleware` 的认证逻辑**

  - **文件**: `src/middleware.ts`
  - **任务**:
    1.  移除所有对 `process.env.ALLOWED_TOKENS` 和 `process.env.AUTH_TOKEN` 的直接读取。
    2.  在中间件函数中，统一调用 `getSettings()` 服务来获取认证所需的令牌。
    3.  使用从 `getSettings()` 获取的值进行所有 UI 和 API 的认证检查。

- [x] **[架构] 移除硬编码的配置值**
  - **文件**: `src/lib/gemini-client.ts`
  - **任务**:
    1.  移除硬编码的 `MAX_RETRIES = 3`。
    2.  修改 `callGeminiApi` 函数，使其通过 `getSettings()` 服务获取 `MAX_RETRIES` 的值。
    3.  在后台管理的"系统配置"页面中，添加对 `MAX_RETRIES` 的管理 UI。

---

### P1: 核心功能对齐与部署准备

**目标**: 对齐开发方案中规划的核心功能，并为生产部署做好准备。

- [x] **[功能] 实现定时任务**

  - **文件**: `package.json`
  - **任务**:
    1.  添加定时任务相关依赖。
    2.  在应用启动时初始化定时任务。
    3.  设置一个定时任务 (例如，每小时)，调用 `KeyManager` 的一个新方法 `checkAndReactivateKeys()`，该方法用于对当前所有无效密钥进行健康检查，并在成功后将其恢复。

- [x] **[功能] 完善后台管理功能**

  - **文件**: `src/app/admin/actions.ts`, `src/app/admin/*`
  - **任务**:
    1.  审查并测试所有现有的 Server Actions，确保在 P0 重构后能正常工作。
    2.  确保后台 UI 可以正确地增、删、改 `ApiKey` 和 `Setting` 表中的数据。

---

### P2: 高级功能与体验优化

**目标**: 在核心功能稳定后，开发高级 API 功能并优化管理后台的用户体验。

- [x] **[功能] 兼容 OpenAI Embeddings API**

  - **文件**: `src/app/openai/v1/embeddings/route.ts` (新建)
  - **任务**:
    1.  创建新的 API 路由。
    2.  **实现模式**: 根据技术细节调研，此功能为**透明代理**。路由接收到请求后，应将其原封不动地转发给上游服务。
    3.  实现 `POST` 方法，接收并代理符合 OpenAI 规范的嵌入请求。

- [x] **[功能] 兼容 OpenAI 图像生成 API (已搭建框架)**

  - **文件**: `src/app/openai/v1/images/generations/route.ts` (新建)
  - **任务**:
    1.  创建新的 API 路由。
    2.  实现 `POST` 方法，接收 OpenAI 格式的图像生成请求。
    3.  调用 `gemini-client`，使用 Gemini 的图像生成模型 (如 Imagen)。
    4.  将 Gemini 的响应适配为 OpenAI 的图像生成响应格式。

- [x] **[体验] 引入 UI 组件库**
  - **文件**: `package.json`, `src/components/ui/*`
  - **任务**:
    1.  集成 `shadcn/ui`。
    2.  逐步使用 `shadcn/ui` 提供的标准组件（如 Button, Input, Table, Tabs）来重构和美化 `/admin` 管理后台页面，提升开发效率和视觉一致性。

---

### P3: Web UI 功能对齐与开发 (基于 shadcn/ui)

**目标**: 对标原项目的 Web UI 功能，利用已集成的 `shadcn/ui` 组件库，构建一个功能完整、体验良好的可视化管理后台。

- [x] **[UI] 重构密钥管理仪表盘 (`/admin/keys`)**

  - **任务**:
    1.  使用 `Table` 组件重构密钥列表，展示密钥（部分隐藏）、状态、失败次数。
    2.  为每行添加 `Button` 操作（重置、删除），并绑定 Server Actions。
    3.  实现批量操作功能（批量删除、批量重置）。
    4.  使用 `Dialog` 或 `Drawer` 组件实现"新增密钥"的弹窗表单。

- [x] **[UI] 创建系统配置页面 (`/admin/config`)**

  - **任务**:
    1.  新建一个页面或组件，用于管理 `Settings` 表中的所有配置项。
    2.  使用 `Input`, `Switch` 等组件为 `AUTH_TOKEN`, `MAX_FAILURES`, `PROXY_URL` 等提供编辑界面。
    3.  提供"保存"按钮，调用 Server Action 更新所有配置。

- [x] **[UI] 完善日志中心 (`/admin/logs`)**

  - **任务**:
    1.  使用 `Tabs` 组件区分"请求日志"和"错误日志"。
    2.  使用 `Table` 组件展示日志数据，并支持 `Pagination` 分页。
    3.  添加 `Input` 组件用于日志搜索。
    4.  提供"删除"和"清空"日志的按钮。

- [x] **[UI] 统一后台布局与导航**
  - **任务**:
    1.  创建统一的后台布局文件 (`/admin/layout.tsx`)。
    2.  实现清晰的页面间导航（如侧边栏或顶部导航栏）。
