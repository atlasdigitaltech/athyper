<#-- =======================================================================
     Neon Keycloak Login Theme — login.ftl
     Split-panel layout matching the Neon app login page (60 / 40).
     Left  : Neon SVG logo + auto-advancing workspace marketing carousel.
     Right : Welcome back / Sign in to your account + auth form + pinned footer.
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
  <title>${iamTitle(msg("loginTitle", realm.displayName))}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">

    <!-- Centered form area (flex-1 pushes footer to bottom) -->
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

        <!-- Header -->
        <div class="kc-header">
          <@iamGreeting verifiedName=(iamPresentationDisplayName!'') />
          <p>Sign in to your account</p>
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

          <#-- Keep one labelled identity row in both editable and locked modes. -->
          <#if auth?? && auth.attemptedUsername?has_content>
            <@iamLockedIdentity username=auth.attemptedUsername />
          <#else>
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
          </#if>

          <!-- Password -->
          <div class="kc-field">
            <label for="password">${msg("password")}</label>
            <div class="kc-field-password">
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                <#if auth?? && auth.attemptedUsername?has_content>autofocus</#if>
              />
              <button type="button" class="kc-pwd-toggle" aria-label="Toggle password visibility"
                onclick="var i=document.getElementById('password');i.type=i.type==='password'?'text':'password';this.classList.toggle('revealed');">
                <svg class="eye-show" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                <svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
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
              <a class="kc-forgot kc-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
            </#if>
          </div>
          </#if>

          <!-- Submit -->
          <div>
            <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth?? && auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />
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

<#include "_change-user-script.ftl">

</body>
</html>
