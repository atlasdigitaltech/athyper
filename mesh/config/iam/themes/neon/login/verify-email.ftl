<#-- =======================================================================
     Neon Keycloak Login Theme — verify-email.ftl
     Email verification page shown after social/email login when VERIFY_EMAIL
     required action is triggered.
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Verify your email — ${realm.displayName}</title>
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

    </div>
  </div>

  <!-- ── Right form panel ── -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
    <div class="kc-form-card">


        <#include "_neon-brand-mobile.ftl">

      <!-- Envelope illustration -->
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:var(--muted);margin-bottom:0.75rem;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
        </div>
      </div>

      <!-- Header -->
      <div class="kc-header">
        <h2>Verify your email</h2>
        <p>
          An email with instructions to verify your address has been sent to
          <#if user?? && user.email?has_content>
            <strong>${user.email}</strong>
          <#else>
            your email address
          </#if>.
        </p>
      </div>

      <!-- Alert message -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Info note -->
      <div class="kc-info-note">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
        Didn't receive the email? Check your spam folder or
        <a class="kc-link" href="${url.loginAction}">click here to resend</a>.
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
