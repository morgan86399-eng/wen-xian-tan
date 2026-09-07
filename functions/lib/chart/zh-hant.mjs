const CHAR_MAP = {
  宫: "宮",
  财: "財",
  禄: "祿",
  阳: "陽",
  阴: "陰",
  机: "機",
  杀: "殺",
  军: "軍",
  贞: "貞",
  铃: "鈴",
  罗: "羅",
  迁: "遷",
  仆: "僕",
  权: "權",
  术: "術",
  数: "數",
  门: "門",
  贪: "貪",
  来: "來",
  见: "見",
  东: "東",
  长: "長",
  马: "馬",
  华: "華",
  龙: "龍",
  凤: "鳳",
  启: "啟"
};

export function toHant(value) {
  if (value == null) return value;
  return String(value).replace(/[宫财禄阳阴机杀军贞铃罗迁仆权术数门贪来见东长马华龙凤启]/g, (ch) => CHAR_MAP[ch] || ch);
}
