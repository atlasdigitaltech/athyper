<#-- =======================================================================
     Neon Keycloak Login Theme — error.ftl
     Styled error page matching the Neon split-panel layout.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Error")}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <link rel="shortcut icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <!-- -- Right error panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

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

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->
</body>
</html>
