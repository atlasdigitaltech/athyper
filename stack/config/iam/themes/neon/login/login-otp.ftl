<#-- =======================================================================
     Neon Keycloak Login Theme — login-otp.ftl
     OTP authenticator code entry page — matches login.ftl split-panel layout.
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
          <p>Enter the one-time code from your authenticator app to continue.</p>
        </div>

        <!-- Alert -->
        <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
        </#if>

        <!-- OTP form -->
        <form class="kc-form" action="${url.loginAction}" method="post">

        <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
          <@iamLockedIdentity username=auth.attemptedUsername />
        </#if>

        <!-- OTP device selector (shown when user has multiple OTP devices) -->
        <#if otpLogin.userOtpCredentials?size gt 1>
          <div class="kc-otp-select">
            <label for="selectedCredentialId">${msg("loginOtpOneTime")}</label>
            <select id="selectedCredentialId" name="selectedCredentialId">
              <#list otpLogin.userOtpCredentials as otpCred>
                <option value="${otpCred.id}" <#if otpCred.id == otpLogin.selectedCredentialId>selected</#if>>
                  ${otpCred.userLabel!otpCred.id}
                </option>
              </#list>
            </select>
          </div>
        <#else>
          <input type="hidden" id="selectedCredentialId" name="selectedCredentialId"
            value="<#if otpLogin.userOtpCredentials?size == 1>${otpLogin.userOtpCredentials[0].id}</#if>" />
        </#if>

        <!-- One-time code -->
        <div class="kc-field">
          <label for="otp">${msg("loginOtpOneTime")}</label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            autofocus
            pattern="[0-9]*"
            maxlength="8"
          />
        </div>

        <!-- Submit -->
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
