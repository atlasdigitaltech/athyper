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
      <div class="kc-slide active">
        <p class="kc-slide-ws">Finance</p>
        <h3>Master Every Dollar.<br>Command Every Decision.</h3>
        <p class="kc-slide-desc">Unify accounting, payments, cash flow, budgets, and digital transactions into a single financial command center.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">Supply Chain</p>
        <h3>Orchestrate<br>Complexity.</h3>
        <p class="kc-slide-desc">Command sourcing, procurement, inventory, warehousing, logistics, and supplier performance through one intelligent backbone.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">Commercial</p>
        <h3>Turn Every Conversation<br>into Revenue.</h3>
        <p class="kc-slide-desc">Capture, nurture, and convert demand with a seamlessly connected engine across customer engagement, sales, and order execution.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">People</p>
        <h3>Empower Every Person.<br>Elevate the Organization.</h3>
        <p class="kc-slide-desc">Fuel the full workforce lifecycle with intelligent HR and payroll capabilities that keep talent engaged, aligned, and compliant.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">Projects &amp; Services</p>
        <h3>Deliver Brilliance.<br>Control Every Cost.</h3>
        <p class="kc-slide-desc">Manage projects, service workflows, budgets, and revenue-linked execution — all in one command center.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">Operations</p>
        <h3>Run Without<br>Interruption.</h3>
        <p class="kc-slide-desc">Power production and maintenance with intelligent tools that maximize uptime, sharpen planning, and drive operational excellence.</p>
      </div>
      <div class="kc-slide">
        <p class="kc-slide-ws">Assets &amp; Facilities</p>
        <h3>Maximize What<br>You Own.</h3>
        <p class="kc-slide-desc">Command fixed assets, property portfolios, leases, facilities, and spaces with lifecycle visibility and bulletproof accountability.</p>
      </div>
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
  </div><!-- /.kc-panel-left -->

  <!-- -- Right form panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">


        <#include "_neon-brand-mobile.ftl">

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

    <div class="kc-footer">
      <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
    </div>
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->

<script>
(function () {
  var slides = document.querySelectorAll('#kc-carousel .kc-slide');
  var dots   = document.querySelectorAll('#kc-dots .kc-dot');
  var current = 0;
  function show(n) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = n % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      show(i);
      clearInterval(timer);
      timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
    });
  });
  var timer = setInterval(function () { show((current + 1) % slides.length); }, 5000);
})();
</script>
<#include "_change-user-script.ftl">
</body>
</html>
