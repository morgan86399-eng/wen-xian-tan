import { SHICHEN_OPTIONS, isValidBirthDate } from './birth-data.js';
import { renderOverseasBirthMaps } from './birth-maps.js';

const BRANCH_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const TW_ISLAND_PATH = 'M 344.4 81.5 C 334.3 71.2, 307.4 48.3, 293.6 43.7 C 279.8 39.1, 286.4 51.7, 278.1 59.3 C 269.8 66.9, 263.9 69.9, 253.8 80.2 C 243.7 90.5, 239.6 95.3, 229.5 108.9 C 219.4 122.5, 215.1 131.4, 205.2 145.5 C 195.3 159.6, 189.5 163.2, 182.1 176.8 C 174.7 190.4, 175.7 195.0, 169.9 210.8 C 164.1 226.6, 159.9 234.4, 154.4 252.6 C 148.9 270.8, 147.1 279.2, 143.4 298.2 C 139.7 317.2, 137.7 326.8, 136.8 343.9 C 135.9 361.0, 135.8 367.4, 139.0 380.5 C 142.2 393.6, 145.3 397.9, 152.2 406.6 C 159.1 415.3, 162.4 408.2, 172.1 422.3 C 181.8 436.4, 188.9 460.9, 198.6 474.5 C 208.3 488.1, 211.1 493.0, 218.5 487.6 C 225.9 482.2, 226.6 470.2, 234.0 448.4 C 241.4 426.6, 244.6 410.3, 253.8 383.1 C 263.0 355.9, 268.9 346.4, 278.1 317.8 C 287.3 289.2, 290.6 273.2, 298.0 246.0 C 305.4 218.8, 306.6 213.7, 313.5 187.3 C 320.4 160.9, 325.1 139.0, 331.1 119.4 C 337.1 99.8, 339.4 101.2, 342.2 93.3 C 345.0 85.4, 354.5 91.8, 344.4 81.5 Z';

const TW_CHIPS = [
  ['連江縣', 6, 13], ['金門縣', 22, 13], ['澎湖縣', 52, 15],
  ['基隆市', 8, 74], ['台北市', 13, 63], ['新北市', 7, 51], ['桃園市', 14, 39],
  ['新竹縣', 20, 49], ['新竹市', 23, 34], ['宜蘭縣', 20, 75],
  ['苗栗縣', 30, 36], ['台中市', 36, 46], ['彰化縣', 42, 30], ['南投縣', 47, 55], ['雲林縣', 51, 28],
  ['嘉義市', 59, 34], ['嘉義縣', 61, 22], ['台南市', 69, 26], ['高雄市', 76, 39], ['屏東縣', 87, 45],
  ['花蓮縣', 43, 73], ['台東縣', 71, 66]
];

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function pad2(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 1 ? `0${digits}` : digits.slice(-2);
}

function splitSavedDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return { year: '', month: '', day: '' };
  const [year, month, day] = iso.split('-');
  return { year, month, day };
}

export function renderBirthDateHtml(answers) {
  const saved = splitSavedDate(answers.birthDate);
  return `
    <div class="birth-date-box" id="birth_date_box">
      <div class="birth-date-segment-group">
        <div class="birth-date-field">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" id="birth_year" class="birth-date-input birth-date-year" placeholder="YYYY" maxlength="4" autocomplete="bday-year" value="${escapeAttr(saved.year)}" aria-label="出生年份">
          <span class="birth-date-unit">年</span>
        </div>
        <span class="birth-date-slash">/</span>
        <div class="birth-date-field">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" id="birth_month" class="birth-date-input birth-date-month" placeholder="MM" maxlength="2" autocomplete="bday-month" value="${escapeAttr(saved.month)}" aria-label="出生月份">
          <span class="birth-date-unit">月</span>
        </div>
        <span class="birth-date-slash">/</span>
        <div class="birth-date-field">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" id="birth_day" class="birth-date-input birth-date-day" placeholder="DD" maxlength="2" autocomplete="bday-day" value="${escapeAttr(saved.day)}" aria-label="出生日期">
          <span class="birth-date-unit">日</span>
        </div>
      </div>
      <span class="birth-date-icon" aria-hidden="true">📅</span>
    </div>
  `;
}

