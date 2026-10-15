/* 建置前套用 upload-fix.patch。
   正式站的登入迴圈修正在這份補丁裡：同頁切換分頁、去掉會自我 308 的規則衝突，
   以及頁尾金流文案。補丁已與本地修正逐位元組核對。已套用過就略過。 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function splitLines(text) {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function applyUnifiedDiff(original, diffText) {
  const source = splitLines(original);
  const diffLines = splitLines(diffText);
  const out = [];
  let cursor = 0;
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (!line.startsWith('@@')) {
      i += 1;
      continue;
    }
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) throw new Error(`無法解析補丁區段：${line}`);
    const oldStart = Number(match[1]);
    // unified diff 的行號從 1 起算；開頭為 0 表示空檔
    const startIndex = Math.max(oldStart - 1, 0);
    if (startIndex < cursor) throw new Error('補丁區段重疊');
    out.push(...source.slice(cursor, startIndex));
    cursor = startIndex;
    i += 1;
    while (i < diffLines.length && !diffLines[i].startsWith('@@') && !diffLines[i].startsWith('diff --git')) {
      const hunkLine = diffLines[i];
      if (hunkLine.startsWith('\\')) {
        i += 1;
        continue;
      }
      const prefix = hunkLine[0];
      const text = hunkLine.slice(1);
      if (prefix === ' ') {
        if (source[cursor] !== text) {
          throw new Error(`補丁上下文不符，預期「${text}」實際「${source[cursor] ?? '（檔案結束）'}」`);
        }
        out.push(source[cursor]);
        cursor += 1;
      } else if (prefix === '-') {
        if (source[cursor] !== text) {
          throw new Error(`補丁刪除行不符，預期「${text}」實際「${source[cursor] ?? '（檔案結束）'}」`);
        }
        cursor += 1;
      } else if (prefix === '+') {
        out.push(text);
      }
      i += 1;
    }
  }
  out.push(...source.slice(cursor));
  const trailing = original.endsWith('\n') || original.length === 0 ? '\n' : '';
  return `${out.join('\n')}${trailing}`;
}

function fileDiffs(diffText) {
  const parts = diffText.split(/^diff --git /m).filter(Boolean);
  return parts.map((part) => {
    const header = part.split('\n', 1)[0];
    const target = header.split(' b/').pop();
    const bodyStart = part.indexOf('\n@@');
    if (bodyStart < 0) throw new Error(`補丁缺少區段：${target}`);
    return { target, body: part.slice(bodyStart + 1) };
  });
}

export async function applyUploadPatch(repoRoot = root) {
  const diffText = await readFile(path.join(repoRoot, 'upload-fix.patch'), 'utf8');
  const applied = [];
  for (const file of fileDiffs(diffText)) {
    const full = path.join(repoRoot, file.target);
    const original = await readFile(full, 'utf8');
    let next;
    try {
      next = applyUnifiedDiff(original, file.body);
    } catch (error) {
      const marker = file.target.endsWith('app.js')
        ? "from './tab-routes.js'"
        : file.target.endsWith('index.html')
          ? '天公疼憨人誠心改變'
          : null;
      if (marker && original.includes(marker)) {
        applied.push(`${file.target}（已套用）`);
        continue;
      }
      if (file.target.endsWith('style.css') && original.includes('.app-tab-btn') && original.split('text-decoration: none').length >= 9) {
        applied.push(`${file.target}（已套用）`);
        continue;
      }
      throw error;
    }
    if (next !== original) {
      await writeFile(full, next);
      applied.push(file.target);
    }
  }
  return applied;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const applied = await applyUploadPatch();
  for (const file of applied) console.log(`  已套用：${file}`);
}
