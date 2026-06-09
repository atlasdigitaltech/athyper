<#-- =======================================================================
     Neon Keycloak Login Theme — login-magic-link.ftl
     Magic link / passwordless email sign-in entry page.
     Used by the keycloak-magic-link authenticator extension:
       https://github.com/p2-inc/keycloak-magic-link
     Matches the split-panel layout of login.ftl.
     ======================================================================= -->
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Sign in with Magic Link — ${realm.displayName}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/neon-icon.svg" />
  <link rel="shortcut icon" href="${url.resourcesPath}/img/favicon.ico" />
  <#include "_theme-resolver.ftl">
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

      <!-- ── Show "check your email" state after submission ── -->
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
        <!-- ── Email entry form ── -->
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

    <div class="kc-footer">
      <p>&copy; ${.now?string("yyyy")} athyper. All rights reserved.</p>
    </div>
  </div><!-- /.kc-panel-right -->

</div><!-- /.kc-page -->
<style>
/* Magic link sent confirmation state */
.kc-magic-sent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  padding: 1.5rem;
  background: oklch(0.975 0 0);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.kc-magic-sent-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--fg);
}
.kc-magic-sent-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--fg);
  margin: 0;
}
.kc-magic-sent-body {
  font-size: 0.875rem;
  color: var(--muted-fg);
  line-height: 1.6;
  margin: 0;
}
.kc-magic-sent-tip {
  font-size: 0.8125rem;
  color: var(--muted-fg);
  margin: 0;
}
</style>
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
