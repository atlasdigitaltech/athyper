<#-- =======================================================================
     Neon Keycloak Login Theme — error.ftl
     Styled error page matching the Neon split-panel layout.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Error — ${realm.displayName!'Neon'}</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','vintage-paper','mono','cosmic-night','soft-pop','brutalist','tangerine','modern-minimal','bubblegum','violet-bloom','doom-64'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
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

  <!-- ── Right error panel ── -->
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
        <h2>${msg("errorTitle")!'An error occurred'}</h2>
      </div>

      <!-- Error message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-error">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Back to login -->
      <#if client?? && client.baseUrl?has_content>
        <div style="margin-top:1.5rem;">
          <a class="kc-btn kc-btn-primary" href="${client.baseUrl}" style="display:block;text-align:center;text-decoration:none;">
            ${msg("backToApplication")!'Back to Application'}
          </a>
        </div>
      <#elseif url.loginUrl?has_content>
        <div style="margin-top:1.5rem;">
          <a class="kc-btn kc-btn-primary" href="${url.loginUrl}" style="display:block;text-align:center;text-decoration:none;">
            ${msg("backToLogin")!'Back to Login'}
          </a>
        </div>
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
