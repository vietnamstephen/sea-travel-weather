(function () {
  'use strict';
  var C = window.SEA_CONFIG || {}, P = C.PADDLE || {}, api = window.SEA_PAYMENTS;
  var page = document.body.getAttribute('data-page'), main = document.getElementById('main');
  var selectedPlan = 'yearly';
  var session = null, entitlement = null, loading = C.PAYMENTS_ENABLED && page === 'pricing';
  function t(key) { return window.I18N.t(key, (window.SEA_APP || {}).lang || 'zh'); }
  function e(value) { return window.SEA_RISK.esc(value == null ? '' : value); }
  function date(value) { return new Date(value).toLocaleDateString((window.SEA_APP || {}).lang === 'zh' ? 'zh-CN' : (window.SEA_APP || {}).lang); }
  function links() { return '<div class="payment-links"><a href="terms.html">' + e(t('legal.terms')) + '</a><a href="privacy.html">' + e(t('legal.privacy')) + '</a><a href="terms.html#refund">' + e(t('legal.refund')) + '</a></div>'; }
  function render() {
    if (!main) return;
    var html = '<div class="section-head"><h1>' + e(t(page === 'pricing' ? 'pricing.headline' : 'legal.' + page)) + '</h1></div>';
    if (page !== 'pricing') {
      html += '<div class="notice warn">' + e(t('legal.draft')) + '</div><article class="panel payment-legal">';
      if (page === 'terms') html += '<p>Draft service terms / 服务条款草稿：Weather and travel risk information is advisory. Verify conditions and flight changes with official sources before travel. Availability and accuracy are not guaranteed. 天气与出行风险仅供参考，请以官方信息为准。</p><p>Paddle is the Merchant of Record for VIP purchases and handles checkout, taxes, billing and payment receipts. Recurring plans renew automatically unless canceled through the Paddle customer portal linked in your receipt. Access continues through the paid period. A 7-day pass does not renew. Paddle 为名义商户，负责结账、税费、账单与收据；订阅可在收据中的客户门户取消。</p>';
      else html += '<p>Draft privacy policy / 隐私政策草稿：We collect your Google login email and account identifier, saved trips (origin, destination, date, flight number and notes), and payment identifiers / subscription status. Supabase hosts account and trip data. Only enter information needed for your trip. 我们收集 Google 登录邮箱、用户标识、保存的行程和付款标识及会员状态；Supabase 托管这些数据。</p><p>Paddle handles payment details as Merchant of Record; this site does not receive or store full card details. Google handles login authentication. Weather and flight requests may be sent to data providers. Paddle 作为名义商户处理支付，本网站不接收或存储完整银行卡资料。Google 负责登录认证。</p><p>To request access, correction or deletion of your account data, contact vietnamstephen@gmail.com. Billing records may need to be retained for accounting or legal obligations. 数据查阅、更正、删除请联系 vietnamstephen@gmail.com；账务资料可能依法保留。</p>';
      html += '<h2 id="refund">' + e(t('legal.refund')) + '</h2><p>DRAFT, pending review: a refund may be requested within 14 days of the first purchase via Paddle as Merchant of Record. The 7-day pass is non-refundable after first use, subject to applicable mandatory consumer rights. Contact support through your Paddle receipt or vietnamstephen@gmail.com with the transaction ID. Approved refunds revoke related VIP access immediately. 草稿待审：首次购买后 14 天内可通过名义商户 Paddle 申请退款；7 天通行证首次使用后原则上不退（强制消费者权利除外）。请通过 Paddle 收据或上述邮箱联系，提供交易号。批准退款后相关 VIP 权限立即终止。</p><p>These drafts must be reviewed before live sales. 上线真实支付前须完成审核。</p></article>';
      main.innerHTML = html + links(); return;
    }
    if (!api.visible(entitlement)) { main.innerHTML = '<div class="panel"><p>' + e(t('pricing.unavailable')) + '</p><a href="trips.html">' + e(t('nav.trips')) + '</a></div>'; return; }
    if (P.environment === 'sandbox') html += '<div class="notice warn">' + e(t('pricing.sandbox')) + '</div>';
    html += '<p id="payments-message" role="status" aria-live="polite"></p>';
    if (entitlement && entitlement.is_vip) {
      html += '<div class="panel"><b>' + e(t('pricing.current')) + (entitlement.plan ? ' · ' + e(t('pricing.' + entitlement.plan)) : '') + '</b><p>' + e(t(entitlement.vip_until ? 'pricing.until' : 'pricing.unlimited')) + (entitlement.vip_until ? ' ' + e(date(entitlement.vip_until)) : '') + '</p>';
      if (entitlement.cancel_at) html += '<p>' + e(t('pricing.cancelAt')) + ' ' + e(date(entitlement.cancel_at)) + '</p>';
      html += '</div>';
    }
    function checkout(key) {
      return '<button type="button" class="pill payment-buy" data-plan="' + e(key) + '"' + (loading || entitlement && entitlement.is_vip ? ' disabled' : '') + '>' + e(t(loading ? 'trips.loading' : entitlement && entitlement.is_vip ? 'pricing.current' : session ? 'pricing.upgrade' : 'pricing.login')) + '</button>';
    }
    function price(key) {
      var plan = P.prices[key];
      return '<div class="payment-price">' + e(plan.display) + ' <small>/ ' + e(t('pricing.' + plan.period)) + '</small></div>';
    }
    html += '<div class="payment-plans" id="plans"><section class="panel payment-plan payment-free"><h2>' + e(t('pricing.free')) + '</h2><ul class="payment-features">' + ['weatherOnly', 'risk', 'savedTrips'].map(function (key) { return '<li>' + e(t('pricing.' + key)) + '</li>'; }).join('') + '</ul><a class="pill" href="trips.html">' + e(t('trips.google')) + '</a></section>';
    html += '<section class="panel payment-plan featured"><div class="payment-plan-heading"><h2>VIP</h2><span class="payment-badge">' + e(t('pricing.recommended')) + '</span></div><div class="payment-toggle" role="group" aria-label="' + e(t('pricing.feature')) + '">';
    ['monthly', 'yearly'].forEach(function (key) {
      html += '<button type="button" class="pill" data-billing="' + key + '" aria-pressed="' + (selectedPlan === key) + '">' + e(t('pricing.' + key)) + '</button>';
    });
    html += '</div>' + price(selectedPlan);
    var monthly = P.prices.monthly, yearly = P.prices.yearly, baseline = monthly.amount * 12;
    if (selectedPlan === 'yearly' && monthly.currency === yearly.currency && baseline > yearly.amount && yearly.amount >= 0) {
      var locale = (window.SEA_APP || {}).lang || 'zh';
      var saving = new Intl.NumberFormat(locale, { style: 'currency', currency: yearly.currency }).format(baseline - yearly.amount);
      var percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format((baseline - yearly.amount) / baseline);
      html += '<p class="payment-saving">' + e(t('pricing.savings').replace('{amount}', saving).replace('{percent}', percent)) + '</p>';
    }
    html += '<p>' + e(t('pricing.recurring')) + '</p>' + checkout(selectedPlan) + '</section></div>';
    html += '<section class="panel payment-pass"><div><h2>' + e(t('pricing.pass7')) + '</h2><p>' + e(t('pricing.oneTime')) + '</p></div>' + price('pass7') + checkout('pass7') + '</section>';
    html += '<section class="panel payment-comparison"><table class="payment-table"><thead><tr><th scope="col">' + e(t('pricing.feature')) + '</th><th scope="col">' + e(t('pricing.free')) + '</th><th scope="col">VIP</th></tr></thead><tbody>';
    ['weatherOnly', 'risk', 'savedTrips', 'flightStatus', 'suggestions'].forEach(function (key, index) {
      html += '<tr><th scope="row">' + e(t('pricing.' + key)) + '</th><td>' + (index < 3 ? '✓' : '—') + '</td><td>✓</td></tr>';
    });
    html += '</tbody></table></section><section class="panel payment-faq"><h2>' + e(t('pricing.faq')) + '</h2>';
    ['cancel', 'methods', 'refund'].forEach(function (key) {
      html += '<details><summary>' + e(t('pricing.' + key + 'Q')) + '</summary><p>' + (key === 'refund' ? '<a href="terms.html#refund">' + e(t('legal.refund')) + '</a>' : e(t('pricing.' + key + 'A'))) + '</p></details>';
    });
    main.innerHTML = html + '</section><section class="panel payment-cta"><h2>' + e(t('pricing.cta')) + '</h2>' + checkout(selectedPlan) + '</section><button type="button" class="pill" data-payment-refresh>' + e(t('pricing.refresh')) + '</button>' + links();
  }
  async function refresh() {
    entitlement = null;
    window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: null }));
    render();
    try {
      var db = await api.client(), auth = await db.auth.getSession();
      if (auth.error) throw auth.error;
      session = auth.data.session; entitlement = await api.entitlement(); window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: entitlement })); loading = false; render();
    } catch (err) { loading = false; render(); var host = document.getElementById('payments-message'); if (host) host.textContent = t('pricing.error'); }
  }
  main.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-billing]');
    if (toggle) { selectedPlan = toggle.getAttribute('data-billing'); render(); main.querySelector('[data-billing="' + selectedPlan + '"]').focus(); }
    var button = event.target.closest('[data-plan]');
    if (button && !button.disabled) api.openCheckout(button.getAttribute('data-plan'));
    if (event.target.closest('[data-payment-refresh]')) refresh();
  });
  window.addEventListener('sea:updated', render);
  if (C.PAYMENTS_ENABLED && page === 'pricing') {
    window.addEventListener('sea:entitlement', function (event) { entitlement = event.detail; window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: entitlement })); render(); });
    api.client().then(function (db) {
      db.auth.onAuthStateChange(function () { setTimeout(refresh, 0); });
      refresh();
    }).catch(function () { loading = false; render(); var host = document.getElementById('payments-message'); if (host) host.textContent = t('pricing.error'); });
  }
  render();
})();
