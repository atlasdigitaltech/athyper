<#-- =======================================================================
     Neon Keycloak Login Theme — login-config-totp.ftl
     Mobile Authenticator (TOTP) Setup page — matches login.ftl split-panel layout.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("loginTotpTitle")}</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','vintage-paper','mono','cosmic-night','soft-pop','brutalist','tangerine','modern-minimal','bubblegum','violet-bloom','doom-64'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
  <style>
    .kc-totp-qr {
      display: flex;
      justify-content: center;
    }
    .kc-totp-qr img {
      width: 160px;
      height: 160px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.5rem;
      background: var(--input-bg);
    }
    .kc-totp-secret {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .kc-totp-secret-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--muted-fg);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kc-totp-secret-value {
      font-size: 0.8125rem;
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
      color: var(--fg);
      background: oklch(0.975 0 0);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.5rem 0.75rem;
      word-break: break-all;
      letter-spacing: 0.05em;
    }
    .kc-totp-apps {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .kc-totp-apps-label {
      font-size: 0.8125rem;
      color: var(--muted-fg);
    }
    .kc-totp-apps ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: oklch(0.975 0 0);
    }
    .kc-totp-apps li {
      font-size: 0.875rem;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .kc-totp-apps li::before {
      content: '';
      width: 0.3125rem;
      height: 0.3125rem;
      border-radius: 50%;
      background: var(--muted-fg);
      flex-shrink: 0;
    }
    .kc-totp-step {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .kc-totp-step-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .kc-totp-step-num {
      width: 1.375rem;
      height: 1.375rem;
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-fg);
      font-size: 0.75rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kc-scan-manually {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 0.2em;
      font-family: inherit;
    }
    .kc-scan-manually:hover { color: var(--fg); }
    #kc-totp-secret-key { display: none; }
    .kc-device-name { display: flex; flex-direction: column; gap: 0.375rem; }
  </style>
</head>
<body>
<div class="kc-page">

  <!-- ── Left branding panel ── -->
  <div class="kc-panel-left">
    <div class="brand-inner">
      <svg class="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
      </svg>
      <div>
        <h1>Welcome</h1>
        <p>Sign in to continue to Neon</p>
      </div>
    </div>
  </div>

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">
    <div class="kc-form-card">

      <!-- Mobile logo (hidden on lg+) -->
      <div class="kc-mobile-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
        </svg>
        <span>Neon</span>
      </div>

      <!-- Header -->
      <div class="kc-header">
        <h2>${msg("loginTotpTitle")}</h2>
        <p>${msg("loginTotpStep1")}</p>
      </div>

      <!-- Alert -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form class="kc-form" action="${url.loginAction}" method="post">

        <!-- Step 1 — Install app -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">1</span>
            ${msg("loginTotpStep1")}
          </div>
          <div class="kc-totp-apps">
            <ul>
              <#list totp.supportedApplications as app>
                <li>${msg(app)}</li>
              </#list>
            </ul>
          </div>
        </div>

        <!-- Step 2 — Scan QR -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">2</span>
            ${msg("loginTotpStep2")}
          </div>
          <div class="kc-totp-qr">
            <img src="data:image/png;base64,${totp.totpSecretQrCode}" alt="${msg("loginTotpUnableToScan")}" />
          </div>
          <div style="text-align:center;">
            <button type="button" class="kc-scan-manually" onclick="toggleSecret()">
              ${msg("loginTotpUnableToScan")}
            </button>
          </div>
          <div id="kc-totp-secret-key" class="kc-totp-secret">
            <span class="kc-totp-secret-label">${msg("loginTotpManualStep2")}</span>
            <span class="kc-totp-secret-value">${totp.totpSecretEncoded}</span>
          </div>
        </div>

        <!-- Step 3 — Enter OTP -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">3</span>
            ${msg("loginTotpStep3")}
          </div>

          <div class="kc-field">
            <label for="totp">${msg("authenticatorCode")} <span style="color:var(--destructive)">*</span></label>
            <input
              id="totp"
              name="totp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              autofocus
              pattern="[0-9]*"
              maxlength="8"
            />
          </div>

          <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
          <#if mode??>
            <input type="hidden" id="mode" name="mode" value="${mode}" />
          </#if>

          <input type="hidden" id="userLabel" name="userLabel" value="My Authenticator" />
        </div>

        <!-- Submit -->
        <div>
          <button class="kc-btn kc-btn-primary" type="submit">${msg("doSubmit")}</button>
        </div>

      </form>

      <!-- Footer -->
      <div class="kc-footer">
        <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
      </div>

    </div><!-- /.kc-form-card -->
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->

<script>
function toggleSecret() {
  var el = document.getElementById('kc-totp-secret-key');
  var btn = event.target;
  if (el.style.display === 'none' || el.style.display === '') {
    el.style.display = 'flex';
    btn.textContent = '${msg("loginTotpScanBarcode")?js_string}';
  } else {
    el.style.display = 'none';
    btn.textContent = '${msg("loginTotpUnableToScan")?js_string}';
  }
}
</script>
</body>
</html>
