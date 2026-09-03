/* ==========================================================================
   問仙壇 · 掌心解碼 — 掌心智慧相機辨識與拍照引擎
   （等同於 kaiyun-code.pages.dev / 掌心密碼之掌心精準偵測、輪廓對齊與即時分析）
   只拍掌心，不拍臉。Blob 照片只存於記憶體，保護隱私。
   ========================================================================== */
const CAMERA_STABILITY_MS = 700;
const CAMERA_MOTION_THRESHOLD = 18;

const state = {
  files: { left: null, right: null },
  previewUrls: { left: "", right: "" },
  cameraStream: null,
  cameraHand: "left",
  cameraDetector: 0,
  cameraReadyFrames: 0,
  cameraReadyStreak: 0,
  cameraReadySince: 0,
  cameraStableSince: 0,
  cameraFrameSignature: null,
  cameraSharpnessSamples: [],
  cameraFocusKind: "phone-rear",
  cameraCapturePending: false,
  cameraRequestId: 0,
  lastHand: "left",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const DIALOG_HTML = `
  <dialog id="camera-dialog" class="camera-dialog" aria-labelledby="camera-title">
    <div class="camera-dialog-inner">
      <div class="camera-dialog-heading">
        <div><h2 id="camera-title">請拍左手</h2></div>
        <button type="button" class="camera-close" data-camera-close aria-label="關閉相機">×</button>
      </div>
      
      <div class="camera-frame">
        <video id="camera-preview" autoplay muted playsinline aria-label="相機即時預覽"></video>
        <div class="camera-guides" aria-hidden="true">
          <svg class="palm-guide" viewBox="0 0 1050 1200" preserveAspectRatio="xMidYMid meet">
            <path class="palm-guide-outline" d="M360 1190C350 1110 300 1010 230 920L75 750C40 710 45 650 90 625C125 605 170 615 200 650L340 790C325 710 310 640 305 550L285 205C282 145 320 110 365 112C410 114 436 150 440 207L455 500C457 535 480 551 501 526L495 95C494 35 535 5 580 16C620 25 637 65 635 117L620 505C619 540 646 556 668 526L700 190C706 135 745 108 785 120C825 132 844 172 836 225L790 555C785 592 814 608 839 578L885 355C897 302 938 278 976 296C1015 314 1027 356 1013 405L948 660C930 760 900 850 835 930C800 973 770 1025 760 1190Z"/>
          </svg>
          <span class="camera-focus-countdown" data-camera-focus-countdown hidden>
            <strong data-camera-focus-seconds></strong>
            <small>秒後拍照</small>
          </span>
          <span class="camera-guide-label" data-camera-guide-label>手掌靠近鏡頭，填滿輪廓</span>
        </div>
      </div>
      
      <p id="camera-error" class="camera-error" role="alert" aria-live="polite">正在開啟相機…</p>
      
      <div class="camera-actions">
        <button type="button" class="secondary-button" data-camera-gallery>改從相簿選擇</button>
        <button type="button" class="primary-button" data-camera-shutter disabled>拍下這張</button>
      </div>
    </div>
  </dialog>
`;

export async function prepareImage(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error("照片檔案過大（超過 20MB）。建議在 30 公分內重新拍攝掌心照片。");
  if (await canKeepOriginal(file)) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("這張照片無法讀取。建議用手機相機直接拍攝 JPG 格式的掌心照片。");
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of scale === 1 ? [0.95, 0.9] : [0.92, 0.85]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 8 * 1024 * 1024) return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
      }
    }
    throw new Error("照片壓縮後仍超過可分析大小。建議距離掌心 15～30 公分重新拍攝。");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canKeepOriginal(file) {
  if (!file || file.size > 8 * 1024 * 1024) return false;
  if (["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) return true;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const webp = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  return jpeg || png || webp;
}

export async function fileToCompressedBase64(file, maxSide = 1024, quality = 0.8) {
  if (!file) return "";
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("這張照片無法轉成可傳送的格式，請改拍一張清晰的掌心照片。");
    }
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const longest = Math.max(width, height);
    if (longest > maxSide) {
      const scale = maxSide / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function setFile(hand, file) {
  if (state.previewUrls[hand]) URL.revokeObjectURL(state.previewUrls[hand]);
  state.previewUrls[hand] = "";
  if (!file) {
    state.files[hand] = null;
    if (!state.files.left && !state.files.right) {
      window.KaiyunPalmCapture.lastFile = null;
      window.KaiyunPalmCapture.lastBase64 = "";
    }
    document.dispatchEvent(new CustomEvent("kaiyun-palm-cleared", { detail: { hand } }));
    return;
  }
  state.files[hand] = file;
  state.lastHand = hand;
  window.KaiyunPalmCapture.lastFile = file;
  window.KaiyunPalmCapture.lastHand = hand;
  state.previewUrls[hand] = URL.createObjectURL(file);
  document.dispatchEvent(new CustomEvent("kaiyun-palm-captured", { detail: { hand, file, previewUrl: state.previewUrls[hand] } }));
}

export async function handleFile(hand, file) {
  if (!file) return;
  const error = $("#camera-error");
  if (error) error.textContent = "影像處理中…";
  try {
    const prepared = await prepareImage(file);
    setFile(hand, prepared);
    const base64 = await fileToCompressedBase64(prepared, 1024, 0.8);
    window.KaiyunPalmCapture.lastBase64 = base64;
    document.dispatchEvent(new CustomEvent("kaiyun-palm-captured", {
      detail: { hand, file: prepared, previewUrl: state.previewUrls[hand], palmImageBase64: base64 }
    }));
  } catch (errorValue) {
    setFile(hand, null);
    if (error) error.textContent = errorValue instanceof Error ? errorValue.message : "照片無法處理，請重試。";
  }
}

export function stopCamera() {
  state.cameraRequestId += 1;
  if (state.cameraDetector) window.clearInterval(state.cameraDetector);
  state.cameraDetector = 0;
  state.cameraReadyFrames = 0;
  state.cameraReadyStreak = 0;
  state.cameraReadySince = 0;
  state.cameraStableSince = 0;
  state.cameraPositionLockedStreak = 0;
  state.cameraPositionLockTime = 0;
  state.cameraFrameSignature = null;
  state.cameraSharpnessSamples = [];
  state.cameraCapturePending = false;
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  setFocusCountdown(null);
  const video = $("#camera-preview");
  if (video) video.srcObject = null;
}

export function closeCameraDialog() {
  const dialog = $("#camera-dialog");
  stopCamera();
  state.cameraHand = "";
  if (dialog?.open) dialog.close();
}

export function openFilePicker(hand, useCamera = false) {
  let input = $(`#${hand}-file`);
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.id = `${hand}-file`;
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => handleFile(hand, input.files?.[0]));
  }
  input.value = "";
  if (useCamera) input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.click();
}

function videoCoverCrop(video, targetAspect) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > targetAspect) {
    const width = sourceHeight * targetAspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetAspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

function classifyCameraKind(track, userAgent = "", touchPoints = 0) {
  const facing = String(track?.getSettings?.()?.facingMode || "").toLowerCase();
  const mobile = /iPhone|iPad|iPod|Android|Mobile|webOS/i.test(String(userAgent)) || Number(touchPoints) > 1;
  if (!mobile) return "computer";
  return facing === "user" ? "phone-front" : "phone-rear";
}

function setFocusCountdown(seconds) {
  const el = $("[data-camera-focus-countdown]");
  if (!el) return;
  if (seconds == null || seconds < 0) {
    el.hidden = true;
    const num = $("[data-camera-focus-seconds]", el);
    if (num) num.textContent = "";
    return;
  }
  const num = $("[data-camera-focus-seconds]", el);
  if (num) num.textContent = String(seconds);
  el.hidden = false;
}

export function analyzePalmPixels(data, width, height) {
  let skin = 0;
  let centerSkin = 0;
  let centerPixels = 0;
  let usableLight = 0;
  let topSkin = 0;
  let topPixels = 0;
  let bottomSkin = 0;
  let bottomPixels = 0;
  let cornerSkin = 0;
  let cornerPixels = 0;
  const upperSkinByColumn = new Uint16Array(width);
  const upperRows = Math.max(1, Math.floor(height * 0.32));
  let edgeTotal = 0;
  let edgeCount = 0;
  const gray = new Uint8Array(width * height);
  
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const colorSeparation = r - g > 7 && r - b > 11;
    const darkerSkin = y < 155 && cr > 132 && cb < 140 && r > g * 0.94 && r > b * 0.94;
    const isSkin = y > 34 && cb > 65 && cb < 148 && cr > 125 && cr < 190 && (colorSeparation || darkerSkin);
    const x = index % width;
    const row = Math.floor(index / width);
    const inCenter = x > width * 0.18 && x < width * 0.82 && row > height * 0.06 && row < height * 0.94;
    const inTop = row < height * 0.22;
    const inBottom = row > height * 0.78;
    const inCorner = (x < width * 0.2 || x > width * 0.8) && (row < height * 0.2 || row > height * 0.8);
    
    if (isSkin) skin += 1;
    if (inCenter) {
      centerPixels += 1;
      if (isSkin) centerSkin += 1;
    }
    if (inTop) { topPixels += 1; if (isSkin) topSkin += 1; }
    if (inBottom) { bottomPixels += 1; if (isSkin) bottomSkin += 1; }
    if (inCorner) { cornerPixels += 1; if (isSkin) cornerSkin += 1; }
    if (isSkin && row < upperRows) upperSkinByColumn[x] += 1;
    if (y > 46 && y < 245) usableLight += 1;
    gray[index] = y;
  }
  
  for (let row = 1; row < height; row += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = row * width + x;
      if (x > width * 0.14 && x < width * 0.86 && row > height * 0.08 && row < height * 0.94) {
        edgeTotal += Math.abs(gray[index] - gray[index - 1]) + Math.abs(gray[index] - gray[index - width]);
        edgeCount += 2;
      }
    }
  }
  
  const skinRatio = skin / (width * height);
  const centerSkinRatio = centerSkin / centerPixels;
  const lightRatio = usableLight / (width * height);
  const sharpness = edgeCount ? edgeTotal / edgeCount : 0;
  const topSkinRatio = topSkin / topPixels;
  const bottomSkinRatio = bottomSkin / bottomPixels;
  const cornerSkinRatio = cornerSkin / cornerPixels;
  let fingerRuns = 0;
  let runWidth = 0;
  
  for (let x = 0; x <= width; x += 1) {
    const active = x < width && upperSkinByColumn[x] / upperRows > 0.18;
    if (active) runWidth += 1;
    else {
      if (runWidth >= Math.max(2, width * 0.035)) fingerRuns += 1;
      runWidth = 0;
    }
  }
  
  const centerContrast = centerSkinRatio - cornerSkinRatio;
  const palmPresent = skinRatio > 0.08 && centerSkinRatio > 0.18;

  // 嚴格掌心精準定位標準（Position Locked）：在框內置中、輪廓對齊、光線充足且清晰
  const shapeAligned = fingerRuns >= 2 && fingerRuns <= 6 && topSkinRatio > 0.03 && bottomSkinRatio > 0.08;
  const fillAligned = skinRatio > 0.15 && centerSkinRatio > 0.32 && bottomSkinRatio > 0.10 && lightRatio > 0.38 && sharpness >= 3.2;
  const isPositioned = palmPresent && centerSkinRatio >= 0.30 && (centerContrast > -0.05) && (shapeAligned || fillAligned);

  return {
    skinRatio,
    centerSkinRatio,
    lightRatio,
    sharpness,
    topSkinRatio,
    bottomSkinRatio,
    cornerSkinRatio,
    fingerRuns,
    palmPresent,
    isPositioned,
    ready: isPositioned
  };
}

