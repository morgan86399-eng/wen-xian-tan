/**
 * 問仙壇 · 法律合規與特約商店審查條款模組 (Terms, Privacy & Refund Policy)
 * 供綠界科技 (ECPay) 金流審查與使用者權益維護
 */

export const LEGAL_DOCS = {
  terms: {
    title: '服務條款 (Terms of Service)',
    content: `
      <div class="legal-doc-content">
        <h3>一、 認知與接受條款</h3>
        <p>歡迎您使用「問仙壇 · 掌心解碼」（以下簡稱「本平台」）。本平台由問仙壇營運團隊提供服務。當您瀏覽或使用本平台購買各項測算額度、體驗掌紋辨識與命理分析時，即表示您已詳細閱讀、瞭解並同意遵守本服務條款及所有相關法律規範。</p>

        <h3>二、 服務內容說明</h3>
        <p>1. 本平台提供之感情、工作、事業、財運、家庭與小孩等篇章，係結合東方傳統民俗哲理、易學文化符號與現代演算法之個人化文化休閒與心理指引數位內容服務。</p>
        <p>2. 購買各篇章供養方案獲得之「測算點數」，係用於解鎖生成專屬之數位分析報告。本服務為「非以有形媒介提供之數位內容或一經提供即為完成之線上服務」。</p>

        <h3>三、 免責聲明與民俗文化告知</h3>
        <p>1. 本平台產出之所有命理指引、流年照會、正緣特徵與吉凶建議，僅供個人心靈寄託、文化趣味與生涯反思之參考，絕不構成任何形式之醫療、法律或金融投資決策依據。</p>
        <p>2. 使用者應以理性態度面對人生各項重要決定，若有涉及身心健康或重大法律財務爭端，應諮詢相關專業認證人士。</p>

        <h3>四、 交易與金流安全</h3>
        <p>本平台之線上金流交易均委託具備 PCI-DSS Level 1 最高資安認證之合法第三方金流機構「綠界科技股份有限公司 (ECPay)」進行處理。本平台絕不保留、側錄或儲存任何使用者的信用卡卡號、有效期限或安全碼。</p>

        <h3>五、 智慧財產權</h3>
        <p>本平台所使用之軟體程式、網站架構、視覺插圖、文字故事及介面設計，均由本團隊或授權人合法擁有其智慧財產權，非經書面授權不得擅自重製、改作或作為商業用途。</p>
      </div>
    `
  },

  privacy: {
    title: '隱私權政策 (Privacy Policy)',
    content: `
      <div class="legal-doc-content">
        <h3>一、 個人資料之蒐集原則</h3>
        <p>問仙壇極度重視您的隱私權。我們僅在為您提供命理分析服務之必要範圍內，蒐集您主動輸入的性別、年齡區間、祈請關係角色與請教問題。</p>

        <h3>二、 掌心照片與生物特徵特別聲明（嚴格保護）</h3>
        <p>1. <strong>只拍掌心、不拍臉龐</strong>：掌相拍照引導僅限於手掌內側掌紋辨識，請勿拍攝人臉。</p>
        <p>2. <strong>不留存雲端資料庫</strong>：您拍攝或上傳之掌心影像，僅於您的裝置瀏覽器記憶體中進行演算法即時線條分析，<strong>本平台伺服器絕不儲存、絕不備份、亦絕不向任何第三方提供您的原始手相照片</strong>，測算結束後即可一鍵清除。</p>

        <h3>三、 Cookies 與本地儲存</h3>
        <p>為方便您登入回看過去測算產生的報告紀錄與剩餘點數，本平台使用瀏覽器之 LocalStorage 技術儲存您的報告摘要及錢包餘額。您可以隨時透過清除瀏覽器快取來移除所有本機紀錄。</p>

        <h3>四、 第三方金流資料傳輸</h3>
        <p>當您發起結帳時，系統將透過 SSL 256-bit 高規格加密通道將訂單金額與交易識別號傳送至綠界科技安全收銀台，以確保交易資訊於傳輸過程中之絕對機密與完整。</p>
      </div>
    `
  },

  refund: {
    title: '退換貨政策與爭議處理 (Refund Policy)',
    content: `
      <div class="legal-doc-content">
        <h3>一、 數位內容服務特性說明</h3>
        <p>依據中華民國《消費者保護法》第十九條第二項及行政院公布之《通訊交易解除權合理例外情事適用準則》第二條第五款規定，本平台所提供之「非以有形媒介提供之數位內容或一經提供即為完成之線上服務」，經消費者事先同意始提供者，不適用消保法七日無條件猶豫期（鑑賞期）。</p>

        <h3>二、 退費與補償原則</h3>
        <p>1. <strong>未使用之點數</strong>：若您完成付款後，<strong>完全未進行任何篇章之扣點測算</strong>，且因系統異常或操作失誤欲申請退款，請於購買日起 <strong>7 日內</strong> 來信客服信箱，我們將於核對交易紀錄無誤後，扣除第三方金流手續費後為您辦理退刷或退款。</p>
        <p>2. <strong>已消耗點數或已產出報告</strong>：凡點數業經消耗、報告已產出生成者，視同服務已完整履行，恕無法受理退費。</p>
        <p>3. <strong>系統異常補點</strong>：若因系統網路中斷或伺服器異常導致扣點成功但未能取得報告，系統將自動或由人工客服於 24 小時內補發等額點數。</p>

        <h3>三、 客服聯繫與爭議申訴</h3>
        <p>若您對於訂單、扣款或服務有任何疑問，歡迎隨時透過以下專屬客服管道聯繫我們：</p>
        <ul>
          <li><strong>服務名稱</strong>：問仙壇 · 掌心解碼</li>
          <li><strong>客服電子信箱</strong>：<a href="mailto:service@wen-xian-tan.com" style="color:var(--gold-bright);">service@wen-xian-tan.com</a></li>
          <li><strong>服務時間</strong>：週一至週五 10:00 - 18:00（國定例假日除外）</li>
          <li><strong>回覆時效</strong>：我們將於收到信件後 1 至 2 個工作天內由專人主動為您查核與回覆。</li>
        </ul>
      </div>
    `
  }
};

