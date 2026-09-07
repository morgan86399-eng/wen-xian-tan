export const CITY_COORDINATES = {
  // 台灣主要縣市
  '台北市': { lng: 121.5654, lat: 25.0330, tz: 8, region: 'tw' },
  '新北市': { lng: 121.4628, lat: 25.0124, tz: 8, region: 'tw' },
  '基隆市': { lng: 121.7462, lat: 25.1276, tz: 8, region: 'tw' },
  '桃園市': { lng: 121.3010, lat: 24.9936, tz: 8, region: 'tw' },
  '新竹市': { lng: 120.9675, lat: 24.8138, tz: 8, region: 'tw' },
  '新竹縣': { lng: 121.0180, lat: 24.8387, tz: 8, region: 'tw' },
  '苗栗縣': { lng: 120.8208, lat: 24.5602, tz: 8, region: 'tw' },
  '台中市': { lng: 120.6736, lat: 24.1477, tz: 8, region: 'tw' },
  '彰化縣': { lng: 120.5385, lat: 24.0518, tz: 8, region: 'tw' },
  '南投縣': { lng: 120.6869, lat: 23.9099, tz: 8, region: 'tw' },
  '雲林縣': { lng: 120.4313, lat: 23.7092, tz: 8, region: 'tw' },
  '嘉義市': { lng: 120.4473, lat: 23.4800, tz: 8, region: 'tw' },
  '嘉義縣': { lng: 120.2930, lat: 23.4518, tz: 8, region: 'tw' },
  '台南市': { lng: 120.1856, lat: 22.9997, tz: 8, region: 'tw' },
  '高雄市': { lng: 120.3014, lat: 22.6273, tz: 8, region: 'tw' },
  '屏東縣': { lng: 120.4879, lat: 22.6761, tz: 8, region: 'tw' },
  '宜蘭縣': { lng: 121.7684, lat: 24.7570, tz: 8, region: 'tw' },
  '花蓮縣': { lng: 121.6068, lat: 23.9872, tz: 8, region: 'tw' },
  '台東縣': { lng: 121.1444, lat: 22.7583, tz: 8, region: 'tw' },
  '澎湖縣': { lng: 119.5793, lat: 23.5712, tz: 8, region: 'tw' },
  '金門縣': { lng: 118.3232, lat: 24.4485, tz: 8, region: 'tw' },
  '連江縣': { lng: 119.9289, lat: 26.1505, tz: 8, region: 'tw' },

  // 中國大陸主要省市
  '北京市': { lng: 116.4074, lat: 39.9042, tz: 8, region: 'cn' },
  '上海市': { lng: 121.4737, lat: 31.2304, tz: 8, region: 'cn' },
  '廣州市': { lng: 113.2644, lat: 23.1291, tz: 8, region: 'cn' },
  '深圳市': { lng: 114.0579, lat: 22.5431, tz: 8, region: 'cn' },
  '成都市': { lng: 104.0668, lat: 30.5728, tz: 8, region: 'cn' },
  '杭州市': { lng: 120.1551, lat: 30.2741, tz: 8, region: 'cn' },
  '武漢市': { lng: 114.3055, lat: 30.5928, tz: 8, region: 'cn' },
  '重慶市': { lng: 106.5516, lat: 29.5630, tz: 8, region: 'cn' },
  '南京市': { lng: 118.7969, lat: 32.0603, tz: 8, region: 'cn' },
  '廈門市': { lng: 118.0894, lat: 24.4798, tz: 8, region: 'cn' },
  '福州市': { lng: 119.3062, lat: 26.0753, tz: 8, region: 'cn' },
  '西安市': { lng: 108.9398, lat: 34.3416, tz: 8, region: 'cn' },
  '天津市': { lng: 117.2008, lat: 39.0842, tz: 8, region: 'cn' },
  '蘇州市': { lng: 120.5853, lat: 31.2989, tz: 8, region: 'cn' },
  '長沙市': { lng: 112.9388, lat: 28.2282, tz: 8, region: 'cn' },
  '青島市': { lng: 120.3826, lat: 36.0671, tz: 8, region: 'cn' },
  '大連市': { lng: 121.6147, lat: 38.9140, tz: 8, region: 'cn' },
  '瀋陽市': { lng: 123.4315, lat: 41.8057, tz: 8, region: 'cn' },
  '哈爾濱市': { lng: 126.5350, lat: 45.8038, tz: 8, region: 'cn' },
  '昆明市': { lng: 102.8329, lat: 24.8801, tz: 8, region: 'cn' },
  '海口市': { lng: 110.3312, lat: 20.0319, tz: 8, region: 'cn' },
  '三亞市': { lng: 109.5083, lat: 18.2528, tz: 8, region: 'cn' },

  // 港澳星馬
  '香港': { lng: 114.1694, lat: 22.3193, tz: 8, region: 'global' },
  '澳門': { lng: 113.5439, lat: 22.1987, tz: 8, region: 'global' },
  '新加坡': { lng: 103.8198, lat: 1.3521, tz: 8, region: 'global' },
  '吉隆坡': { lng: 101.6869, lat: 3.1390, tz: 8, region: 'global' },
  '檳城': { lng: 100.3327, lat: 5.4141, tz: 8, region: 'global' },

  // 東亞與歐美熱門
  '東京': { lng: 139.6917, lat: 35.6895, tz: 9, region: 'global' },
  '大阪': { lng: 135.5023, lat: 34.6937, tz: 9, region: 'global' },
  '首爾': { lng: 126.9780, lat: 37.5665, tz: 9, region: 'global' },
  '釜山': { lng: 129.0756, lat: 35.1796, tz: 9, region: 'global' },
  '曼谷': { lng: 100.5018, lat: 13.7563, tz: 7, region: 'global' },
  '雪梨': { lng: 151.2093, lat: -33.8688, tz: 10, region: 'global' },
  '墨爾本': { lng: 144.9631, lat: -37.8136, tz: 10, region: 'global' },
  '倫敦': { lng: -0.1278, lat: 51.5074, tz: 0, region: 'global' },
  '洛杉磯': { lng: -118.2437, lat: 34.0522, tz: -8, region: 'global' },
  '紐約': { lng: -74.0060, lat: 40.7128, tz: -5, region: 'global' },
  '舊金山': { lng: -122.4194, lat: 37.7749, tz: -8, region: 'global' },
  '溫哥華': { lng: -123.1207, lat: 49.2827, tz: -8, region: 'global' },
  '多倫多': { lng: -79.3832, lat: 43.6532, tz: -5, region: 'global' },

  '鄭州市': { lng: 113.6254, lat: 34.7466, tz: 8, region: 'cn' },
  '寧波市': { lng: 121.5440, lat: 29.8683, tz: 8, region: 'cn' },
  '珠海市': { lng: 113.5767, lat: 22.2707, tz: 8, region: 'cn' },
  '怡保': { lng: 101.0901, lat: 4.5975, tz: 8, region: 'global' },
  '新山': { lng: 103.7618, lat: 1.4927, tz: 8, region: 'global' },
  '古晉': { lng: 110.3592, lat: 1.5533, tz: 8, region: 'global' },
  '札幌': { lng: 141.3544, lat: 43.0621, tz: 9, region: 'global' },
  '名古屋': { lng: 136.9066, lat: 35.1815, tz: 9, region: 'global' },
  '京都': { lng: 135.7681, lat: 35.0116, tz: 9, region: 'global' },
  '福岡': { lng: 130.4017, lat: 33.5904, tz: 9, region: 'global' },
  '沖繩': { lng: 127.6809, lat: 26.2124, tz: 9, region: 'global' },
  '仁川': { lng: 126.7052, lat: 37.4563, tz: 9, region: 'global' },
  '濟州': { lng: 126.5312, lat: 33.4996, tz: 9, region: 'global' },
  '河內': { lng: 105.8342, lat: 21.0278, tz: 7, region: 'global' },
  '清邁': { lng: 98.9817, lat: 18.7883, tz: 7, region: 'global' },
  '普吉島': { lng: 98.3381, lat: 7.8804, tz: 7, region: 'global' },
  '胡志明市': { lng: 106.6297, lat: 10.8231, tz: 7, region: 'global' },
  '馬尼拉': { lng: 120.9842, lat: 14.5995, tz: 8, region: 'global' },
  '雅加達': { lng: 106.8456, lat: -6.2088, tz: 7, region: 'global' },
  '西雅圖': { lng: -122.3321, lat: 47.6062, tz: -8, region: 'global' },
  '休士頓': { lng: -95.3698, lat: 29.7604, tz: -6, region: 'global' },
  '芝加哥': { lng: -87.6298, lat: 41.8781, tz: -6, region: 'global' },
  '波士頓': { lng: -71.0589, lat: 42.3601, tz: -5, region: 'global' },
  '卡加利': { lng: -114.0719, lat: 51.0447, tz: -7, region: 'global' },
  '蒙特婁': { lng: -73.5673, lat: 45.5017, tz: -5, region: 'global' },
  '巴黎': { lng: 2.3522, lat: 48.8566, tz: 1, region: 'global' },
  '柏林': { lng: 13.4050, lat: 52.5200, tz: 1, region: 'global' },
  '布里斯本': { lng: 153.0260, lat: -27.4705, tz: 10, region: 'global' },
  '奧克蘭': { lng: 174.7633, lat: -36.8485, tz: 12, region: 'global' },
};


