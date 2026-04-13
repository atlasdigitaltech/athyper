<#-- =======================================================================
     Neon Keycloak Login Theme — select-organization.ftl
     Organization selection step (KC 26.x multi-org login flow).
     Rendered when a user belongs to more than one organization.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Select Organization — Neon</title>
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

      <!-- Attempted username chip -->
      <#if auth?? && auth.attemptedUsername?has_content>
      <div class="kc-username-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
        <span>${auth.attemptedUsername}</span>
        <a href="${url.loginRestartFlowUrl}" class="kc-chip-restart" title="Sign in as someone else">&#10005;</a>
      </div>
      </#if>

      <!-- Header -->
      <div class="kc-header">
        <h2>Choose your organization</h2>
        <p>Select the organization you want to sign in to.</p>
      </div>

      <!-- Alert -->
      <#if message?? && message?has_content>
        <div class="kc-alert kc-alert-${message.type!'info'}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <!-- Organization selection form -->
      <form id="kc-org-select-form" action="${url.loginAction}" method="post">
        <input type="hidden" name="kc.org" id="kc-org-input" />

        <div class="kc-org-grid">
          <#list user.organizations as org>
          <button
            type="button"
            class="kc-org-card"
            onclick="document.getElementById('kc-org-input').value='${org.alias}'; document.getElementById('kc-org-select-form').requestSubmit();"
            aria-label="Sign in to ${org.name!org.alias}"
          >
            <div class="kc-org-card-inner">
              <div class="kc-org-avatar">${(org.name!org.alias)[0]?upper_case}</div>
              <div class="kc-org-info">
                <span class="kc-org-name">${org.name!org.alias}</span>
                <#-- Display alias as "tenant:entity" (replace -- with :) for readability -->
                <span class="kc-org-alias">${org.alias?replace("--", ":")}</span>
              </div>
              <svg class="kc-org-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </button>
          </#list>
        </div>
      </form>

      <!-- Footer -->
      <div class="kc-footer">
        <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
        <p><a href="${url.loginRestartFlowUrl}">Sign in as a different user</a></p>
      </div>

    </div>
  </div>

</div>
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
