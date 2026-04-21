<#-- Neon Theme — webauthn-error.ftl -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Security Key Error — Neon</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico"/>
  <script>(function(){var t=['default','atlas-vintage','neon-mono','mesh-night','athyper-pop','atlas-neo','neon-tangerine','neon-modern','athyper-bubble','mesh-bloom','atlas-doom'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css"/>
</head>
<body>
<div class="kc-page">
  <div class="kc-panel-left">
    <#include "_neon-brand-logo.ftl">
    <div class="kc-carousel">
      <div class="kc-slide active">
        <p class="kc-slide-ws">Security</p>
        <h3>Protect Every<br>Access Point.</h3>
        <p class="kc-slide-desc">Hardware security keys and passkeys provide phishing-resistant authentication — the strongest second factor available.</p>
      </div>
    </div>
    <div class="kc-dots"><button class="kc-dot active"></button></div>
  </div>
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">
        <#include "_neon-brand-mobile.ftl">
        <div style="display:flex;justify-content:center;margin-bottom:1.25rem;">
          <div style="width:3rem;height:3rem;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        </div>
        <div class="kc-header">
          <h2>Registration Failed</h2>
          <p>There was a problem registering your security key.</p>
        </div>
        <#if message?? && message?has_content>
          <div class="kc-alert kc-alert-error">${kcSanitize(message.summary)?no_esc}</div>
        </#if>
        <script type="text/javascript">
          function refreshPage() {
            document.getElementById('isSetRetry').value = 'retry';
            document.getElementById('executionValue').value = '${execution!''}';
            document.getElementById('kc-error-form').requestSubmit();
          }
        </script>
        <form id="kc-error-form" action="${url.loginAction}" method="post" style="display:none;">
          <input type="hidden" id="executionValue" name="authenticationExecution"/>
          <input type="hidden" id="isSetRetry" name="isSetRetry"/>
        </form>
        <div style="display:flex;flex-direction:column;gap:0.625rem;margin-top:1.5rem;">
          <button onclick="refreshPage()" class="kc-btn kc-btn-primary" type="button">Try Again</button>
          <#if isAppInitiatedAction??>
          <form action="${url.loginAction}" method="post">
            <button type="submit" name="cancel-aia" value="true" class="kc-btn" style="width:100%;">Cancel</button>
          </form>
          </#if>
        </div>
      </div>
    </div>
    <div class="kc-footer"><p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p></div>
  </div>
</div>
</body>
</html>
