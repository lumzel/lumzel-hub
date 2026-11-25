# LibTV MCP 接入修复（Antigravity / Claude Code / Codex）与画布防坑手册

## 目录
1. [为什么 Antigravity 直接装官方 LibTV 插件会出问题](#1-为什么-antigravity-直接装官方-libtv-插件会出问题)
2. [一键接入与修复步骤](#2-一键接入与修复步骤)
3. [LibTV MCP 运行时四大高频报错与标准解法](#3-libtv-mcp-运行时四大高频报错与标准解法)

---

## 1. 为什么 Antigravity 直接装官方 LibTV 插件会出问题

LibTV 官方仓库（`liblib-ai/marketplace`）默认面向 Codex 的原生 HTTP Remote MCP（直接连 `https://mcp.liblib.tv/mcp`）。直接搬到 **Antigravity** 或其它桌面端 stdio MCP 宿主时，通常会卡在四个地方：

1. **缺少 `mcp-remote` stdio 桥接与插件清单**：Antigravity 插件目录（`~/.gemini/config/plugins/libtv/`）需要完整的 `plugin.json` + `mcp_config.json`，通过 `npx -y mcp-remote https://mcp.liblib.tv/mcp` 完成 OAuth 登录与流式桥接。
2. **GUI 进程找不到 `npx` / `node`（`spawn npx ENOENT`）**：macOS / Windows 桌面客户端从图标启动时不继承终端 `.zshrc` 里的 Homebrew 或 nvm `PATH`，裸写 `"command": "npx"` 会直接启动失败，必须解析写入 `npx` 的绝对路径并显式注入 `PATH`。
3. **默认 60 秒超时掐断视频生成**：`MAGI-2` 生成 10~30 秒高清视频通常需要 2~10 分钟，默认 MCP 超时会在等待中途断开连接，需要把 `timeoutSeconds` 拉长到 `1200`（20 分钟）。
4. **代理网络下 Node 不走系统环境变量**：开启本地代理时，Node 22+ 运行 `mcp-remote` 默认忽略 `HTTPS_PROXY`，必须显式开启 `"NODE_USE_ENV_PROXY": "1"`。

---

## 2. 一键接入与修复步骤

仓库自带零依赖安装修复脚本 [`scripts/setup_libtv_antigravity.py`](../scripts/setup_libtv_antigravity.py)，自动探测本机 `npx` 路径、补齐 `PATH`、写入 `timeoutSeconds: 1200`，并按需配置代理。

### Antigravity 一键安装 / 修复
```bash
# 标准安装（自动检测终端里已有的 HTTPS_PROXY / HTTP_PROXY，没有则直连）
python3 scripts/setup_libtv_antigravity.py

# 如果你需要指定本地代理端口（例如 http://127.0.0.1:7890）
python3 scripts/setup_libtv_antigravity.py --proxy http://127.0.0.1:7890

# 强制直连（国内网络直连 LibTV 通常更快更稳，不想走终端代理时加 --no-proxy）
python3 scripts/setup_libtv_antigravity.py --no-proxy

# 仅预览即将生成的配置文件，不写入磁盘
python3 scripts/setup_libtv_antigravity.py --dry-run
```

跑完之后：
1. 在 Antigravity 里刷新或重启 MCP 服务（首次调用 `libtv` 工具时会自动弹出浏览器打开 `liblib.tv` 完成授权登录）。
2. 让 Agent 调一次 `doctor` 或 `list_projects`，看到返回你的画布列表即代表连通。

### Claude Code 与 Codex 接入命令
脚本同样支持一键打印 Claude Code 与 Codex 的配置命令：
```bash
python3 scripts/setup_libtv_antigravity.py --print-other-clients
```
或者手动执行：
- **Claude Code**：
  ```bash
  claude mcp add --transport http libtv https://mcp.liblib.tv/mcp
  ```
- **Codex**：
  ```bash
  codex mcp add libtv --url https://mcp.liblib.tv/mcp
  ```

---

## 3. LibTV MCP 运行时四大高频报错与标准解法

### 坑 1：`VIDEO_PREFLIGHT_FAILED: 当前模型未开放模式「首尾帧」(frames2video)`
- **触发原因**：给 `magi-2` 调 `generate_video` 时传了 `startFrameNode` / `endFrameNode` 或 `intent: "frames2video"`。
- **标准解法**：在 LibTV MCP 里，`magi-2` **无论单图生视频还是多图+视频混合控制，一律传 `intent: "reference"`**，把参考图放进 `referenceImageNodes`，参考视频放进 `referenceVideoNodes`，并在提示词里用 `{{Node <id>}}` 引用：
  - 单图当首帧用：提示词写 `以 {{Node img_1}} 为开场首帧与人物场景基准，立即破静展开动作……`
  - 单图当非首帧高光锚点用：提示词写 `{{Node img_1}} 仅锁定角色造型与镜头二蓄力高光构图，严禁作为第 0 帧静止开场……`

### 坑 2：`GENERATION_WAIT_TIMEOUT` 或返回状态 `wait_interrupted`
- **触发原因**：同步等待超过了单次工具调用窗口，但 **LibTV 云端任务实际上仍在继续渲染**。
- **标准解法（严防双倍扣费）**：
  1. **绝对不要重新调用 `generate_video`！** 重发会新建一个计费任务。
  2. 记录返回结果里的 `taskId` 或画布上的目标 `nodeId`。
  3. 间隔 15~25 秒调用 `task_status` 或 `read_node` / `read_project` 查询该节点，直到状态变为 `succeeded` / `completed` 并拿到成片下载链接。

### 坑 3：上传本地灰盒视频 `upload_media` 返回 `review_pending`
- **触发原因**：新上传的本地视频（比如 Code-to-Video 的动作灰盒）会进入约 10~20 秒的内容安全机审队列。
- **标准解法**：等待 15 秒后，用**完全相同的 `fileRef` 和 `idempotencyKey`** 再次调用 `upload_media`（或检查画布节点状态），不要重复申请新的 `upload_ticket` 反复上传同一个文件。

### 坑 4：鉴权过期或 `401 Unauthorized`
- **触发原因**：`mcp-remote` 缓存在本地 `~/.mcp-auth` 的 OAuth 令牌过期。
- **标准解法**：清理 `~/.mcp-auth` 下旧的授权缓存文件，重新触发一次 `doctor` 工具并在弹出的浏览器窗口点确认即可恢复。
