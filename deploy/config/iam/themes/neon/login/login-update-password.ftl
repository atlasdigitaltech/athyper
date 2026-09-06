<#-- =======================================================================
     Neon Keycloak Login Theme — login-update-password.ftl
     Required action: UPDATE_PASSWORD (set new password after reset link).
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Set new password")}</title>
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
        <h2>Set a new password</h2>
        <p>Your new password must be at least 8 characters long.</p>
      </div>

      <!-- Alert message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Password form -->
      <form class="kc-form" action="${url.loginAction}" method="post">

        <!-- New password -->
        <div class="kc-field">
          <label for="password-new">New password</label>
          <div class="kc-input-wrap">
            <input
              id="password-new"
              name="password-new"
              type="password"
              autocomplete="new-password"
              autofocus
              aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
            />
            <button type="button" class="kc-password-toggle" onclick="togglePassword('password-new','eye-new')" aria-label="Toggle password visibility">
              <svg id="eye-new" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <#if messagesPerField.existsError('password')>
            <span class="kc-field-error">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
          </#if>
        </div>

        <!-- Confirm password -->
        <div class="kc-field">
          <label for="password-confirm">Confirm new password</label>
          <div class="kc-input-wrap">
            <input
              id="password-confirm"
              name="password-confirm"
              type="password"
              autocomplete="new-password"
              aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
            />
            <button type="button" class="kc-password-toggle" onclick="togglePassword('password-confirm','eye-confirm')" aria-label="Toggle password visibility">
              <svg id="eye-confirm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <#if messagesPerField.existsError('password-confirm')>
            <span class="kc-field-error">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
          </#if>
        </div>

        <!-- Sign out other devices -->
        <#if logout_sessions?? && logout_sessions == "true">
        <label class="kc-checkbox">
          <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked />
          Sign out of all other devices
        </label>
        </#if>

        <input type="hidden" id="id-hidden-input" name="credentialId"
          <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />

        <button class="kc-btn kc-btn-primary" type="submit">
          <!-- Lock icon -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true" style="margin-right:0.4rem;vertical-align:-2px">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Save new password
        </button>

      </form>

      <!-- Password strength hints -->
      <div class="kc-info-note">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
        Use a mix of uppercase, lowercase, numbers, and symbols for a stronger password.
      </div>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">
  <#include "_iam-story.ftl">

</div><!-- /.kc-page -->
<script>
function togglePassword(inputId, iconId) {
  var input = document.getElementById(inputId);
  var icon  = document.getElementById(iconId);
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  }
}
</script>
</body>
</html>
