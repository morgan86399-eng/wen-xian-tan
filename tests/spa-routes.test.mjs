import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tabFromPath, pathForTab, TAB_PATHS } from '../src/js/tab-routes.js';
import { removeConflictingRouteFiles } from '../scripts/copy-static.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(`      ${error.stack || error.message}`);
      process.exitCode = 1;
    });
}

console.log('\n[分頁網址不會自我導向]');

await check('路徑對應到正確分頁', async () => {
  assert.equal(tabFromPath('/'), 'hub');
  assert.equal(tabFromPath('/auth'), 'auth');
  assert.equal(tabFromPath('/auth/'), 'auth');
  assert.equal(tabFromPath('/member'), 'member');
  assert.equal(tabFromPath('/history/'), 'history');
  assert.equal(tabFromPath('/stories'), 'stories');
  assert.equal(tabFromPath('/login'), 'hub');
  assert.equal(pathForTab('auth'), '/auth');
});

await check('_redirects 不會把分頁網址 308 回自己', async () => {
  const text = readFileSync(path.join(root, 'public/_redirects'), 'utf8');
  for (const route of Object.values(TAB_PATHS)) {
    if (route === '/') continue;
    assert.doesNotMatch(text, new RegExp(`^${route}\\s+${route}\\s+308`, 'm'));
    assert.doesNotMatch(text, new RegExp(`^${route}/\\s+${route}/\\s+308`, 'm'));
  }
});

await check('同時存在的 route.html 與 route/index.html 會被刪掉', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zenasker-routes-'));
  await writeFile(path.join(dir, 'auth.html'), '<p>flat</p>');
  await mkdir(path.join(dir, 'auth'), { recursive: true });
  await writeFile(path.join(dir, 'auth/index.html'), '<p>nested</p>');
  await writeFile(path.join(dir, 'index.html'), '<p>home</p>');
  const removed = await removeConflictingRouteFiles(dir);
  assert.deepEqual(removed.sort(), ['auth.html', 'auth/index.html']);
  await assert.rejects(access(path.join(dir, 'auth.html')));
  await assert.rejects(access(path.join(dir, 'auth/index.html')));
  await access(path.join(dir, 'index.html'));
});

if (!process.exitCode) console.log(`\n${passed} passed`);
else process.exit(process.exitCode);
