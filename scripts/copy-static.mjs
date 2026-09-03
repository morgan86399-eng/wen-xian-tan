/* vite build 只處理被 HTML/CSS 引用的檔案；見證圖是 JS 字串路徑，要另外拷進 dist */
import { cp, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { from: 'assets/stories', to: 'dist/assets/stories' },
  { from: 'assets/og-preview.jpg', to: 'dist/assets/og-preview.jpg' }
];

let copied = 0;

for (const target of TARGETS) {
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
