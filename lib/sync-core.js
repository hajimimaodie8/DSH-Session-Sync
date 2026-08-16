// dsh-session-sync 内部同步核心（自包含，无外部依赖）
// 逻辑与独立应用版一致：会话/工作区/缓存/设置/插件配置 合并与复制
'use strict';

import { existsSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// 路径
// ---------------------------------------------------------------------------
export function detectWebHome() {
  return join(homedir(), ".dsh");
}

export function detectDeskHome() {
  const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return join(appData, "dsh-desktop", "harness");
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`解析 JSON 失败: ${file}\n${err.message}`);
  }
}

function writeJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function normPath(p) {
  return String(p ?? "").replace(/\\+$/, "").toLowerCase();
}

function readVersion(pkgFile) {
  try {
    return JSON.parse(readFileSync(pkgFile, "utf8")).version || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------
export function scanStats(home) {
  const sessionRoot = join(home, "sessions");
  let sessions = 0;
  try {
    for (const ws of readdirSync(sessionRoot, { withFileTypes: true })) {
      if (!ws.isDirectory()) continue;
      for (const s of readdirSync(join(sessionRoot, ws.name), { withFileTypes: true })) {
        if (s.isDirectory()) sessions++;
      }
    }
  } catch { /* ignore */ }

  const wsJson = readJson(join(home, "storages", "workspace.json"));
  const workspaces = wsJson?.tables?.workspaces ? Object.keys(wsJson.tables.workspaces).length : 0;
  const plugins = listDirs(join(home, "profiles", "node_modules", "@deepseek-ai")).length;
  return { home, sessions, workspaces, plugins, hasData: existsSync(home) };
}

// ---------------------------------------------------------------------------
// 同步核心
// ---------------------------------------------------------------------------
const PROFILE_CONFIG_FILES = ["package.json", "cordis.yml", "cordis.patch.yml", "pnpm-workspace.yaml"];

export function syncHomes(opts) {
  const logs = [];
  const { from, to, scope, mode = "merge", includePluginBundles = true } = opts;

  const isFromNewer = (s, d) => {
    try {
      return statSync(s).mtimeMs > statSync(d).mtimeMs;
    } catch {
      return true;
    }
  };

  const copyIfNeeded = (src, dst, label) => {
    if (!existsSync(src)) return;
    const force = mode === "oneway";
    if (existsSync(dst) && !force && !isFromNewer(src, dst)) {
      logs.push(`  [跳过] ${label} (目标已是最新)`);
      return;
    }
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    logs.push(`  [同步] ${label}`);
  };

  // 1) 会话
  if (scope.sessions) {
    logs.push("— 会话 —");
    const fromSess = join(from, "sessions");
    if (existsSync(fromSess)) {
      let n = 0;
      for (const ws of readdirSync(fromSess, { withFileTypes: true })) {
        if (!ws.isDirectory()) continue;
        const fWs = join(fromSess, ws.name);
        for (const s of readdirSync(fWs, { withFileTypes: true })) {
          if (!s.isDirectory()) continue;
          const fSess = join(fWs, s.name);
          const tSess = join(to, "sessions", ws.name, s.name);
          const fZstd = join(fSess, "session.jsonl.zstd");
          const tZstd = join(tSess, "session.jsonl.zstd");
          if (existsSync(tZstd) && mode !== "oneway" && !isFromNewer(fZstd, tZstd)) continue;
          mkdirSync(tSess, { recursive: true });
          let copied = false;
          for (const f of readdirSync(fSess, { withFileTypes: true })) {
            if (f.isDirectory()) continue;
            const sf = join(fSess, f.name);
            const df = join(tSess, f.name);
            if (existsSync(df) && mode !== "oneway" && !isFromNewer(sf, df)) continue;
            copyFileSync(sf, df);
            copied = true;
          }
          if (copied) {
            n++;
            logs.push(`  [会话] ${ws.name}/${s.name}`);
          }
        }
      }
      logs.push(`  会话同步完成 (${n} 个更新)`);
    }
  }

  // 2) workspace.json
  if (scope.workspace) {
    logs.push("— 工作区 —");
    const fWs = join(from, "storages", "workspace.json");
    const tWs = join(to, "storages", "workspace.json");
    if (existsSync(fWs)) {
      if (mode === "oneway") {
        copyIfNeeded(fWs, tWs, "workspace.json");
      } else {
        const fromJson = readJson(fWs);
        const toJson = readJson(tWs);
        if (fromJson && toJson) {
          const merged = mergeWorkspace(fromJson, toJson);
          writeJson(tWs, merged);
          logs.push(`  [合并] workspace.json -> ${merged.global.workspaceIds.length} 个工作区`);
        } else {
          copyIfNeeded(fWs, tWs, "workspace.json");
        }
      }
    }
  }

  // 3) 投影缓存
  if (scope.cache) {
    logs.push("— 投影缓存 —");
    const fC = join(from, "storages", "session_projcache.json");
    const tC = join(to, "storages", "session_projcache.json");
    if (existsSync(fC)) {
      if (mode === "oneway") {
        copyIfNeeded(fC, tC, "session_projcache.json");
      } else {
        const fromJson = readJson(fC);
        const toJson = readJson(tC);
        if (fromJson && toJson) {
          const merged = {
            ...toJson,
            tables: { sessions: { ...(toJson.tables?.sessions ?? {}), ...(fromJson.tables?.sessions ?? {}) } },
          };
          writeJson(tC, merged);
          logs.push(`  [合并] session_projcache.json -> ${Object.keys(merged.tables.sessions).length} 条`);
        } else {
          copyIfNeeded(fC, tC, "session_projcache.json");
        }
      }
    }
  }

  // 4) 设置与凭据
  if (scope.settings) {
    logs.push("— 设置/凭据 —");
    for (const name of ["settings.yaml", ".credentials.yaml"]) {
      copyIfNeeded(join(from, name), join(to, name), name);
    }
  }

  // 5) 插件配置 + 本体
  if (scope.plugins) {
    logs.push("— 插件 —");
    const fProf = join(from, "profiles", "web");
    if (existsSync(fProf)) {
      for (const name of PROFILE_CONFIG_FILES) {
        copyIfNeeded(join(fProf, name), join(to, "profiles", "web", name), `profiles/web/${name}`);
      }
    }
    if (includePluginBundles) {
      const n = syncPluginBundles(from, to, mode, logs);
      logs.push(`  插件本体差异同步完成 (${n} 个包)`);
    }
  }

  return logs;
}

function mergeWorkspace(fromJson, toJson) {
  const mergedWorkspaces = {};
  const pathIndex = new Map();
  const archived = new Set([
    ...(toJson.global?.archivedSessionIds ?? []),
    ...(fromJson.global?.archivedSessionIds ?? []),
  ]);

  const all = [...Object.entries(toJson.tables?.workspaces ?? {}), ...Object.entries(fromJson.tables?.workspaces ?? {})];
  for (const [id, ws] of all) {
    const key = normPath(ws.path);
    const sessionIds = [...(ws.sessionIds ?? [])];
    if (pathIndex.has(key)) {
      const mainId = pathIndex.get(key);
      const main = mergedWorkspaces[mainId];
      const combined = new Set([...(main.sessionIds ?? []), ...sessionIds]);
      main.sessionIds = [...combined];
      if (!main.createdAt && ws.createdAt) main.createdAt = ws.createdAt;
      if ((main.updatedAt || "") < (ws.updatedAt || "")) main.updatedAt = ws.updatedAt;
    } else {
      mergedWorkspaces[id] = { ...ws, sessionIds };
      pathIndex.set(key, id);
    }
  }

  return {
    unit: { name: "workspace", version: toJson.unit?.version ?? 2 },
    global: {
      initialized: toJson.global?.initialized ?? true,
      workspaceIds: Object.keys(mergedWorkspaces),
      archivedSessionIds: [...archived],
    },
    tables: { workspaces: mergedWorkspaces },
  };
}

function syncPluginBundles(from, to, mode, logs) {
  const fDir = join(from, "profiles", "node_modules", "@deepseek-ai");
  const tDir = join(to, "profiles", "node_modules", "@deepseek-ai");
  if (!existsSync(fDir)) return 0;

  let n = 0;
  for (const pkg of listDirs(fDir)) {
    const fPkg = join(fDir, pkg);
    const tPkg = join(tDir, pkg);
    const fVer = readVersion(join(fPkg, "package.json"));
    const tVer = readVersion(join(tPkg, "package.json"));

    if (
      !existsSync(tPkg) ||
      (mode === "oneway" && fVer !== tVer) ||
      (mode === "merge" && fVer && tVer && fVer !== tVer && isFromNewer(join(fPkg, "package.json"), join(tPkg, "package.json")))
    ) {
      rmSync(tPkg, { recursive: true, force: true });
      mkdirSync(dirname(tPkg), { recursive: true });
      cpSync(fPkg, tPkg, { recursive: true, dereference: true });
      logs.push(`  [插件] @deepseek-ai/${pkg} ${fVer ?? ""}${tVer && tVer !== fVer ? ` (目标 ${tVer})` : ""}`);
      n++;
    }
  }
  return n;
}

// 端口/进程探测（供 status 使用）
export function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host, timeout: 1200 });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
  });
}

export function isProcessRunning(name) {
  try {
    const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${name}`, "/NH"], { encoding: "utf8", timeout: 5000 });
    return out.includes(name);
  } catch {
    return false;
  }
}