export const SHICHEN_OPTIONS = [
  { value: 'zi', branch: '子', name: '子時', range: '23:00 - 01:00', shortRange: '23:00-01:00', clock: '00:00' },
  { value: 'chou', branch: '丑', name: '丑時', range: '01:00 - 03:00', shortRange: '01:00-03:00', clock: '02:00' },
  { value: 'yin', branch: '寅', name: '寅時', range: '03:00 - 05:00', shortRange: '03:00-05:00', clock: '04:00' },
  { value: 'mao', branch: '卯', name: '卯時', range: '05:00 - 07:00', shortRange: '05:00-07:00', clock: '06:00' },
  { value: 'chen', branch: '辰', name: '辰時', range: '07:00 - 09:00', shortRange: '07:00-09:00', clock: '08:00' },
  { value: 'si', branch: '巳', name: '巳時', range: '09:00 - 11:00', shortRange: '09:00-11:00', clock: '10:00' },
  { value: 'wu', branch: '午', name: '午時', range: '11:00 - 13:00', shortRange: '11:00-13:00', clock: '12:00' },
  { value: 'wei', branch: '未', name: '未時', range: '13:00 - 15:00', shortRange: '13:00-15:00', clock: '14:00' },
  { value: 'shen', branch: '申', name: '申時', range: '15:00 - 17:00', shortRange: '15:00-17:00', clock: '16:00' },
  { value: 'you', branch: '酉', name: '酉時', range: '17:00 - 19:00', shortRange: '17:00-19:00', clock: '18:00' },
  { value: 'xu', branch: '戌', name: '戌時', range: '19:00 - 21:00', shortRange: '19:00-21:00', clock: '20:00' },
  { value: 'hai', branch: '亥', name: '亥時', range: '21:00 - 23:00', shortRange: '21:00-23:00', clock: '22:00' },
  { value: 'unknown', branch: '?', name: '不清楚', range: '時段不明', shortRange: '不清楚', clock: '12:00' }
];

