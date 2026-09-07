/**
 * 全站 UI 層疊鎖：一次只讓「當前最上層」吃點擊與捲動。
 * 不要靠把 z-index 加到 99999 來硬蓋。
 */

function hasOpenClass(el) {
  return Boolean(el && (el.classList.contains('show') || el.classList.contains('active')));
}

export function isAnyUiLayerOpen() {
  const reading = document.getElementById('readingModalBackdrop');
  const purchase = document.getElementById('purchaseModalBackdrop');
  const privacy = document.getElementById('privacyConfirmModalBackdrop');
  const camera = document.getElementById('camera-dialog');
  const kyp = document.getElementById('kaiyun-payment-modal');
  const celestial = document.getElementById('celestialPurchaseTransition');
  return (
    hasOpenClass(reading)
    || hasOpenClass(purchase)
    || hasOpenClass(privacy)
    || Boolean(camera?.open)
    || (kyp && kyp.style.display === 'flex')
    || Boolean(celestial?.classList.contains('is-visible'))
  );
}

export function syncUiLayerLock() {
  const open = isAnyUiLayerOpen();
  document.documentElement.classList.toggle('ui-layer-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

export function setOverlayOpen(el, open) {
  if (!el) return;
  el.classList.toggle('show', open);
  el.classList.toggle('active', open);
  if ('inert' in el) el.inert = !open;
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
  syncUiLayerLock();
}

if (typeof window !== 'undefined') {
  window.ZenaskerSyncUiLayer = syncUiLayerLock;
}
