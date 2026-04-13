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
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','atlas-vintage','neon-mono','mesh-night','athyper-pop','atlas-neo','neon-tangerine','neon-modern','athyper-bubble','mesh-bloom','atlas-doom'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
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

      <!-- Footer -->
      <div class="kc-footer">
        <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
      </div>

    </div><!-- /.kc-form-card -->
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->
</body>
</html>
