<#-- =======================================================================
     Neon Keycloak Login Theme — login.ftl
     Split-panel layout matching the Neon app login page.
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

      <#-- Username chip: shown when user already entered username (org-selection step or username-first flow) -->
      <#if auth?? && auth.attemptedUsername?has_content>
      <div class="kc-username-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
        <span>${auth.attemptedUsername}</span>
        <a href="${url.loginRestartFlowUrl}" class="kc-chip-restart" title="Sign in as someone else">&#10005;</a>
      </div>
      </#if>

      <!-- Header -->
      <div class="kc-header">
        <#if auth?? && auth.attemptedUsername?has_content>
          <h2>Enter your password</h2>
          <p>Sign in with your identity provider. Your workspace will be determined after sign-in.</p>
        <#else>
          <h2>Sign in</h2>
          <p>Sign in with your identity provider. Your workspace will be determined after sign-in.</p>
        </#if>
      </div>

      <!-- Alert message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Login form -->
      <#if realm.password>
      <form class="kc-form" action="${url.loginAction}" method="post">

        <#-- Hide the username field when the user already entered it (username-first or post-org-selection).
             auth.attemptedUsername is set by KC after the login-username or org-selection step.
             When hidden, the username is carried forward by KC's auth session state. -->
        <#if !(auth?? && auth.attemptedUsername?has_content)>
        <!-- Username / Email -->
        <#if !usernameEditDisabled?? || !usernameEditDisabled>
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
            value="${(login.username!'')}"
            autocomplete="username"
            autofocus
            <#if usernameEditDisabled?? && usernameEditDisabled>disabled</#if>
          />
        </div>
        </#if>
        </#if>

        <!-- Password -->
        <div class="kc-field">
          <label for="password">${msg("password")}</label>
          <div class="kc-field-password">
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              <#if auth?? && auth.attemptedUsername?has_content>autofocus</#if>
            />
            <button type="button" class="kc-pwd-toggle" aria-label="Toggle password visibility"
              onclick="var i=document.getElementById('password');i.type=i.type==='password'?'text':'password';this.classList.toggle('revealed');">
              <svg class="eye-show" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
              <svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
            </button>
          </div>
        </div>

        <!-- Remember me + Forgot password -->
        <#if realm.rememberMe || realm.resetPasswordAllowed>
        <div class="kc-form-row">
          <#if realm.rememberMe>
            <label class="kc-checkbox">
              <input type="checkbox" name="rememberMe" <#if login.rememberMe??>checked</#if> />
              ${msg("rememberMe")}
            </label>
          <#else>
            <span></span>
          </#if>

          <#if realm.resetPasswordAllowed>
            <a class="kc-forgot" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
          </#if>
        </div>
        </#if>

        <!-- Submit -->
        <div>
          <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth?? && auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />
          <button class="kc-btn kc-btn-primary" type="submit">${msg("doLogIn")}</button>
        </div>

      </form>
      </#if>


      <!-- Register link -->
      <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
        <p class="kc-register">
          ${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a>
        </p>
      </#if>

      <!-- Footer -->
      <div class="kc-footer">
        <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
      </div>

    </div><!-- /.kc-form-card -->
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->
</body>
</html>
