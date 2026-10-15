/* vite build 只處理被 HTML/CSS 引用的檔案；見證圖是 JS 字串路徑，要另外拷進 dist */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAB_PATHS } from '../src/js/tab-routes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** route.html 與 route/index.html 同時存在時，Pages 會對 /route 無限 308。 */
export async function removeConflictingRouteFiles(dir) {
  const removedFiles = [];
  for (const route of Object.values(TAB_PATHS)) {
    if (route === '/') continue;
    const name = route.slice(1);
    const flat = path.join(dir, `${name}.html`);
    const nested = path.join(dir, name, 'index.html');
    if (existsSync(flat)) {
      await rm(flat, { force: true });
      removedFiles.push(`${name}.html`);
    }
    if (existsSync(nested)) {
      await rm(path.join(dir, name), { recursive: true, force: true });
      removedFiles.push(`${name}/index.html`);
    }
  }
  return removedFiles;
}

async function main() {
  const targets = [
    { from: 'assets/stories', to: 'dist/assets/stories' },
    { from: 'assets/og-preview.jpg', to: 'dist/assets/og-preview.jpg' },
    { from: 'public/_redirects', to: 'dist/_redirects' }
  ];

  let copied = 0;
  for (const target of targets) {
    const src = path.join(root, target.from);
    const dest = path.join(root, target.to);
    if (!existsSync(src)) {
      console.warn(`  略過（來源不存在）：${target.from}`);
      continue;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
    const info = await stat(dest);
    copied += 1;
    console.log(`  已拷貝：${target.from} → ${target.to}${info.isDirectory() ? '/' : ''}`);
  }

  if (!copied) {
    console.error('沒有任何靜態檔被拷貝，請檢查 assets/ 路徑');
    process.exitCode = 1;
  }

  const removed = await removeConflictingRouteFiles(path.join(root, 'dist'));
  for (const file of removed) console.log(`  已移除會造成導向迴圈的檔案：${file}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
