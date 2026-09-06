/** 付款回跳參數：成功網址用 orderId，舊參數 order 仍相容 */
export function readPaymentReturnOrderId(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return String(params.get('orderId') || params.get('order') || '').trim();
}