export function lookupCity(placeName) {
  if (!placeName) return { name: '台北市', ...CITY_COORDINATES['台北市'] };
  const raw = String(placeName).trim();
  for (const [key, val] of Object.entries(CITY_COORDINATES)) {
    if (raw.includes(key) || key.includes(raw)) return { name: key, ...val };
  }
  return { name: raw, lng: 121.5654, lat: 25.0330, tz: 8, region: 'tw' };
}

export function shichenToClock(value) {
  const hit = SHICHEN_OPTIONS.find((item) => item.value === value);
  return hit ? hit.clock : '12:00';
}

export function timezoneFromOffset(tz) {
  const n = Number(tz);
  if (!Number.isFinite(n)) return 'Asia/Taipei';
  if (n === 8) return 'Asia/Taipei';
  if (n === 9) return 'Asia/Tokyo';
  if (n === 7) return 'Asia/Bangkok';
  if (n === 10) return 'Australia/Sydney';
  if (n === 12) return 'Pacific/Auckland';
  if (n === 0) return 'Europe/London';
  if (n === 1) return 'Europe/Paris';
  if (n === -5) return 'America/New_York';
  if (n === -6) return 'America/Chicago';
  if (n === -7) return 'America/Denver';
  if (n === -8) return 'America/Los_Angeles';
  return 'Asia/Taipei';
}