function analyzePalmFrame(video) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const frame = $(".camera-frame");
  const targetAspect = (frame?.clientWidth || 320) / (frame?.clientHeight || 240);
  const crop = videoCoverCrop(video, targetAspect);
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const signature = new Uint8Array(144);
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const x = Math.min(canvas.width - 1, Math.floor((column + 0.5) * canvas.width / 12));
      const y = Math.min(canvas.height - 1, Math.floor((row + 0.5) * canvas.height / 12));
      const offset = (y * canvas.width + x) * 4;
      signature[row * 12 + column] = Math.round(0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]);
    }
  }
  return { ...analyzePalmPixels(pixels, canvas.width, canvas.height), signature };
}

function resetPalmReadyState() {
  state.cameraReadyFrames = 0;
  state.cameraReadyStreak = 0;
  state.cameraReadySince = 0;
  state.cameraStableSince = 0;
  state.cameraPositionLockedStreak = 0;
  state.cameraPositionLockTime = 0;
  state.cameraSharpnessSamples = [];
}

async function enableContinuousFocus(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  try {
    const modes = track.getCapabilities?.().focusMode;
    if (Array.isArray(modes) && modes.includes("continuous")) {
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    }
  } catch {
    return;
  }
}

function frameMotion(previous, current) {
  if (!previous || !current || previous.length !== current.length) return Infinity;
  let total = 0;
  for (let index = 0; index < current.length; index += 1) total += Math.abs(current[index] - previous[index]);
  return total / current.length;
}