/**
 * 彈出合規條款視窗
 */
export function showLegalModal(docType) {
  const doc = LEGAL_DOCS[docType] || LEGAL_DOCS.terms;
  const backdrop = document.getElementById('readingModalBackdrop');
  const card = document.getElementById('readingModalCard');
  if (!backdrop || !card) return;

  card.innerHTML = `
    <div class="wizard-header" style="border-bottom:1px solid var(--border-gold);padding-bottom:12px;margin-bottom:16px;">
      <div class="wizard-title-row">
        <h3 style="display:flex;align-items:center;gap:8px;color:var(--gold-bright);font-size:1.15rem;">
          <span>📜</span> ${doc.title}
        </h3>
        <button type="button" class="btn btn-outline btn-sm" id="closeLegalModalBtn" style="padding:4px 10px;">✕ 關閉</button>
      </div>
    </div>

    <div style="max-height:60vh;overflow-y:auto;padding-right:8px;color:var(--text-secondary);font-size:0.88rem;line-height:1.7;">
      ${doc.content}
    </div>

    <div style="margin-top:20px;text-align:center;">
      <button type="button" class="btn btn-gold btn-sm" id="confirmReadLegalBtn" style="min-width:140px;">我已瞭解並同意</button>
    </div>
  `;

  const close = () => {
    backdrop.classList.remove('show', 'active');
  };

  card.querySelector('#closeLegalModalBtn')?.addEventListener('click', close);
  card.querySelector('#confirmReadLegalBtn')?.addEventListener('click', close);
  backdrop.classList.add('show', 'active');
}
