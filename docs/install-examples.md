# 示例：在网页版 profile 中启用 dsh-session-sync

## 方式一：dsh plugin 命令（推荐）

```sh
# 从 GitHub 安装插件（需在 profile 目录运行 pnpm）
dsh plugin --profile web add github:hajimimaodie8/DSH-Session-Sync

# 将插件加入 profile bundles（编辑 %DSH_HOME%\profiles\web\package.json）
# "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-session-sync"] } }
```

## 方式二：pnpm 直接安装

```sh
cd %USERPROFILE%\.dsh\profiles\web
pnpm add github:hajimimaodie8/DSH-Session-Sync
# 然后手动把 "dsh-session-sync" 加入 package.json 的 dsh.profile.bundles
```

## 方式三：install.js 一键脚本

```sh
node install.js web     # 只装网页版
node install.js desk    # 只装桌面版
node install.js both    # 两边都装
```

## 验证

重启后输入 `/sync status`，应看到：
- 本端/对端路径正确
- 会话/工作区/插件统计
- 两边数据目录均可访问
