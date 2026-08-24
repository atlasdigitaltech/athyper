<#-- =======================================================================
     Neon Keycloak Login Theme — login-username.ftl
     Username-first step (KC 26.x browser flow step 1).
     Left panel mirrors login.ftl exactly (neon logo + carousel).
     ======================================================================= -->
<#include "_iam-context.ftl">
<#include "_greeting.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Sign in")}</title>
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

        <!-- Header -->
        <div class="kc-header">
          <@iamGreeting verifiedName=(iamPresentationDisplayName!'') />
          <p>Sign in to your account</p>
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

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->

</body>
</html>
