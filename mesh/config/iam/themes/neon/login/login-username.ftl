<#-- =======================================================================
     Neon Keycloak Login Theme — login-username.ftl
     Username-first step (KC 26.x browser flow step 1).
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Sign in</title>
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

      <!-- Mobile logo -->
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

      <!-- Alert -->
      <#if message?? && message?has_content>
        <div class="kc-alert kc-alert-${message.type!'info'}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Username form -->
      <#if realm.password>
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
            value="${(login.username!'')}"
            autocomplete="username"
            autofocus
          />
        </div>

        <div>
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

    </div>
  </div>

</div>
</body>
</html>
