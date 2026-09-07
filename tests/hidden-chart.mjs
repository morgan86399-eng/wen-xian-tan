import assert from 'node:assert/strict';
import { buildHiddenRhythm } from '../functions/lib/chart/hidden-rhythm.mjs';
import { scanChartTerms } from '../functions/lib/chart/terms.mjs';
import { isValidBirthDate, shichenToClock, shichenLabel } from '../functions/lib/chart/birth-ref.mjs';
import { renderBirthTimeHtml, renderBirthPlaceHtml } from '../src/js/birth-ui.js';
import { numberedTitle, TOTAL_WIZARD_STEPS } from '../src/js/data.js';

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok  ${name}`))
    .catch((error) => {
      console.error(`  fail  ${name}`);
      throw error;
    });
}

console.log('\n[隱藏節奏檔]');

await check('有效出生日可產出白話節奏檔，且沒有命理專有名詞', () => {
  const out = buildHiddenRhythm({
    themeId: 'love',
    answers: {
      gender: 'female',
      birthDate: '1990-08-08',
      birthTime: 'si',
      birthPlace: '台北市'
    }
  });
  assert.equal(out.ok, true);
  assert.ok(out.text.length > 8);
  assert.deepEqual(scanChartTerms(out.text), []);
});

await check('自訂性別與不清楚時段仍產出弱版節奏檔', () => {
  const out = buildHiddenRhythm({
    themeId: 'career',
    answers: {
      gender: 'custom_gender',
      genderCustom: '不標示',
      birthDate: '1990-08-08',
      birthTime: 'unknown',
      birthPlace: '紐約'
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.weak, true);
  assert.deepEqual(scanChartTerms(out.text), []);
});

await check('缺出生日就空檔，不炸掉', () => {
  const out = buildHiddenRhythm({ themeId: 'love', answers: { gender: 'male' } });
  assert.equal(out.ok, false);
  assert.equal(out.text, '');
});

await check('時段對照與日期校驗', () => {
  assert.equal(shichenToClock('si'), '10:00');
  assert.equal(shichenLabel('si'), '09:00-11:00');
  assert.equal(shichenLabel('unknown'), '不清楚');
  assert.equal(isValidBirthDate('1990-08-08'), true);
  assert.equal(isValidBirthDate('1990-02-31'), false);
});

await check('十二格圓盤與台灣地圖 HTML 有綁 data 屬性、沒有 window.onPick', () => {
  const clock = renderBirthTimeHtml({ birthTime: 'si' });
  assert.match(clock, /data-birth-time="si"/);
  assert.match(clock, /data-birth-time="unknown"/);
  assert.equal((clock.match(/shichen-bubble/g) || []).length >= 12, true);
  assert.ok(!clock.includes('八字'));

  const map = renderBirthPlaceHtml({ birthPlace: '台北市', birthPlaceRegion: 'tw' });
  assert.match(map, /data-birth-place="台北市"/);
  assert.ok(!map.includes('onPickBirthPlace'));
  assert.match(map, /taiwan-svg-outline/);
});

await check('問答步數與標題編號', () => {
  assert.equal(TOTAL_WIZARD_STEPS, 10);
  assert.equal(numberedTitle(6, '3. 您與本次請示對象的關係稱謂是？'), '6. 您與本次請示對象的關係稱謂是？');
});
