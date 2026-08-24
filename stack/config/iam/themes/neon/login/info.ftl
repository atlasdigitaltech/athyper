<#-- =======================================================================
     Neon Keycloak Login Theme — info.ftl
     Generic info/success page (e.g. "Your account has been updated").
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle(msg("infoTitle"))}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

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

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->
</body>
</html>
