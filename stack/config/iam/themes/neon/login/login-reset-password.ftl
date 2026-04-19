<#-- =======================================================================
     Neon Keycloak Login Theme — login-reset-password.ftl
     Forgot password / password reset email entry page.
     Left panel mirrors login.ftl exactly (neon logo + carousel).
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${msg("emailForgotTitle")} — ${realm.displayName}</title>
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <script>(function(){var t=['default','atlas-vintage','neon-mono','mesh-night','athyper-pop','atlas-neo','neon-tangerine','neon-modern','athyper-bubble','mesh-bloom','atlas-doom'];function apply(v){if(v&&t.indexOf(v)!==-1){document.documentElement.setAttribute('data-theme-preset',v);try{localStorage.setItem('theme_preset',v);}catch(e){}return true;}return false;}var p=document.cookie.split('; ').find(function(r){return r.startsWith('theme_preset=');});if(p&&apply(decodeURIComponent(p.split('=')[1])))return;if(apply('${locale!""}'))return;if(apply(new URLSearchParams(window.location.search).get('kc_locale')||''))return;try{apply(localStorage.getItem('theme_preset')||'');}catch(e){}})();</script>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="kc-page">

  <!-- ── Left branding panel ── -->
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

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">


        <#include "_neon-brand-mobile.ftl">

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
              ← ${msg("backToLogin")}
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
</body>
</html>
