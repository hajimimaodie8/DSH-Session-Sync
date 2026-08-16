# dsh-session-sync 变更日志

## [1.0.0] - 2026-08-16

### 新增
- `/sync` 命令：双向合并网页版与 DSH Desktop 桌面版的会话/工作区/缓存/设置/插件
- `/sync web-to-desk`：单向覆盖（网页版 → 桌面版）
- `/sync desk-to-web`：单向覆盖（桌面版 → 网页版）
- `/sync status`：查看两端数据目录与统计
- `/sync --to <目录>`：手动指定对端数据目录
- 自动识别 `$DSH_HOME` 与对端目录（网页版 `~/.dsh` / 桌面版 `%APPDATA%\dsh-desktop\harness`）
- 插件本体差异同步（按名称+版本，仅复制缺失或版本不同的包）
- 工作区同路径自动合并（避免 UI 重复条目）
- `dsh.bundle` 声明：作为正式 profile bundle 插件，可通过插件市场安装
