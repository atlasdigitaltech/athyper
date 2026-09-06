<#-- =======================================================================
     Neon Keycloak Login Theme — select-organization.ftl
     Organization selection step (KC 26.x multi-org login flow).
     Rendered when a user belongs to more than one organization.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Select Organization")}</title>
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

      <!-- Attempted username chip -->
      <#if auth?? && auth.attemptedUsername?has_content>
      <div class="kc-username-chip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
        <span>${auth.attemptedUsername}</span>
        <a href="${url.loginRestartFlowUrl}" class="kc-chip-restart" data-kc-change-user title="Use another user ID">Change</a>
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

    </div><!-- /.kc-form-card -->
  </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->
<#include "_change-user-script.ftl">
</body>
</html>
