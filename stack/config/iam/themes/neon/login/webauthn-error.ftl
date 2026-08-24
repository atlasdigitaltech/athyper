<#-- Neon Theme — webauthn-error.ftl -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${iamTitle("Security Key Error")}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/athyper-favicon.png" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css"/>
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">
        <div style="display:flex;justify-content:center;margin-bottom:1.25rem;">
          <div style="width:3rem;height:3rem;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        </div>
        <div class="kc-header">
          <h2>Registration Failed</h2>
          <p>There was a problem registering your security key.</p>
        </div>
        <#if message?? && message?has_content>
          <div class="kc-alert kc-alert-error">${kcSanitize(message.summary)?no_esc}</div>
        </#if>
        <script type="text/javascript">
          function refreshPage() {
            document.getElementById('isSetRetry').value = 'retry';
            document.getElementById('executionValue').value = '${execution!''}';
            document.getElementById('kc-error-form').requestSubmit();
          }
        </script>
        <form id="kc-error-form" action="${url.loginAction}" method="post" style="display:none;">
          <input type="hidden" id="executionValue" name="authenticationExecution"/>
          <input type="hidden" id="isSetRetry" name="isSetRetry"/>
        </form>
        <div style="display:flex;flex-direction:column;gap:0.625rem;margin-top:1.5rem;">
          <button onclick="refreshPage()" class="kc-btn kc-btn-primary" type="button">Try Again</button>
          <#if isAppInitiatedAction??>
          <form action="${url.loginAction}" method="post">
            <button type="submit" name="cancel-aia" value="true" class="kc-btn" style="width:100%;">Cancel</button>
          </form>
          </#if>
        </div>
      </div>
    </div>
  </div>
  <#include "_footer.ftl">
</div>
</body>
</html>
