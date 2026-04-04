<#-- =======================================================================
     Neon Keycloak Login Theme — info.ftl
     Generic info/success page (e.g. "Your account has been updated").
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("infoTitle")!realm.displayName}</title>
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
        <h1>All done</h1>
        <p>Your account has been updated</p>
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

      <!-- Success icon -->
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:var(--muted);">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <path d="m9 11 3 3L22 4"/>
          </svg>
        </div>
      </div>

      <!-- Header -->
      <div class="kc-header">
        <h2>${msg("infoTitle")!"Account updated"}</h2>
        <#if message?has_content>
          <p>${kcSanitize(message.summary)?no_esc}</p>
        </#if>
      </div>

      <!-- Redirect or back to login -->
      <#if actionUri?has_content>
        <a class="kc-btn kc-btn-primary" href="${actionUri}" style="display:block;text-align:center;text-decoration:none;">
          ${msg("proceedWithAction")!"Continue"}
        </a>
      <#elseif client?? && client.baseUrl?has_content>
        <a class="kc-btn kc-btn-primary" href="${client.baseUrl}" style="display:block;text-align:center;text-decoration:none;">
          ${msg("backToApplication")!"Back to Application"}
        </a>
      <#else>
        <a class="kc-btn kc-btn-primary" href="${properties.kcLoginLink!url.loginUrl}" style="display:block;text-align:center;text-decoration:none;">
          ${msg("backToLogin")!"Back to Login"}
        </a>
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