function startPalmDetector(video) {
  const guides = $(".camera-guides");
  const label = $("[data-camera-guide-label]");
  state.cameraDetector = window.setInterval(() => {
    if (!state.cameraStream || state.cameraCapturePending || video.readyState < 2) return;
    const result = analyzePalmFrame(video);

    // 未偵測到手掌
    if (!result.palmPresent) {
      resetPalmReadyState();
      state.cameraFrameSignature = null;
      guides?.classList.remove("is-positioned", "is-ready");
      setFocusCountdown(null);
      if (label) label.textContent = "請將掌心移至中央引導輪廓內";
      return;
    }

    // 偵測到手掌，但尚未精準對齊定位
    if (!result.isPositioned) {
      resetPalmReadyState();
      guides?.classList.remove("is-positioned", "is-ready");
      setFocusCountdown(null);

      if (label) {
        if (result.centerSkinRatio < 0.30) {
          label.textContent = "掌心偏離，請對準中央引導框";
        } else if (result.bottomSkinRatio < 0.08) {
          label.textContent = "手掌請稍微上移，對齊手腕底線";
        } else if (result.topSkinRatio < 0.03 && result.fingerRuns < 2) {
          label.textContent = "請張開手掌，指尖對齊上方框線";
        } else if (result.sharpness < 3.2) {
          label.textContent = "請保持光線充足，避免模糊";
        } else {
          label.textContent = "掌心調整中，請對齊引導輪廓...";
        }
      }
      return;
    }

    // 手掌已入框，檢查移動晃動度
    const motion = frameMotion(state.cameraFrameSignature, result.signature);
    state.cameraFrameSignature = result.signature;
    if (motion > CAMERA_MOTION_THRESHOLD) {
      resetPalmReadyState();
      guides?.classList.remove("is-positioned", "is-ready");
      setFocusCountdown(null);
      if (label) label.textContent = "掌心定位中，請保持平穩不動";
      return;
    }

    // 累積穩定定位幀數（必須連續 2 次以上確認定位穩定，才開始倒數）
    state.cameraPositionLockedStreak = (state.cameraPositionLockedStreak || 0) + 1;
    if (state.cameraPositionLockedStreak < 2) {
      guides?.classList.remove("is-positioned", "is-ready");
      setFocusCountdown(null);
      if (label) label.textContent = "正在鎖定掌心位置與對焦...";
      return;
    }

    // ===== 掌心已精準定位，開始 3 秒倒數拍照 =====
    guides?.classList.add("is-positioned");
    const now = Date.now();
    if (!state.cameraPositionLockTime) {
      state.cameraPositionLockTime = now;
    }

    const elapsedLockMs = now - state.cameraPositionLockTime;
    const totalCountdownMs = 3000;
    const remainingMs = Math.max(0, totalCountdownMs - elapsedLockMs);
    const seconds = Math.ceil(remainingMs / 1000);

    if (remainingMs > 0) {
      if (label) label.textContent = `✨ 掌心已精準定位，請保持不動 (${seconds}s)`;
      setFocusCountdown(seconds);
      return;
    }

    // 倒數結束，執行自動拍攝
    setFocusCountdown(null);
    guides?.classList.add("is-ready");
    if (label) label.textContent = "📸 定位完成，正在拍攝掌心";
    captureCameraPhoto(true);
  }, 220);
}

