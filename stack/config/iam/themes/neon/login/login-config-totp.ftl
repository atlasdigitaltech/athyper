<#-- =======================================================================
     Neon Keycloak Login Theme — login-config-totp.ftl
     Mobile Authenticator (TOTP) Setup page — matches login.ftl split-panel layout.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle(msg("loginTotpTitle"))}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <#include "_theme-resolver.ftl">
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
<div class="iam-shell kc-page" data-plane="${iamPlane}">

  <!-- -- Left branding panel -- -->
  <div class="kc-panel-left">

    <#include "_neon-brand-logo.ftl">
    <div class="kc-carousel" id="kc-carousel">
      <div class="kc-slide active"><p class="kc-slide-ws">Finance</p><h3>Master Every Dollar.<br>Command Every Decision.</h3><p class="kc-slide-desc">Unify accounting, payments, cash flow, budgets, and digital transactions into a single financial command center.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Supply Chain</p><h3>Orchestrate<br>Complexity.</h3><p class="kc-slide-desc">Command sourcing, procurement, inventory, warehousing, logistics, and supplier performance through one intelligent backbone.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Commercial</p><h3>Turn Every Conversation<br>into Revenue.</h3><p class="kc-slide-desc">Capture, nurture, and convert demand with a seamlessly connected engine across customer engagement, sales, and order execution.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">People</p><h3>Empower Every Person.<br>Elevate the Organization.</h3><p class="kc-slide-desc">Fuel the full workforce lifecycle with intelligent HR and payroll capabilities that keep talent engaged, aligned, and compliant.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Projects &amp; Services</p><h3>Deliver Brilliance.<br>Control Every Cost.</h3><p class="kc-slide-desc">Manage projects, service workflows, budgets, and revenue-linked execution all in one command center.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Operations</p><h3>Run Without<br>Interruption.</h3><p class="kc-slide-desc">Power production and maintenance with intelligent tools that maximize uptime, sharpen planning, and drive operational excellence.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Assets &amp; Facilities</p><h3>Maximize What<br>You Own.</h3><p class="kc-slide-desc">Command fixed assets, property portfolios, leases, facilities, and spaces with lifecycle visibility and bulletproof accountability.</p></div>
    </div>
    <div class="kc-dots" id="kc-dots">
      <button class="kc-dot active" aria-label="Slide 1"></button>
      <button class="kc-dot" aria-label="Slide 2"></button>
      <button class="kc-dot" aria-label="Slide 3"></button>
      <button class="kc-dot" aria-label="Slide 4"></button>
      <button class="kc-dot" aria-label="Slide 5"></button>
      <button class="kc-dot" aria-label="Slide 6"></button>
      <button class="kc-dot" aria-label="Slide 7"></button>
    </div>
  </div>

    </div>
  </div>

  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
    <div class="kc-form-card">

        <#include "_neon-brand-mobile.ftl">

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

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

    <div class="kc-footer">
      <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
    </div>
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
<script>
(function () {
  var slides = document.querySelectorAll('#kc-carousel .kc-slide');
  var dots   = document.querySelectorAll('#kc-dots .kc-dot');
  var current = 0;
  function show(n) {
    slides[current].classList.remove('active'); dots[current].classList.remove('active');
    current = n % slides.length;
    slides[current].classList.add('active'); dots[current].classList.add('active');
  }
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      show(i); clearInterval(timer);
      timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
    });
  });
  var timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
})();
</script>
</body>
</html>
