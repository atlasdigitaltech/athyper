<#-- =======================================================================
     Neon Keycloak Login Theme — login.ftl
     Split-panel layout matching the Neon app login page (60 / 40).
     Left  : Neon SVG logo + auto-advancing workspace marketing carousel.
     Right : Welcome back / Sign in to your account + auth form + pinned footer.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("loginTitle", realm.displayName)}</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','atlas-vintage','neon-mono','mesh-night','athyper-pop','atlas-neo','neon-tangerine','neon-modern','athyper-bubble','mesh-bloom','atlas-doom'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="kc-page">

  <!-- ── Left branding panel ── -->
  <div class="kc-panel-left">

    <!-- Neon SVG wordmark — mirrors apps/web login page exactly.
         Coordinate notes (viewBox 0 0 900 210):
           Icon group : translate(40,35) scale(0.65)
           "neon"     : font-size=150, baseline y=192
                        x-height top y=114  (150 × 0.52 = 78 px above baseline)
           Separator  : y1=114 to y2=192  (neon visual height)
           Tagline baselines:
             Business  y=132  (cap-top 132-18=114, aligns neon x-height top)
             Operating y=162  (centered, 30 px gap)
             Platform  y=192  (aligns neon baseline)
    -->

    <#include "_neon-brand-logo.ftl">

    <!-- Marketing carousel — 7 workspace slides, auto-advances every 5 s -->
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

    </div><!-- /.kc-carousel -->

    <!-- Dot indicators -->
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

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">

    <!-- Centered form area (flex-1 pushes footer to bottom) -->
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

        <#include "_neon-brand-mobile.ftl">

        <#-- Username chip: shown when user already entered username -->
        <#if auth?? && auth.attemptedUsername?has_content>
        <div class="kc-username-chip">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
          <span>${auth.attemptedUsername}</span>
          <a href="${url.loginRestartFlowUrl}" class="kc-chip-restart" title="Sign in as someone else">&#10005;</a>
        </div>
        </#if>

        <!-- Header -->
        <div class="kc-header">
          <h2>Welcome back</h2>
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

          <#-- Hide username when already entered (username-first or post-org-selection) -->
          <#if !(auth?? && auth.attemptedUsername?has_content)>
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

    <!-- Footer — pinned to bottom of right panel -->
    <div class="kc-footer">
      <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
    </div>

  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->

<!-- Carousel auto-advance script -->
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

</body>
</html>
