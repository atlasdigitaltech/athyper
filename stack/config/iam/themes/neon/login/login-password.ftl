<#-- =======================================================================
     Neon Keycloak Login Theme — login-password.ftl
     Password step (KC 26.x username-first browser flow step 2).
     Left panel mirrors login.ftl exactly (neon logo + carousel).
     ======================================================================= -->
<#include "_iam-context.ftl">
<#include "_identity-field.ftl">
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
          <#assign _verifiedDisplayName = "">
          <#if iamPresentationDisplayName?? && iamPresentationDisplayName?trim?has_content>
            <#assign _verifiedDisplayName = iamPresentationDisplayName?trim>
          <#elseif user??>
            <#assign _verifiedDisplayName = ((user.firstName!"") + " " + (user.lastName!""))?trim>
          </#if>
          <@iamGreeting verifiedName=_verifiedDisplayName />
          <p>Sign in to your account</p>
        </div>

        <!-- Alert -->
        <#if message?? && message?has_content>
          <div class="kc-alert kc-alert-${message.type!'info'}">
            ${kcSanitize(message.summary)?no_esc}
          </div>
        </#if>

        <!-- Password form -->
        <form class="kc-form" action="${url.loginAction}" method="post">
          <#if auth?? && auth.attemptedUsername?has_content>
            <@iamLockedIdentity username=auth.attemptedUsername />
          </#if>
          <div class="kc-field">
            <label for="password">${msg("password")}</label>
            <div class="kc-field-password">
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                autofocus
              />
              <button type="button" class="kc-pwd-toggle" aria-label="Toggle password visibility"
                onclick="var i=document.getElementById('password');i.type=i.type==='password'?'text':'password';this.classList.toggle('revealed');">
                <svg class="eye-show" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                <svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
              </button>
            </div>
          </div>

          <#if realm.rememberMe && !usernameEditDisabled??>
          <div class="kc-form-row">
            <label class="kc-checkbox">
              <input type="checkbox" name="rememberMe" <#if login.rememberMe??>checked</#if> />
              <span>${msg("rememberMe")}</span>
            </label>
            <#if realm.resetPasswordAllowed>
              <a class="kc-forgot kc-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
            </#if>
          </div>
          <#elseif realm.resetPasswordAllowed>
          <div class="kc-form-row kc-form-row-end">
            <a class="kc-forgot kc-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
          </div>
          </#if>

          <div>
            <button class="kc-btn kc-btn-primary" type="submit">${msg("doLogIn")}</button>
          </div>
        </form>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->

<#include "_change-user-script.ftl">
</body>
</html>