export async function openCamera(hand = "left") {
  ensurePalmCaptureDom();
  const dialog = $("#camera-dialog");
  const video = $("#camera-preview");
  const error = $("#camera-error");
  const shutter = $("[data-camera-shutter]");
  if (!dialog?.showModal || !navigator.mediaDevices?.getUserMedia) {
    openFilePicker(hand, true);
    return;
  }
  stopCamera();
  const requestId = ++state.cameraRequestId;
  state.cameraHand = hand;
  const titleEl = $("#camera-title");
  if (titleEl) titleEl.textContent = hand === "right" ? "請拍右手" : "請拍左手";
  const guides = $(".camera-guides");
  guides?.classList.toggle("is-mirrored", hand === "right");
  guides?.classList.remove("is-ready");
  const label = $("[data-camera-guide-label]");
  if (label) label.textContent = "手掌靠近鏡頭，填滿輪廓";
  if (error) error.textContent = "正在開啟相機…";
  if (shutter) shutter.disabled = true;
  dialog.showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    if (!dialog.open || state.cameraHand !== hand || state.cameraRequestId !== requestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.cameraStream = stream;
    state.cameraFocusKind = classifyCameraKind(stream.getVideoTracks()[0], navigator.userAgent, navigator.maxTouchPoints || 0);
    await enableContinuousFocus(stream);
    video.srcObject = state.cameraStream;
    await video.play();
    if (!dialog.open || state.cameraHand !== hand || state.cameraRequestId !== requestId) {
      stream.getTracks().forEach((track) => track.stop());
      if (video.srcObject === stream) video.srcObject = null;
      return;
    }
    if (error) error.textContent = "掌心放進輪廓內即可。";
    if (shutter) shutter.disabled = false;
    startPalmDetector(video);
  } catch (errorValue) {
    if (state.cameraRequestId !== requestId) return;
    const denied = errorValue instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(errorValue.name);
    if (denied) {
      if (error) error.innerHTML = '<strong>無法啟動相機鏡頭</strong><br><small style="opacity:0.7">瀏覽器尚未取得相機授權，或鏡頭正被其他 App 佔用。</small><br><small style="opacity:0.85">請點擊網址列旁的 🔒 圖示允許「相機」；或改用下方「從相簿選擇」。</small>';
    } else {
      if (error) error.innerHTML = '<strong>目前無法啟動相機</strong><br><small style="opacity:0.7">請改用下方「從相簿選擇」上傳一張清晰的掌心照片。</small>';
    }
  }
}

