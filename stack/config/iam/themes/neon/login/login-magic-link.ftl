<#-- =======================================================================
     Neon Keycloak Login Theme — login-magic-link.ftl
     Magic link / passwordless email sign-in entry page.
     Used by the keycloak-magic-link authenticator extension:
       https://github.com/p2-inc/keycloak-magic-link
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Sign in with Magic Link")}</title>
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

      <!-- Magic link badge -->
      <div style="text-align:center;">
        <span class="kc-magic-badge">
          <!-- Zap icon -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
          </svg>
          Magic Link — Passwordless
        </span>
      </div>

      <!-- Header -->
      <div class="kc-header">
        <h2>Sign in without a password</h2>
        <p>Enter your email address and we'll send you a one-click sign-in link. It expires in 15 minutes.</p>
      </div>

      <!-- Alert message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- -- Show "check your email" state after submission -- -->
      <#if actionUri??>
        <!-- Form has been submitted — show confirmation -->
        <div class="kc-magic-sent">
          <div class="kc-magic-sent-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32" aria-hidden="true">
              <rect width="20" height="16" x="2" y="4" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
          <p class="kc-magic-sent-title">Check your inbox</p>
          <p class="kc-magic-sent-body">
            We sent a sign-in link to your email address.
            Click it to sign in — the link is valid for <strong>15 minutes</strong>
            and can only be used once.
          </p>
          <p class="kc-magic-sent-tip">
            Didn't receive it? Check your spam folder, or
            <a class="kc-link" href="${url.loginUrl}">try again</a>.
          </p>
        </div>
      <#else>
        <!-- -- Email entry form -- -->
        <form class="kc-form" action="${url.loginAction}" method="post">
          <div class="kc-field">
            <label for="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              value="${(login.username!'')}"
              autocomplete="email"
              placeholder="you@example.com"
              autofocus
              required
            />
          </div>

          <div class="kc-reset-actions">
            <button class="kc-btn kc-btn-primary" type="submit">
              <!-- Envelope icon -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true" style="margin-right:0.4rem;vertical-align:-2px">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              Send sign-in link
            </button>
          </div>
        </form>
      </#if>

      <!-- Divider -->
      <div class="kc-or-divider">or</div>

      <!-- Back to password sign-in -->
      <a class="kc-btn kc-btn-ghost" href="${url.loginUrl}" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:0.4rem;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        Sign in with password instead
      </a>

      <!-- Security note -->
      <div class="kc-info-note">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Links are single-use and expire in 15 minutes. Never share your sign-in link with anyone.
      </div>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->
</body>
</html>
