(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SEA_INAPP = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function isInAppBrowser(ua) {
    ua = String(ua || '');
    return /MicroMessenger|\bZalo\b|FBAN|FBAV|Instagram|\bLine\//i.test(ua) ||
      /TikTok|musical_ly|BytedanceWebview/i.test(ua) || /;\s*wv\)/i.test(ua);
  }
  function platform(ua) {
    ua = String(ua || '');
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'ios';
    return 'other';
  }
  function classifyError(e) { var s=String((e&&[e.status,e.code,e.message].filter(Boolean).join(' '))||'').toLowerCase(); if(/429|rate.?limit|too many requests/.test(s))return 'rate'; if(/otp_expired|expired|token has expired/.test(s))return 'expired'; if(/invalid|token|otp/.test(s))return 'wrong'; return 'network'; }
  async function sendCode(client,email) { return client.auth.signInWithOtp({email:email,options:{shouldCreateUser:true}}); }
  async function verifyCode(client,email,token) { return client.auth.verifyOtp({email:email,token:token,type:'email'}); }
  function resendSeconds(deadline,now) { return Math.max(0,Math.ceil((deadline-now)/1000)); }
  var words = {
    zh: ['请在系统浏览器中打开以登录', '复制链接', '已复制', '点右上角 ⋯，选择"在 Safari 中打开"', '在 Chrome 中打开'],
    en: ['Open in your browser to sign in', 'Copy link', 'Copied', 'Tap ⋯ in the top right, then “Open in Safari”', 'Open in Chrome'],
    vi: ['Mở bằng trình duyệt hệ thống để đăng nhập', 'Sao chép liên kết', 'Đã sao chép', 'Nhấn ⋯ ở góc trên bên phải, chọn “Mở trong Safari”', 'Mở bằng Chrome'],
    th: ['เปิดในเบราว์เซอร์ของระบบเพื่อลงชื่อเข้าใช้', 'คัดลอกลิงก์', 'คัดลอกแล้ว', 'แตะ ⋯ มุมขวาบน แล้วเลือก “เปิดใน Safari”', 'เปิดใน Chrome'],
    id: ['Buka di browser sistem untuk masuk', 'Salin tautan', 'Tersalin', 'Ketuk ⋯ di kanan atas, lalu pilih “Buka di Safari”', 'Buka di Chrome']
  };
  function showLoginHelp(lang) {
    var p = platform(navigator.userAgent), w = words[lang] || words.zh;
    var overlay = document.createElement('div'); overlay.className = 'inapp-login-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = '<section class="inapp-login-sheet" role="dialog" aria-modal="true" aria-labelledby="inapp-login-title"><button type="button" class="inapp-login-close" aria-label="Close">×</button><h2 id="inapp-login-title"></h2><button type="button" class="inapp-login-copy"></button>' + (p === 'android' ? '<button type="button" class="inapp-login-chrome"></button>' : '') + (p === 'ios' ? '<p class="inapp-login-hint"></p>' : '') + '</section>';
    var style = document.createElement('style'); style.textContent = '.inapp-login-overlay{position:fixed;inset:0;z-index:10000;background:#0008;display:flex;align-items:flex-end;justify-content:center}.inapp-login-sheet{box-sizing:border-box;width:min(100%,480px);padding:24px 20px calc(24px + env(safe-area-inset-bottom));background:#fff;border-radius:18px 18px 0 0;color:#17212b;box-shadow:0 -8px 32px #0003}.inapp-login-sheet h2{font-size:18px;margin:8px 34px 20px 0}.inapp-login-sheet button:not(.inapp-login-close){display:block;width:100%;min-height:46px;margin-top:10px;border:0;border-radius:10px;background:#176b52;color:white;font:inherit;font-weight:600}.inapp-login-sheet .inapp-login-chrome{background:#eef5f2!important;color:#176b52!important}.inapp-login-close{float:right;border:0;background:none;font-size:28px;color:#52606a}.inapp-login-hint{line-height:1.6;color:#52606a}';
    document.head.appendChild(style); document.body.appendChild(overlay);
    overlay.querySelector('h2').textContent = w[0];
    var copy = overlay.querySelector('.inapp-login-copy'); copy.textContent = w[1];
    var link = location.href;
    function fallbackCopy() {
      var field = document.createElement('textarea'); field.value = link; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select();
      try { document.execCommand('copy'); } catch (e) {} field.remove();
    }
    copy.addEventListener('click', function () {
      var result = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(link) : Promise.reject();
      result.catch(fallbackCopy).finally(function () { copy.textContent = w[2]; });
    });
    var chrome = overlay.querySelector('.inapp-login-chrome');
    if (chrome) { chrome.textContent = w[4]; chrome.addEventListener('click', function () { var u = new URL(link); location.href = 'intent://' + u.host + u.pathname + u.search + u.hash + '#Intent;scheme=https;package=com.android.chrome;end'; }); }
    var hint = overlay.querySelector('.inapp-login-hint'); if (hint) hint.textContent = w[3];
    function dismiss() { overlay.remove(); style.remove(); }
    overlay.querySelector('.inapp-login-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) dismiss(); });
    document.addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); } });
  }
  function showLogin(options) {
    options = options || {}; var lang = options.lang || 'zh', t = function (key) { return window.I18N.t('login.' + key, lang); };
    var inApp = isInAppBrowser(navigator.userAgent), overlay = document.createElement('div'); overlay.className = 'sea-login-overlay';
    overlay.innerHTML = '<section class="sea-login" role="dialog" aria-modal="true"><button class="sea-login-close" type="button">×</button><h2></h2><div class="sea-login-actions"></div><p class="sea-login-message" aria-live="polite"></p></section>';
    var style = document.createElement('style'); style.textContent = '.sea-login-overlay{position:fixed;inset:0;z-index:10001;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.sea-login{box-sizing:border-box;width:min(100%,440px);max-height:90vh;overflow:auto;padding:24px;background:#fff;border-radius:18px;color:#17212b;box-shadow:0 12px 40px #0003}.sea-login h2{font-size:20px;margin:0 36px 20px 0}.sea-login-close{float:right;border:0;background:none;font-size:28px;color:#52606a}.sea-login-actions button,.sea-login-actions input{box-sizing:border-box;display:block;width:100%;min-height:46px;margin:10px 0;padding:10px 12px;border:1px solid #ccd5d1;border-radius:9px;font:inherit}.sea-login-actions button{background:#176b52;color:white;font-weight:600}.sea-login-actions .sea-login-secondary{background:#eef5f2;color:#176b52}.sea-login-message{min-height:1.4em;color:#a33;line-height:1.4}';
    document.head.appendChild(style); document.body.appendChild(overlay);
    var title=overlay.querySelector('h2'), actions=overlay.querySelector('.sea-login-actions'), msg=overlay.querySelector('.sea-login-message');
    function close(){overlay.remove();style.remove();}
    function button(label, secondary, fn){var b=document.createElement('button');b.type='button';b.textContent=label;if(secondary)b.className='sea-login-secondary';b.onclick=fn;actions.appendChild(b);return b;}
    function renderEmail(){actions.innerHTML='';title.textContent=t('title');msg.textContent='';
      if(!options.email){var input=document.createElement('input');input.type='email';input.autocomplete='email';input.placeholder=t('email');input.setAttribute('aria-label',t('email'));actions.appendChild(input);
        button(t('send'),false,async function(){var email=input.value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent=t('invalid');return;} var b=actions.querySelector('button');b.disabled=true;
          try{var sent=await sendCode(options.client,email);if(sent.error)throw sent.error;options.email=email;options.deadline=Date.now()+60000;renderCode();}catch(e){msg.textContent=t(classifyError(e));b.disabled=false;}});
      } else renderCode();
      if(inApp) button(t('googleInApp'),true,async function(){close();await options.google();});
    }
    function renderCode(){actions.innerHTML='';title.textContent=t('codeTitle');var input=document.createElement('input');input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;input.placeholder='••••••';input.setAttribute('aria-label',t('code'));actions.appendChild(input);
      button(t('verify'),false,async function(){var code=input.value.trim();if(!/^\d{6}$/.test(code)){msg.textContent=t('wrong');return;}try{var result=await verifyCode(options.client,options.email,code);if(result.error)throw result.error;close();if(options.success)await options.success(result.data);}catch(e){msg.textContent=t(classifyError(e));}});
      button(t('change'),true,function(){options.email=null;renderEmail();}); var resend=button(t('resend'),true,async function(){if(Date.now()<options.deadline)return;resend.disabled=true;try{var r=await sendCode(options.client,options.email);if(r.error)throw r.error;options.deadline=Date.now()+60000;msg.textContent=t('sent');tick();}catch(e){msg.textContent=t(classifyError(e));resend.disabled=false;}});
      function tick(){var left=resendSeconds(options.deadline,Date.now());resend.textContent=left?t('resendWait').replace('{n}',left):t('resend');resend.disabled=left>0;if(left)setTimeout(tick,1000);} tick();
    }
    function renderChoice(){actions.innerHTML='';title.textContent=t('title');msg.textContent='';
      if(inApp){button(t('email'),false,renderEmail);button(t('googleInApp'),true,async function(){close();await options.google();});}
      else{button(t('google'),false,async function(){close();await options.google();});button(t('email'),true,renderEmail);}}
    overlay.querySelector('.sea-login-close').onclick=close;overlay.addEventListener('click',function(e){if(e.target===overlay)close();});renderChoice();
    return overlay;
  }
  return { isInAppBrowser: isInAppBrowser, platform: platform, showLoginHelp: showLoginHelp, showLogin: showLogin, sendCode:sendCode, verifyCode:verifyCode, classifyError:classifyError, resendSeconds:resendSeconds };
});
