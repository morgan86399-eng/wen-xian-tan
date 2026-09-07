const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export function parseClock(clockTime) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clockTime || "");
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]), minutes: Number(match[1]) * 60 + Number(match[2]) };
}

export function applyTrueSolarTime(clockTime, longitude, useTrueSolarTime) {
  const parsed = parseClock(clockTime);
  if (!parsed) return { ok: false, error: "clock_time" };
  if (!useTrueSolarTime) return { ok: true, clockTime, adjusted: false };
  const lng = Number(longitude);
  if (!Number.isFinite(lng) || lng < 73 || lng > 135) {
    return { ok: false, error: "longitude" };
  }
  const delta = Math.round((lng - 120) * 4);
  let minutes = parsed.minutes + delta;
  while (minutes < 0) minutes += 24 * 60;
  while (minutes >= 24 * 60) minutes -= 24 * 60;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return { ok: true, clockTime: `${hour}:${minute}`, adjusted: true, deltaMinutes: delta };
}

export function hourToIztroIndex(clockTime) {
  const parsed = parseClock(clockTime);
  if (!parsed) return null;
  const { minutes } = parsed;
  if (minutes >= 23 * 60) return 12;
  if (minutes < 60) return 0;
  return Math.floor((minutes - 60) / 120) + 1;
}

export function hourToZhi(clockTime) {
  const parsed = parseClock(clockTime);
  if (!parsed) return "";
  if (parsed.minutes >= 23 * 60 || parsed.minutes < 60) return "子";
  return ZHI[Math.floor((parsed.minutes - 60) / 120) + 1];
}

export function splitDate(calendarDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate || "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
