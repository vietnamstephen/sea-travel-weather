(function () {
  'use strict';
  var C = window.SEA_CONFIG || {}, P = C.PADDLE || {}, api = window.SEA_PAYMENTS;
  var page = document.body.getAttribute('data-page'), main = document.getElementById('main');
  var subscription = null, refreshVersion = 0;
  var session = null, entitlement = null, loading = C.PAYMENTS_ENABLED && page === 'pricing';
  function t(key) { return window.I18N.t(key, (window.SEA_APP || {}).lang || 'zh'); }
  function e(value) { return window.SEA_RISK.esc(value == null ? '' : value); }
  function links() { return '<div class="payment-links"><a href="terms.html">' + e(t('legal.terms')) + '</a><a href="privacy.html">' + e(t('legal.privacy')) + '</a><a href="terms.html#refund">' + e(t('legal.refund')) + '</a></div>'; }
  function render() {
    if (!main) return;
    // On pricing, reserve the current-plan label for the matching plan card.
    if (page === 'pricing') {
      var accountLink = document.querySelector('#account-menu a[href="pricing.html"]');
      if (accountLink) accountLink.textContent = t('pricing.title');
    }
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
    var admin = entitlement && entitlement.effective_role === 'admin';
    var vip = entitlement && entitlement.is_vip;
    if (admin || vip) {
      var status = admin ? t('pricing.adminStatus') : window.SEA_ACCOUNT.statusText(entitlement, subscription);
      html += '<div class="panel payment-status"><b>' + e(status) + '</b></div>';
    }
    function checkout(key) {
      var current = !admin && subscription && subscription.price_id && P.prices[key].priceId === subscription.price_id &&
        (/^(active|trialing|past_due)$/.test(subscription.status) || key === 'pass7' && vip);
      var disabled = loading || admin || vip || current;
      var noteId = 'payment-note-' + key;
      return '<button type="button" class="pill payment-buy" data-plan="' + e(key) + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') + (admin ? ' aria-describedby="' + noteId + '"' : '') + '>' +
        e(t(loading ? 'trips.loading' : current ? 'pricing.current' : session ? 'pricing.upgrade' : 'pricing.login')) + '</button>' +
        (admin ? '<p class="payment-plan-note" id="' + noteId + '">' + e(t('pricing.adminNote')) + '</p>' : '');
    }
    function price(key) {
      var plan = P.prices[key];
      return '<div class="payment-price">' + e(plan.display) + ' <small>/ ' + e(t('pricing.' + plan.period)) + '</small></div>';
    }
    html += '<div class="payment-plans" id="plans"><section class="panel payment-plan payment-free"><h2>' + e(t('pricing.free')) + '</h2><ul class="payment-features">' + ['weatherOnly', 'risk', 'savedTrips'].map(function (key) { return '<li>' + e(t('pricing.' + key)) + '</li>'; }).join('') + '</ul><a class="pill" href="trips.html">' + e(t('trips.google')) + '</a></section>';
    ['monthly', 'yearly'].forEach(function (key) {
      html += '<section class="panel payment-plan' + (key === 'yearly' ? ' featured' : '') + '"><div class="payment-plan-heading"><h2>' + e(t('pricing.' + key)) + '</h2>' + (key === 'yearly' ? '<span class="payment-badge">' + e(t('pricing.recommended')) + '</span>' : '') + '</div>' + price(key);
      var monthly = P.prices.monthly, yearly = P.prices.yearly, baseline = monthly.amount * 12;
      if (key === 'yearly' && monthly.currency === yearly.currency && baseline > yearly.amount && yearly.amount >= 0) {
        var locale = (window.SEA_APP || {}).lang || 'zh';
        var saving = new Intl.NumberFormat(locale, { style: 'currency', currency: yearly.currency }).format(baseline - yearly.amount);
        var percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format((baseline - yearly.amount) / baseline);
        html += '<p class="payment-saving">' + e(t('pricing.savings').replace('{amount}', saving).replace('{percent}', percent)) + '</p>';
      }
      html += '<p>' + e(t('pricing.recurring')) + '</p>' + checkout(key) + '</section>';
    });
    html += '<section class="panel payment-plan payment-pass"><h2>' + e(t('pricing.pass7')) + '</h2><p>' + e(t('pricing.oneTime')) + '</p>' + price('pass7') + checkout('pass7') + '</section></div>';
    html += '<section class="panel payment-comparison"><table class="payment-table"><thead><tr><th scope="col">' + e(t('pricing.feature')) + '</th><th scope="col">' + e(t('pricing.free')) + '</th><th scope="col">VIP</th></tr></thead><tbody>';
    ['weatherOnly', 'risk', 'savedTrips', 'flightStatus', 'suggestions'].forEach(function (key, index) {
      html += '<tr><th scope="row">' + e(t('pricing.' + key)) + '</th><td>' + (index < 3 ? '✓' : '—') + '</td><td>✓</td></tr>';
    });
    html += '</tbody></table></section><section class="panel payment-faq"><h2>' + e(t('pricing.faq')) + '</h2>';
    ['cancel', 'methods', 'refund'].forEach(function (key) {
      html += '<details><summary>' + e(t('pricing.' + key + 'Q')) + '</summary><p>' + (key === 'refund' ? '<a href="terms.html#refund">' + e(t('legal.refund')) + '</a>' : e(t('pricing.' + key + 'A'))) + '</p></details>';
    });
    main.innerHTML = html + '</section><button type="button" class="pill" data-payment-refresh>' + e(t('pricing.refresh')) + '</button>' + links();
  }
  async function refresh() {
    var version = ++refreshVersion;
    loading = true; entitlement = null; subscription = null;
    window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: null }));
    render();
    try {
      var db = await api.client(), auth = await db.auth.getSession();
      if (auth.error) throw auth.error;
      var nextSession = auth.data.session, nextEntitlement = await api.entitlement(), nextSubscription = null;
      if (nextSession && api.visible(nextEntitlement) && nextEntitlement.effective_role !== 'admin') {
        var rows = await db.from('subscriptions').select('plan,price_id,status,current_period_end,cancel_at').order('last_event_at',{ascending:false,nullsFirst:false}).limit(1);
        if (!rows.error) nextSubscription = (rows.data || [])[0] || null;
      }
      if (version !== refreshVersion) return;
      session = nextSession; entitlement = nextEntitlement; subscription = nextSubscription; window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: entitlement })); loading = false; render();
    } catch (err) { if (version !== refreshVersion) return; loading = false; render(); var host = document.getElementById('payments-message'); if (host) host.textContent = t('pricing.error'); }
  }
  main.addEventListener('click', function (event) {
    var button = event.target.closest('[data-plan]');
    if (button && !button.disabled) api.openCheckout(button.getAttribute('data-plan'));
    if (event.target.closest('[data-payment-refresh]')) refresh();
  });
  window.addEventListener('sea:updated', render);
  window.addEventListener('sea:account', render);
  if (C.PAYMENTS_ENABLED && page === 'pricing') {
    window.addEventListener('sea:entitlement', function (event) { entitlement = event.detail; window.dispatchEvent(new CustomEvent('sea:payments-visibility', { detail: entitlement })); render(); });
    api.client().then(function (db) {
      db.auth.onAuthStateChange(function () { setTimeout(refresh, 0); });
      refresh();
    }).catch(function () { loading = false; render(); var host = document.getElementById('payments-message'); if (host) host.textContent = t('pricing.error'); });
  }
  render();
})();
