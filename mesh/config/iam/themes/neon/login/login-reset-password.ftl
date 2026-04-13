<#-- =======================================================================
     Neon Keycloak Login Theme — login-reset-password.ftl
     Forgot password / password reset email entry page.
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("emailForgotTitle")} — ${realm.displayName}</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','atlas-vintage','neon-mono','mesh-night','athyper-pop','atlas-neo','neon-tangerine','neon-modern','athyper-bubble','mesh-bloom','atlas-doom'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
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
        <h1>Reset Password</h1>
        <p>We'll send a secure link to your inbox</p>
      </div>
    </div>
  </div>

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">
    <div class="kc-form-card">

      <!-- Mobile logo -->
      <div class="kc-mobile-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
        </svg>
        <span>Neon</span>
      </div>

      <!-- Header -->
      <div class="kc-header">
        <h2>${msg("emailForgotTitle")}</h2>
        <p>Enter the email address linked to your account and we'll send you a password reset link.</p>
      </div>

      <!-- Alert message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Email form -->
      <form class="kc-form" action="${url.loginAction}" method="post">
        <div class="kc-field">
          <#if !realm.loginWithEmailAllowed>
            <label for="username">${msg("username")}</label>
          <#elseif !realm.registrationEmailAsUsername>
            <label for="username">${msg("usernameOrEmail")}</label>
          <#else>
            <label for="username">${msg("email")}</label>
          </#if>
          <input
            id="username"
            name="username"
            type="text"
            value="${(auth.attemptedUsername!'')}"
            autocomplete="email"
            autofocus
          />
        </div>

        <div class="kc-reset-actions">
          <button class="kc-btn kc-btn-primary" type="submit">
            <!-- Envelope icon -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true" style="margin-right:0.4rem;vertical-align:-2px">
              <rect width="20" height="16" x="2" y="4" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            ${msg("emailForgotTitle")}
          </button>

          <a class="kc-link kc-back-link" href="${url.loginUrl}">
            ← ${msg("backToLogin")}
          </a>
        </div>
      </form>

      <!-- Info note -->
      <div class="kc-info-note">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
        The reset link expires in 15 minutes. Check your spam folder if you don't see it.
      </div>

      <!-- Footer -->
      <div class="kc-footer">
        <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
      </div>

    </div><!-- /.kc-form-card -->
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->
</body>
</html>
