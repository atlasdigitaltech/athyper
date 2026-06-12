<#-- =======================================================================
     Neon Keycloak Login Theme — login-otp.ftl
     OTP authenticator code entry page — matches login.ftl split-panel layout.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("loginTitle", realm.displayName)}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/neon-icon.svg" />
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
  <style>
    .kc-otp-user {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.875rem;
      background: oklch(0.975 0 0);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.875rem;
      color: var(--muted-fg);
    }
    .kc-otp-user svg {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
      color: var(--muted-fg);
    }
    .kc-otp-user strong {
      color: var(--fg);
      font-weight: 500;
    }
    .kc-otp-select { display: flex; flex-direction: column; gap: 0.375rem; }
    .kc-otp-select select {
      width: 100%;
      height: 2.5rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--input-bg);
      color: var(--fg);
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      cursor: pointer;
      appearance: auto;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .kc-otp-select select:focus {
      border-color: oklch(0.46 0 0);
      box-shadow: 0 0 0 3px oklch(0.46 0 0 / 0.12);
    }
  </style>
</head>
<body>
<div class="kc-page">

  <!-- ── Left branding panel ── -->
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
  </div><!-- /.kc-panel-left -->

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
    <div class="kc-form-card">

        <#include "_neon-brand-mobile.ftl">

      <!-- Header -->
      <div class="kc-header">
        <h2>${msg("doLogIn")}</h2>
        <p>${msg("loginTotpDescription")}</p>
      </div>

      <!-- Alert -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Signed-in-as indicator -->
      <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
        <div class="kc-otp-user">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <span><strong>${auth.attemptedUsername}</strong></span>
          <a class="kc-link" href="${url.loginRestartFlowUrl}" style="margin-left:auto;">${msg("restartLoginTooltip")}</a>
        </div>
      </#if>

      <!-- OTP form -->
      <form class="kc-form" action="${url.loginAction}" method="post">

        <!-- OTP device selector (shown when user has multiple OTP devices) -->
        <#if otpLogin.userOtpCredentials?size gt 1>
          <div class="kc-otp-select">
            <label for="selectedCredentialId">${msg("loginOtpOneTime")}</label>
            <select id="selectedCredentialId" name="selectedCredentialId">
              <#list otpLogin.userOtpCredentials as otpCred>
                <option value="${otpCred.id}" <#if otpCred.id == otpLogin.selectedCredentialId>selected</#if>>
                  ${otpCred.userLabel!otpCred.id}
                </option>
              </#list>
            </select>
          </div>
        <#else>
          <input type="hidden" id="selectedCredentialId" name="selectedCredentialId"
            value="<#if otpLogin.userOtpCredentials?size == 1>${otpLogin.userOtpCredentials[0].id}</#if>" />
        </#if>

        <!-- One-time code -->
        <div class="kc-field">
          <label for="otp">${msg("loginOtpOneTime")}</label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            autofocus
            pattern="[0-9]*"
            maxlength="8"
          />
        </div>

        <!-- Submit -->
        <div>
          <button class="kc-btn kc-btn-primary" type="submit">${msg("doLogIn")}</button>
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
