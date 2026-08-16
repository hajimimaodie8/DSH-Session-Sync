// test/plugin.test.mjs — 基础单元测试（Node 内置 test runner）
// 运行: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = await import(join(__dirname, '..', 'lib', 'index.js'));

test('插件导出 name/inject/apply', () => {
  assert.equal(plugin.name, 'session-sync');
  assert.ok(plugin.inject.includes('commands'));
  assert.equal(typeof plugin.apply, 'function');
});

test('apply 注册 /sync 命令', () => {
  let registered = null;
  const ctx = {
    commands: {
      register: (def) => { registered = def; },
    },
  };
  plugin.apply(ctx);
  assert.ok(registered, '命令未注册');
  assert.equal(registered.name, 'sync');
  assert.equal(typeof registered.handler, 'function');
});

test('命令处理器支持 status/merge/单向方向', () => {
  let registered = null;
  plugin.apply({
    commands: { register: (def) => { registered = def; } },
  });
  const invoke = (rawInput) => registered.handler({
    rawInput,
    agent: 'main',
    signal: new AbortController().signal,
  });

  const help = invoke('help');
  assert.equal(help.kind, 'success');
  assert.match(help.text, /web-to-desk/);

  const bad = invoke('nonsense-arg');
  assert.equal(bad.kind, 'error');
  assert.match(bad.text, /未知参数/);
});
