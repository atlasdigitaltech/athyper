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
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">

  <!-- -- Left branding panel -- -->
  <div class="kc-panel-left">

    <#include "_neon-brand-logo.ftl">
    <div class="kc-carousel" id="kc-carousel">
      <div class="kc-slide active"><p class="kc-slide-ws">Finance</p><h3>Master Every Dollar.<br>Command Every Decision.</h3><p class="kc-slide-desc">Unify accounting, payments, cash flow, budgets, and digital transactions into a single financial command center.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Supply Chain</p><h3>Orchestrate<br>Complexity.</h3><p class="kc-slide-desc">Command sourcing, procurement, inventory, warehousing, logistics, and supplier performance through one intelligent backbone.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Commercial</p><h3>Turn Every Conversation<br>into Revenue.</h3><p class="kc-slide-desc">Capture, nurture, and convert demand with a seamlessly connected engine across customer engagement, sales, and order execution.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">People</p><h3>Empower Every Person.<br>Elevate the Organization.</h3><p class="kc-slide-desc">Fuel the full workforce lifecycle with intelligent HR and payroll capabilities that keep talent engaged, aligned, and compliant.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Projects &amp; Services</p><h3>Deliver Brilliance.<br>Control Every Cost.</h3><p class="kc-slide-desc">Manage projects, service workflows, budgets, and revenue-linked execution all in one command center.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Operations</p><h3>Run Without<br>Interruption.</h3><p class="kc-slide-desc">Power production and maintenance with intelligent tools that maximize uptime, sharpen planning, and drive operational excellence.</p></div>
      <div class="kc-slide"><p class="kc-slide-ws">Assets &amp; Facilities</p><h3>Maximize What<br>You Own.</h3><p class="kc-slide-desc">Command fixed assets, property portfolios, leases, facilities, and spaces with lifecycle visibility and bulletproof accountability.</p></div>
    </div>
    <div class="kc-dots" id="kc-dots">
      <button class="kc-dot active" aria-label="Slide 1"></button>
      <button class="kc-dot" aria-label="Slide 2"></button>
      <button class="kc-dot" aria-label="Slide 3"></button>
      <button class="kc-dot" aria-label="Slide 4"></button>
      <button class="kc-dot" aria-label="Slide 5"></button>
      <button class="kc-dot" aria-label="Slide 6"></button>
      <button class="kc-dot" aria-label="Slide 7"></button>
    </div>
  </div>

  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
    <div class="kc-form-card">


        <#include "_neon-brand-mobile.ftl">

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

    <div class="kc-footer">
      <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
    </div>
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->
<style>
.kc-field-error {
  font-size: 0.8125rem;
  color: var(--destructive);
  margin-top: 0.25rem;
}
</style>
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
<script>
(function () {
  var slides = document.querySelectorAll('#kc-carousel .kc-slide');
  var dots   = document.querySelectorAll('#kc-dots .kc-dot');
  var current = 0;
  function show(n) {
    slides[current].classList.remove('active'); dots[current].classList.remove('active');
    current = n % slides.length;
    slides[current].classList.add('active'); dots[current].classList.add('active');
  }
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      show(i); clearInterval(timer);
      timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
    });
  });
  var timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
})();
</script>
</body>
</html>
