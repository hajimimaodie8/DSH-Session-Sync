# DSH-Session-Sync

Synchronize sessions, presets and settings between DSH desktop‑shell embedded instance and external web browser instance. Fix session isolation issue for third‑party packaged DeepSeek‑Harness desktop builds.

一个 **DeepSeek Harness 插件**：在网页版或 DSH Desktop 桌面版内，一条命令即可同步两端的
**会话（对话内容）、工作区、缓存、设置与插件**。解决打包版桌面实例与网页实例之间的数据隔离问题。

- 网页版：安装后在对话中输入 `/sync`
- DSH Desktop 桌面版：同样安装后输入 `/sync`

## 功能

| 命令 | 作用 |
| --- | --- |
| `/sync` | 双向合并（默认）：两边内容取并集，不丢失任何一方 |
| `/sync web-to-desk` | 单向覆盖：网页版 → 桌面版 |
| `/sync desk-to-web` | 单向覆盖：桌面版 → 网页版 |
| `/sync status` | 查看两端路径与数据统计 |
| `/sync --to <目录>` | 手动指定对端数据目录 |

同步内容：会话记录、工作区列表（同路径自动合并）、会话投影缓存、设置/凭据、
插件启用配置 + 插件本体差异同步。

## 安装（网页版）

```powershell
# 1. 把插件包复制到网页版 profile 的 node_modules
xcopy /E /I /Y "dsh-session-sync" "%USERPROFILE%\.dsh\profiles\node_modules\dsh-session-sync"

# 2. 在 %USERPROFILE%\.dsh\profiles\web\cordis.patch.yml 中追加（空列表 [] 需替换）：
# - insert:
#     - id: session-sync
#       name: 'dsh-session-sync'

# 3. 重启 dsh web（或等待 patch 热重载），输入 /sync status 验证
```

## 安装（DSH Desktop 桌面版）

把插件包复制到桌面版对应位置，patch 追加到：
`%APPDATA%\dsh-desktop\harness\profiles\web\cordis.patch.yml`

```powershell
xcopy /E /I /Y "dsh-session-sync" "%APPDATA%\dsh-desktop\harness\profiles\node_modules\dsh-session-sync"
```

## 原理

- 通过 `$DSH_HOME` 定位当前实例数据目录（网页版通常 `~/.dsh`，桌面版通常
  `%APPDATA%\dsh-desktop\harness`）
- 对端目录自动推断（本端为桌面版则对端为网页版，反之亦然），支持 `--to` 覆盖
- 复用 Cordis 命令注册（`ctx.commands.register`），无外部依赖，纯 Node 内置模块

## 开发

```text
dsh-session-sync/
├── package.json
├── README.md
├── LICENSE
└── lib/
    ├── index.js       插件入口：注册 /sync 命令
    └── sync-core.js   同步核心（会话/工作区/缓存/设置/插件）
```

插件为 ESM 模块，导出 `name` / `inject` / `apply`，通过 profile patch 的
`insert` 条目加载（与官方插件一致）。

## 许可

MIT
