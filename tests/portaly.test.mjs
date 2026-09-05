import assert from 'node:assert/strict';
import { stableJson, signPortalyCallback, verifyPortalyCallback, timingSafeEqualHex } from '../functions/lib/wxt/portaly.mjs';

async function runTests() {
  console.log('🧪 正在執行 Portaly 簽章驗證測試...');

  // 向量 1：來自 Portaly 官方 golden vector
  const vector1 = {
    secret: 'portaly_fixture_secret_not_for_production',
    timestamp: '2026-07-01T07:00:00.000Z',
    payload: {
      cancelRequestedBy: 'creator',
      status: 'canceled',
      cancelReasonNote: '方案 A & B <manual> > retry',
      canceledAt: '2026-07-01T06:59:00.000Z',
      cancelRequestedAt: '2026-06-30T12:00:00.000Z',
      cancelReason: 'requested_by_creator',
      amount: 8800,
      cancelEffectiveAt: '2026-07-31T00:00:00.000Z',
      metadata: {
        source: '網站',
        campaign: '夏季'
      },
      flags: [true, null, false]
    },
    expectedStableJson: '{"amount":8800,"canceledAt":"2026-07-01T06:59:00.000Z","cancelEffectiveAt":"2026-07-31T00:00:00.000Z","cancelReason":"requested_by_creator","cancelReasonNote":"方案 A & B <manual> > retry","cancelRequestedAt":"2026-06-30T12:00:00.000Z","cancelRequestedBy":"creator","flags\":[true,null,false],\"metadata\":{\"campaign\":\"夏季\",\"source\":\"網站\"},\"status\":\"canceled\"}',
    expectedSignature: '16b288d414cc550e742f3b304b1cf8847dd1d5b1cfb149ce6bfa011af0f5dde8'
  };

  const computedStableJson = stableJson(vector1.payload);
  assert.equal(computedStableJson, vector1.expectedStableJson, 'stableJson 序列化結果必須完全一致');
  console.log('  ✓ stableJson key sorting passed');

  const computedSig = await signPortalyCallback({
    secret: vector1.secret,
    payload: vector1.payload,
    timestamp: vector1.timestamp
  });
  assert.equal(computedSig, vector1.expectedSignature, 'HMAC-SHA256 簽名必須與官方向量相同');
  console.log('  ✓ signPortalyCallback HMAC-SHA256 passed');

  assert.equal(timingSafeEqualHex(computedSig, vector1.expectedSignature), true);
  assert.equal(timingSafeEqualHex(computedSig, 'wrong_sig'), false);
  console.log('  ✓ timingSafeEqualHex constant time equality passed');

  // 測試在公差內驗證成功
  const now = new Date().toISOString();
  const validSig = await signPortalyCallback({
    secret: 'test_secret',
    payload: { test: 123 },
    timestamp: now
  });
  const isValid = await verifyPortalyCallback({
    secret: 'test_secret',
    payload: { test: 123 },
    timestamp: now,
    signature: validSig
  });
  assert.equal(isValid, true, '合法當前時間簽章必須驗證通過');

  // 測試逾期防重放失敗
  const expiredTimestamp = new Date(Date.now() - 600 * 1000).toISOString();
  const expiredSig = await signPortalyCallback({
    secret: 'test_secret',
    payload: { test: 123 },
    timestamp: expiredTimestamp
  });
  const isExpiredValid = await verifyPortalyCallback({
    secret: 'test_secret',
    payload: { test: 123 },
    timestamp: expiredTimestamp,
    signature: expiredSig,
    toleranceSeconds: 300
  });
  assert.equal(isExpiredValid, false, '超過 5 分鐘時間戳必須防重放阻擋');
  console.log('  ✓ verifyPortalyCallback timestamp anti-replay tolerance passed');

  console.log('🎉 所有 Portaly 簽章單元測試全數通過！');
}

runTests().catch((err) => {
  console.error('❌ 測試失敗:', err);
  process.exit(1);
});
