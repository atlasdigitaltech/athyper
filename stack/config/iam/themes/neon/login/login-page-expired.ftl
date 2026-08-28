<#-- =======================================================================
     Athyper Keycloak Login Theme - login-page-expired.ftl
     Expired authentication-session page using the unified IAM shell.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${lang!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle(msg("pageExpiredTitle"))}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <link rel="shortcut icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">
        <div class="kc-header">
          <h2>${msg("pageExpiredTitle")}</h2>
          <p>${msg("pageExpiredMsg1")}</p>
        </div>

        <div class="kc-info-note" role="status">
          ${msg("pageExpiredMsg2")}
        </div>

        <div class="kc-expired-actions">
          <a id="loginRestartLink" class="kc-btn kc-btn-primary" href="${url.loginRestartFlowUrl}">
            ${msg("restartLoginTooltip")}
          </a>
          <a id="loginContinueLink" class="kc-link kc-expired-continue" href="${url.loginAction}">
            ${msg("doContinue")}
          </a>
        </div>
      </div>
    </div>
  </div>
  <#include "_footer.ftl">
</div>
</body>
</html>
