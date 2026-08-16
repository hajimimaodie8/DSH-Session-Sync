#!/usr/bin/env node
// install.js — 将 dsh-session-sync 安装到网页版和/或桌面版 profile
// 用法: node install.js [web|desk|both]
//
// 说明：本插件已声明 dsh.bundle，属于"正式 bundle 插件"。
// 推荐方式：在 profile 目录用 pnpm 安装（dsh plugin add github:hajimimaodie8/DSH-Session-Sync），
// 并加入 dsh.profile.bundles 列表。本脚本提供免 pnpm 的手动安装路径。
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_DIR = __dirname;
const WEB_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DESK_HOME = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'dsh-desktop',
  'harness'
);

function installTo(home, label) {
  console.log(`\n=== 安装到 ${label}: ${home} ===`);
  const nm = path.join(home, 'profiles', 'web', 'node_modules', 'dsh-session-sync');
  const profilePkg = path.join(home, 'profiles', 'web', 'package.json');

  if (!fs.existsSync(path.join(home, 'profiles'))) {
    console.log(`  [跳过] ${home} 不存在 profiles 目录（可能未初始化）`);
    return false;
  }

  // 1) 复制插件包到 profile 的 node_modules（pnpm 布局）
  fs.rmSync(nm, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(nm), { recursive: true });
  fs.cpSync(PLUGIN_DIR, nm, {
    recursive: true,
    filter: (src) => !src.includes(path.sep + '.git' + path.sep),
  });
  console.log(`  [安装] 插件包 -> ${nm}`);

  // 2) 加入 profile 的 dsh.profile.bundles（若未包含）
  if (fs.existsSync(profilePkg)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(profilePkg, 'utf8'));
      const bundles = manifest.dsh?.profile?.bundles ?? [];
      if (!bundles.includes('dsh-session-sync')) {
        bundles.push('dsh-session-sync');
        manifest.dsh = manifest.dsh ?? {};
        manifest.dsh.profile = manifest.dsh.profile ?? {};
        manifest.dsh.profile.bundles = bundles;
        fs.writeFileSync(profilePkg, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        console.log(`  [安装] 已加入 bundles: ${profilePkg}`);
      } else {
        console.log('  [跳过] bundles 已包含 dsh-session-sync');
      }
    } catch (err) {
      console.log(`  [警告] 无法更新 ${profilePkg}: ${err.message}`);
    }
  }
  return true;
}

const target = process.argv[2] || 'both';
let ok = true;
if (target === 'web' || target === 'both') ok = installTo(WEB_HOME, '网页版') && ok;
if (target === 'desk' || target === 'both') ok = installTo(DESK_HOME, '桌面版') && ok;

console.log('\n安装完成。');
console.log('提示：若网页版已在运行，重启 dsh web 或等待 patch 热重载后输入 /sync 验证。');
process.exit(ok ? 0 : 1);
