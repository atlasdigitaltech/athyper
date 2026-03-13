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
  <script>(function(){var t=['default','vintage-paper','mono','cosmic-night','soft-pop','brutalist','tangerine','modern-minimal','bubblegum','violet-bloom','doom-64'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
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

      <!-- Header -->
      <div class="kc-header">
        <h2>Sign in</h2>
        <p>Sign in with your identity provider. Your workspace will be determined after sign-in.</p>
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

        <!-- Password -->
        <div class="kc-field">
          <label for="password">${msg("password")}</label>
          <div class="kc-input-wrap">
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
            />
            <button type="button" class="kc-password-toggle" onclick="togglePassword()" aria-label="Toggle password visibility">
              <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
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
            <a class="kc-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
          </#if>
        </div>
        </#if>

        <!-- Submit -->
        <div>
          <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />
          <button class="kc-btn kc-btn-primary" type="submit">${msg("doLogIn")}</button>
        </div>

      </form>
      </#if>

      <!-- Social / Identity providers -->
      <#if social?? && social.providers?has_content>
        <#if realm.password>
          <div class="kc-divider">${msg("identity-provider-login-label")}</div>
        </#if>
        <div class="kc-social-list">
          <#list social.providers as p>
            <a class="kc-social-btn" href="${p.loginUrl}">
              <#if p.iconClasses?has_content>
                <i class="${p.iconClasses}"></i>
              </#if>
              ${p.displayName}
            </a>
          </#list>
        </div>
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
<script>
function togglePassword() {
  var input = document.getElementById('password');
  var icon  = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  }
}
</script>
</body>
</html>