export async function captureCameraPhoto(automatic = false) {
  const video = $("#camera-preview");
  const dialog = $("#camera-dialog");
  const error = $("#camera-error");
  if (state.cameraCapturePending || !state.cameraHand || !video?.videoWidth || !video.videoHeight) return;
  state.cameraCapturePending = true;
  const requestId = state.cameraRequestId;
  const hand = state.cameraHand;
  const frame = $(".camera-frame");
  const crop = videoCoverCrop(video, (frame?.clientWidth || 320) / (frame?.clientHeight || 240));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  canvas.getContext("2d", { alpha: false }).drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (state.cameraRequestId !== requestId || !dialog?.open) return;
  if (!blob) {
    state.cameraCapturePending = false;
    if (error) error.textContent = "拍照失敗，請再試一次。";
    return;
  }
  if (automatic && error) error.textContent = "掌心讀取成功，正在匯入照片。";
  const capturedFile = new File([blob], `${hand}-palm-camera.jpg`, { type: "image/jpeg" });
  await handleFile(hand, capturedFile);
  if (state.cameraRequestId === requestId && dialog?.open) closeCameraDialog();
}

function setupCamera() {
  const dialog = $("#camera-dialog");
  if (!dialog) return;
  dialog.addEventListener("close", () => {
    if (!dialog.open && (state.cameraStream || state.cameraDetector)) closeCameraDialog();
  });
  $("[data-camera-close]")?.addEventListener("click", closeCameraDialog);
  $("[data-camera-shutter]")?.addEventListener("click", () => captureCameraPhoto(false));
  $("[data-camera-gallery]")?.addEventListener("click", () => {
    const hand = state.cameraHand || "left";
    closeCameraDialog();
    openFilePicker(hand);
  });
}

export function ensurePalmCaptureDom() {
  if (!$("#camera-dialog")) {
    const wrap = document.createElement("div");
    wrap.innerHTML = DIALOG_HTML;
    if (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
    setupCamera();
  }
}

window.KaiyunPalmCapture = {
  lastFile: null,
  lastBase64: "",
  lastHand: "left",
  activeHand: "left",
  gender: "",
  init(options = {}) {
    this.activeHand = options.hand === "right" ? "right" : "left";
    this.lastHand = this.activeHand;
    this.gender = options.gender || "";
    ensurePalmCaptureDom();
  },
  openCamera(hand) {
    return openCamera(hand || this.activeHand || "left");
  },
  openAlbum(hand) {
    return openFilePicker(hand || this.activeHand || "left");
  }
};