export function bindBirthDate(root, answers, onChange) {
  const yearEl = root.querySelector('#birth_year');
  const monthEl = root.querySelector('#birth_month');
  const dayEl = root.querySelector('#birth_day');

  const compose = () => {
    const year = String(yearEl?.value || '').replace(/\D/g, '').slice(0, 4);
    const month = pad2(monthEl?.value);
    const day = pad2(dayEl?.value);
    const iso = year.length === 4 && month && day ? `${year}-${month}-${day}` : '';
    answers.birthDate = isValidBirthDate(iso) ? iso : iso;
    if (typeof onChange === 'function') onChange();
  };

  yearEl?.addEventListener('input', () => {
    if (yearEl.value.replace(/\D/g, '').length >= 4) monthEl?.focus();
    compose();
  });
  monthEl?.addEventListener('input', () => {
    if (monthEl.value.replace(/\D/g, '').length >= 2) dayEl?.focus();
    compose();
  });
  dayEl?.addEventListener('input', compose);
}

export function renderBirthTimeHtml(answers) {
  const saved = answers.birthTime || '';
  const current = SHICHEN_OPTIONS.find((item) => item.value === saved);
  const centerTitle = current ? (current.value === 'unknown' ? '不清楚' : current.shortRange) : '點選出生時段';
  const centerDesc = current ? (current.value === 'unknown' ? '用中午估算' : current.range) : '十二格時段圓盤';
  const branches = SHICHEN_OPTIONS.filter((item) => item.value !== 'unknown');

  return `
    <div class="shichen-dial-wrapper">
      <div class="shichen-wheel-container" id="shichen_wheel_container">
        <div class="shichen-orbit-bg" aria-hidden="true"></div>
        <div class="shichen-center-hub" id="shichen_center_hub">
          <div class="shichen-hub-icon">🔮</div>
          <div class="shichen-hub-title" id="shichen_hub_title">${centerTitle}</div>
          <div class="shichen-hub-desc" id="shichen_hub_desc">${centerDesc}</div>
        </div>
        ${branches.map((opt, idx) => {
          const deg = BRANCH_ANGLES[idx];
          const selected = saved === opt.value ? 'selected' : '';
          return `
            <button type="button" class="shichen-bubble ${selected}" style="--deg: ${deg}deg;" data-birth-time="${escapeAttr(opt.value)}">
              <span class="shichen-bubble-branch">${opt.branch}</span>
              <span class="shichen-bubble-name">${opt.shortRange}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div class="shichen-unknown-box">
        <button type="button" class="shichen-unknown-btn ${saved === 'unknown' ? 'selected' : ''}" data-birth-time="unknown">
          <span class="unknown-icon">❓</span>
          <span class="unknown-text">不清楚具體時段（用中午估算）</span>
        </button>
      </div>
    </div>
  `;
}

export function bindBirthTime(root, answers, onChange) {
  const titleEl = root.querySelector('#shichen_hub_title');
  const descEl = root.querySelector('#shichen_hub_desc');

  const apply = (value) => {
    answers.birthTime = value;
    const current = SHICHEN_OPTIONS.find((item) => item.value === value);
    root.querySelectorAll('[data-birth-time]').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-birth-time') === value);
    });
    if (current && titleEl && descEl) {
      titleEl.textContent = current.value === 'unknown' ? '不清楚' : current.shortRange;
      descEl.textContent = current.value === 'unknown' ? '用中午估算' : current.range;
    }
    if (typeof onChange === 'function') onChange();
  };

  root.querySelectorAll('[data-birth-time]').forEach((el) => {
    el.addEventListener('click', () => apply(el.getAttribute('data-birth-time')));
  });
}

function twChip(name, top, left, saved) {
  const active = saved === name ? 'active' : '';
  return `<button type="button" class="tw-geo-chip ${active}" style="top:${top}%;left:${left}%;" data-birth-place="${escapeAttr(name)}">${name}</button>`;
}

function regionCloudHtml() {
  return `
    <div class="big-bubbles-cloud" id="big_bubbles_cloud">
      <button type="button" class="big-bubble-item big-bubble-tw" data-birth-region="tw">
        <span class="bubble-icon">🇹🇼</span>
        <span class="bubble-name">台灣主要縣市</span>
        <span class="bubble-hint">點擊散開地形 ➔</span>
      </button>
      <button type="button" class="big-bubble-item big-bubble-cn" data-birth-region="cn">
        <span class="bubble-icon">🇨🇳</span>
        <span class="bubble-name">中國大陸</span>
        <span class="bubble-hint">熱門省市 ➔</span>
      </button>
      <button type="button" class="big-bubble-item big-bubble-sea" data-birth-region="sea">
        <span class="bubble-icon">🇭🇰</span>
        <span class="bubble-name">港澳星馬</span>
        <span class="bubble-hint">主要都會 ➔</span>
      </button>
      <button type="button" class="big-bubble-item big-bubble-asia" data-birth-region="asia">
        <span class="bubble-icon">🇯🇵</span>
        <span class="bubble-name">亞洲鄰國</span>
        <span class="bubble-hint">日韓泰越 ➔</span>
      </button>
      <button type="button" class="big-bubble-item big-bubble-global" data-birth-region="global">
        <span class="bubble-icon">🇺🇸</span>
        <span class="bubble-name">美國歐美</span>
        <span class="bubble-hint">美加英澳 ➔</span>
      </button>
    </div>
  `;
}

function taiwanMapHtml(saved) {
  return `
    <div class="bubble-scatter-stage" id="scatter_stage_tw">
      <div class="scatter-header">
        <div class="scatter-title">🇹🇼 台灣地理地形排列（點擊選取）</div>
        <button type="button" class="back-btn-pill" data-birth-region-back>↩ 返回大區域</button>
      </div>
      <div class="taiwan-map-stage">
        <svg class="taiwan-svg-outline" viewBox="0 0 400 520" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="twWhiteGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="${TW_ISLAND_PATH}" stroke="#FFFFFF" stroke-width="2.6" fill="rgba(168, 85, 247, 0.08)" stroke-linejoin="round" filter="url(#twWhiteGlow)" />
          <path d="M 300 70 Q 255 200 245 300 Q 235 390 225 460" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1.8" stroke-dasharray="4 4" fill="none" />
          <ellipse cx="60" cy="270" rx="22" ry="26" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="3 3" fill="rgba(59, 130, 246, 0.08)" />
          <text x="60" y="240" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700">澎湖</text>
          <ellipse cx="52" cy="115" rx="22" ry="18" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="3 3" fill="rgba(59, 130, 246, 0.08)" />
          <text x="52" y="93" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700">金門</text>
          <ellipse cx="52" cy="35" rx="20" ry="16" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="3 3" fill="rgba(59, 130, 246, 0.08)" />
          <text x="52" y="16" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700">連江(馬祖)</text>
        </svg>
        ${TW_CHIPS.map((item) => twChip(item[0], item[1], item[2], saved)).join('')}
      </div>
    </div>
  `;
}

const REGION_TITLES = {
  cn: '🇨🇳 中國大陸白線地圖（點擊選取）',
  sea: '🇭🇰 港澳星馬白線地圖（點擊選取）',
  asia: '🇯🇵 亞洲鄰國白線地圖（點擊選取）',
  global: '🇺🇸 美加歐澳白線地圖（點擊選取）'
};

function overseasHtml(region, saved) {
  return `
    <div class="bubble-scatter-stage" id="scatter_stage_${escapeAttr(region)}">
      <div class="scatter-header">
        <div class="scatter-title">${REGION_TITLES[region] || REGION_TITLES.cn}</div>
        <button type="button" class="back-btn-pill" data-birth-region-back>↩ 返回大區域</button>
      </div>
      ${renderOverseasBirthMaps(region, saved)}
    </div>
  `;
}

export function renderBirthPlaceHtml(answers) {
  const saved = answers.birthPlace || '';
  const region = answers.birthPlaceRegion || '';
  let mapHtml = regionCloudHtml();
  if (region === 'tw') mapHtml = taiwanMapHtml(saved);
  else if (region) mapHtml = overseasHtml(region, saved);

  return `
    <div class="input-group" style="margin-bottom:8px;">
      <input type="text" id="input_birth_place" class="app-textarea birth-place-input" value="${escapeAttr(saved)}" placeholder="例如：台北市、台中市、北京、香港...">
    </div>
    <div class="bubble-map-wrapper" id="bubble_map_stage_mount">
      ${mapHtml}
    </div>
  `;
}

export function bindBirthPlace(root, answers, { onChange, rerender } = {}) {
  const input = root.querySelector('#input_birth_place');

  const setPlace = (name) => {
    answers.birthPlace = name;
    if (input) input.value = name;
    root.querySelectorAll('[data-birth-place]').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-birth-place') === name);
    });
    if (typeof onChange === 'function') onChange();
  };

  input?.addEventListener('input', () => {
    answers.birthPlace = String(input.value || '').trim();
    if (typeof onChange === 'function') onChange();
  });

  root.querySelectorAll('[data-birth-place]').forEach((el) => {
    el.addEventListener('click', () => setPlace(el.getAttribute('data-birth-place')));
  });

  root.querySelectorAll('[data-birth-region]').forEach((el) => {
    el.addEventListener('click', () => {
      answers.birthPlaceRegion = el.getAttribute('data-birth-region');
      if (typeof rerender === 'function') rerender();
    });
  });

  root.querySelector('[data-birth-region-back]')?.addEventListener('click', () => {
    answers.birthPlaceRegion = '';
    if (typeof rerender === 'function') rerender();
  });
}
