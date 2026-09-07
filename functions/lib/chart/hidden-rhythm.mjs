import { astro } from 'iztro';
import { Solar } from 'lunar-typescript';
import { applyTrueSolarTime, hourToIztroIndex, splitDate } from './hour.mjs';
import { lookupCity, shichenToClock } from './birth-ref.mjs';
import { toHant } from './zh-hant.mjs';
import { stripChartTerms } from './terms.mjs';

const STAR_VOICE = {
  '紫微': '你作決定時很看重主導權，不喜歡被別人安排節奏。',
  '天機': '你腦子轉得快，事情還沒發生就已經在推下一步。',
  '太陽': '你對人熱、也容易一次給太多，界線要自己先畫好。',
  '武曲': '你看數字、看結果，含糊的承諾很難讓你放心。',
  '天同': '你想把氣氛顧好，衝突一來會先退一步再找出口。',
  '廉貞': '你感受力強，關係裡一有不平就會記很久。',
  '天府': '你想先把底子墊穩，再談向外擴。',
  '太陰': '你習慣先觀察、後開口，心裡有譜但不急著講完。',
  '貪狼': '你對新鮮機會很敏銳，也容易一次想抓太多。',
  '巨門': '你說話直接，真相處時需要把話講完整才不容易誤會。',
  '天相': '你很會協調，但自己的底線也要講出來，不然會被拖著走。',
  '天梁': '你常變成別人來求助的那個人，自己的事反而排後面。',
  '七殺': '你習慣自己扛，合作前要把權責講清楚。',
  '破軍': '你受不了原地打轉，局面卡住時會想直接換路。'
};

const GAN_VOICE = {
  '甲': '你想先把方向想清楚，不喜歡被硬推著立刻拍板。',
  '乙': '你做事有彈性，也容易因為顧左右而拖延主軸。',
  '丙': '你一熱起來就衝，冷卻以後才看到代價。',
  '丁': '你在意別人怎麼看這件事，開口前會先估氣氛。',
  '戊': '你吃得住、想把底子先墊穩再往外擴。',
  '己': '你擅長把零碎的事收成一套，但也可能收太慢。',
  '庚': '你看事情比較直，界線清楚，不喜歡含糊。',
  '辛': '你注重體面與分寸，公開場合更在意有沒有被尊重。',
  '壬': '你反應快、想法多，適合先排先後再動手。',
  '癸': '你感受細，決定時常先問自己舒不舒服，再問划不划算。'
};

const THEME_PALACE = {
  love: ['夫妻'],
  work: ['官'],
  career: ['官'],
  wealth: ['財', '财'],
  family: ['田宅'],
  children: ['子女']
};

function findPalace(plate, keyword) {
  return (plate.palaces || []).find((item) => String(item.name || '').includes(keyword)) || null;
}

function majorNames(palace) {
  return ((palace && palace.majorStars) || []).map((star) => toHant(star.name)).filter(Boolean);
}

function voiceForStars(names) {
  const lines = [];
  for (const name of names) {
    if (STAR_VOICE[name]) lines.push(STAR_VOICE[name]);
  }
  return lines;
}

function mapGender(answers) {
  const id = String(answers?.gender || '');
  if (id === 'male') return '男';
  if (id === 'female') return '女';
  return '';
}

function eastAsiaLng(lng) {
  const n = Number(lng);
  return Number.isFinite(n) && n >= 73 && n <= 135;
}

function safePlate(calendarDate, timeIndex, gender) {
  try {
    const astrolabe = astro.bySolar(calendarDate, timeIndex, gender);
    return astrolabe.toJSON();
  } catch {
    return null;
  }
}

function safeBazi(calendarDate, clockTime) {
  try {
    const date = splitDate(calendarDate);
    const [hour, minute] = String(clockTime).split(':').map(Number);
    if (!date || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    const solar = Solar.fromYmdHms(date.year, date.month, date.day, hour, minute, 0);
    const eight = solar.getLunar().getEightChar();
    return {
      day: eight.getDay(),
      gan: String(eight.getDay() || '')[0] || ''
    };
  } catch {
    return null;
  }
}

export function buildHiddenRhythm({ answers, themeId } = {}) {
  const data = (answers && typeof answers === 'object') ? answers : {};
  const calendarDate = String(data.birthDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    return { ok: false, text: '', weak: true };
  }

  const timeValue = String(data.birthTime || '').trim();
  const unknownTime = !timeValue || timeValue === 'unknown';
  const clock = shichenToClock(timeValue || 'unknown');
  const city = lookupCity(data.birthPlace);
  const gender = mapGender(data);
  const weak = unknownTime || !gender;
  const useSolar = eastAsiaLng(city.lng);
  const solarAdjust = applyTrueSolarTime(clock, city.lng, useSolar);
  const usedClock = solarAdjust.ok ? solarAdjust.clockTime : clock;
  const timeIndex = hourToIztroIndex(usedClock);
  const lines = [];

  if (unknownTime) {
    lines.push('出生時段他沒記清楚，節奏只當弱參考，判斷仍要扣住他現在問的那件事。');
  }

  const bazi = safeBazi(calendarDate, usedClock);
  if (bazi?.gan && GAN_VOICE[bazi.gan]) {
    lines.push(GAN_VOICE[bazi.gan]);
  }

  if (gender && timeIndex != null) {
    const plate = safePlate(calendarDate, timeIndex, gender);
    if (plate) {
      const ming = findPalace(plate, '命');
      const mingStars = majorNames(ming);
      lines.push(...voiceForStars(mingStars).slice(0, 2));

      const keys = THEME_PALACE[themeId] || THEME_PALACE.love;
      let themePalace = null;
      for (const key of keys) {
        themePalace = findPalace(plate, key);
        if (themePalace) break;
      }
      const themeStars = majorNames(themePalace);
      const themeLines = voiceForStars(themeStars).filter((line) => !lines.includes(line)).slice(0, 2);
      lines.push(...themeLines);
    }
  } else {
    lines.push('性別或時段不夠清楚，這份只抓年月日的做事節奏，不要寫死結構判斷。');
  }

  const unique = [...new Set(lines.map((line) => stripChartTerms(line)).filter(Boolean))];
  const text = stripChartTerms(unique.slice(0, 8).join('\n'));
  return { ok: Boolean(text), text, weak };
}
