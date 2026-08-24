<#-- =======================================================================
     Neon Keycloak Login Theme â€” login-oauth-grant.ftl
     OAuth consent page for Keycloak 26.x.
     NOTE: In KC 26.x `oauth` is a plain string â€” do NOT access oauth.client.*
     The form only needs url.loginAction + accept/cancel buttons.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Grant Access")}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <!-- â”€â”€ Left branding panel â”€â”€ -->
  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

      <!-- Header -->
      <div class="kc-header">
        <h2>Grant Access</h2>
        <p>This application is requesting access to your account. Do you want to grant access?</p>
      </div>

      <!-- Alert -->
      <#if message?? && message?has_content>
        <div class="kc-alert kc-alert-${message.type!'info'}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Grant form: accept/cancel are handled by Keycloak. -->
      <form class="kc-form kc-grant-form" action="${url.oauthAction}" method="POST">
        <#if clientData?? && clientData?has_content>
          <input type="hidden" name="client_data" value="${clientData}" />
        </#if>
        <div class="kc-grant-actions">
          <button class="kc-btn kc-btn-primary" type="submit" name="accept" value="accept">
            Yes, grant access
          </button>
          <button class="kc-btn kc-btn-ghost" type="submit" name="cancel" value="cancel">
            No, cancel
          </button>
        </div>
      </form>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->
</body>
</html>
