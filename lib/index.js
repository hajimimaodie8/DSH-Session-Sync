// dsh-session-sync — DeepSeek Harness 插件
// 网页版 ⇄ DSH Desktop 桌面版 会话/工作区/缓存/设置/插件 双向同步
//
// 命令：
//   /sync [方向] [--to <目录>]
//     方向: merge (默认) | web-to-desk | desk-to-web
//
// 自动识别：
//   - 当前实例 home：$DSH_HOME（网页版通常 C:\Users\Lenovo\.dsh，
//     桌面版通常 %APPDATA%\dsh-desktop\harness）
//   - 对端 home：自动推断（见 resolvePeerHome），可用 --to 覆盖
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { syncHomes, detectWebHome, detectDeskHome, scanStats, isPortOpen, isProcessRunning } from "./sync-core.js";

//#region plugin identity
const name = "session-sync";
const inject = ["commands"];
//#endregion

// ---------------------------------------------------------------------------
// 路径识别
// ---------------------------------------------------------------------------
function currentHome() {
  const env = process.env.DSH_HOME;
  if (env !== undefined && env.trim().length > 0) return resolve(env);
  return join(homedir(), ".dsh");
}

function resolvePeerHome(current, explicit) {
  if (explicit !== undefined && explicit.length > 0) return resolve(explicit);
  // 当前是桌面版 → 对端是网页版默认 home；反之亦然
  const desk = detectDeskHome();
  if (current === desk || current.toLowerCase() === desk.toLowerCase()) {
    return join(homedir(), ".dsh");
  }
  return desk;
}

// ---------------------------------------------------------------------------
// 状态摘要
// ---------------------------------------------------------------------------
function describeSide(home, label) {
  const stats = scanStats(home);
  const running = label === "网页版" ? "?" : isProcessRunning("DSH Desktop.exe");
  const lines = [
    `${label}: ${home}`,
    `  会话 ${stats.sessions} · 工作区 ${stats.workspaces} · 插件 ${stats.plugins}`,
  ];
  if (label === "网页版") lines.push(`  状态: ${stats.hasData ? "有数据" : "无数据"}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 命令执行
// ---------------------------------------------------------------------------
function executeSyncCommand(ctx, invocation) {
  const raw = invocation.rawInput.trim();
  const args = raw.split(/\s+/).filter((s) => s.length > 0);

  let direction = "merge";
  let toOverride;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--to") {
      toOverride = args[i + 1];
      i++;
    } else if (a === "web-to-desk" || a === "desk-to-web" || a === "merge" || a === "status" || a === "help") {
      direction = a;
    } else {
      return { kind: "error", text: `未知参数: ${a}\n${USAGE}` };
    }
  }

  if (direction === "help") {
    return { kind: "success", text: USAGE };
  }

  const current = currentHome();
  const peer = resolvePeerHome(current, toOverride);

  if (direction === "status") {
    return {
      kind: "success",
      text: [
        `当前实例 (DSH_HOME=${current})`,
        describeSide(current, current === peer ? "当前" : "本端"),
        "",
        describeSide(peer, "对端"),
      ].join("\n"),
    };
  }

  // 判断哪端是网页版（用于日志措辞）
  const desk = detectDeskHome();
  const webHome = current.toLowerCase() === desk.toLowerCase() ? join(homedir(), ".dsh") : current;
  const deskHome = desk;

  const scope = { sessions: true, workspace: true, cache: true, settings: true, plugins: true };
  const lines = [];
  lines.push(`同步方向: ${direction}`);
  lines.push(`网页版: ${webHome}`);
  lines.push(`桌面版: ${deskHome}`);
  lines.push("");

  if (direction === "merge") {
    lines.push("— 双向合并 —");
    lines.push(`>>> 网页版 → 桌面版`);
    lines.push(...syncHomes({ from: webHome, to: deskHome, scope, mode: "merge" }).map((l) => `  ${l}`));
    lines.push("");
    lines.push(`>>> 桌面版 → 网页版`);
    lines.push(...syncHomes({ from: deskHome, to: webHome, scope, mode: "merge" }).map((l) => `  ${l}`));
  } else if (direction === "web-to-desk") {
    lines.push("— 单向：网页版 → 桌面版 —");
    lines.push(...syncHomes({ from: webHome, to: deskHome, scope, mode: "oneway" }).map((l) => `  ${l}`));
  } else {
    lines.push("— 单向：桌面版 → 网页版 —");
    lines.push(...syncHomes({ from: deskHome, to: webHome, scope, mode: "oneway" }).map((l) => `  ${l}`));
  }

  lines.push("");
  lines.push("✅ 同步完成");
  return { kind: "success", text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// 插件 apply：注册命令
// ---------------------------------------------------------------------------
function apply(ctx) {
  ctx.commands.register({
    name: "sync",
    description: "同步网页版与 DSH Desktop 桌面版的会话/工作区/插件",
    input: { hint: "[merge|web-to-desk|desk-to-web|status|help] [--to <目录>]" },
    handler: (invocation) => executeSyncCommand(ctx, invocation),
  });
}

const USAGE = [
  "DSH Session Sync — 网页版 ⇄ 桌面版数据同步",
  "",
  "用法:",
  "  /sync             双向合并（默认，取两边并集，不丢数据）",
  "  /sync web-to-desk 单向覆盖：网页版 → 桌面版",
  "  /sync desk-to-web 单向覆盖：桌面版 → 网页版",
  "  /sync status      查看两端路径与数据统计",
  "  /sync --to <目录> 手动指定对端数据目录",
  "",
  "自动识别的目录:",
  `  网页版: ${join(homedir(), ".dsh")}`,
  `  桌面版: ${detectDeskHome()}`,
  "提示: 同步前建议退出 DSH Desktop。",
].join("\n");

export { apply, inject, name };
