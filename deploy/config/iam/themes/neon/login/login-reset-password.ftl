<#-- =======================================================================
     Neon Keycloak Login Theme — login-reset-password.ftl
     Forgot password / password reset email entry page.
     Left panel mirrors login.ftl exactly (neon logo + carousel).
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle(msg("emailForgotTitle"))}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <link rel="shortcut icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
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
          <h2>${msg("emailForgotTitle")}</h2>
          <p>Enter the email address linked to your account and we'll send you a password reset link.</p>
        </div>

        <!-- Alert message -->
        <#if message?has_content>
          <div class="kc-alert kc-alert-${message.type}">
            ${kcSanitize(message.summary)?no_esc}
          </div>
        </#if>

        <!-- Email form -->
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
              value="${(auth.attemptedUsername!'')}"
              autocomplete="email"
              autofocus
            />
          </div>

          <div class="kc-reset-actions">
            <button class="kc-btn kc-btn-primary" type="submit">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              ${msg("emailForgotTitle")}
            </button>
            <a class="kc-link kc-back-link" href="${url.loginUrl}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
              ${msg("backToLogin")}
            </a>
          </div>
        </form>

        <!-- Info note -->
        <div class="kc-info-note">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          The reset link expires in 15 minutes. Check your spam folder if you don't see it.
        </div>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">
  <#include "_iam-story.ftl">

</div><!-- /.kc-page -->
</body>
</html>
