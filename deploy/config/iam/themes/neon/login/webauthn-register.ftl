<#-- =======================================================================
     Neon Keycloak Theme — webauthn-register.ftl
     Uses KC's own webauthn-register.js for correct WebAuthn handling.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle("Register Security Key")}</title>
  <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <link rel="shortcut icon" type="image/svg+xml" href="${url.resourcesPath}/img/athyper-favicon.svg" />
  <#include "_theme-resolver.ftl">
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css" />
</head>
<body>
<div class="iam-shell kc-page" data-plane="${iamPlane}">
  <#include "_iam-header.ftl">

  <!-- -- Right panel -- -->
  <div class="kc-panel-right">
    <div class="kc-form-wrapper">
      <div class="kc-form-card">

        <div style="display:flex;justify-content:center;margin-bottom:1.25rem;">
          <div style="width:3rem;height:3rem;border-radius:50%;background:var(--color-primary,#18181b);display:flex;align-items:center;justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
        </div>

        <div class="kc-header">
          <h2>Register Security Key</h2>
          <p>Use a hardware key, Face ID, Touch ID, or Windows Hello as your second factor.</p>
        </div>

        <#if message?? && message?has_content>
          <div class="kc-alert kc-alert-${message.type!'info'}">
            ${kcSanitize(message.summary)?no_esc}
          </div>
        </#if>

        <!-- KC standard webauthn form — field names/ids must match KC expectations -->
        <form id="register" action="${url.loginAction}" method="post">
          <input type="hidden" id="clientDataJSON"        name="clientDataJSON"/>
          <input type="hidden" id="attestationObject"     name="attestationObject"/>
          <input type="hidden" id="publicKeyCredentialId" name="publicKeyCredentialId"/>
          <input type="hidden" id="authenticatorLabel"    name="authenticatorLabel"/>
          <input type="hidden" id="transports"            name="transports"/>
          <input type="hidden" id="error"                 name="error"/>

          <div class="kc-field" style="margin-bottom:1rem;">
            <label for="kc-device-label">Device label <span style="font-weight:400;opacity:0.55;">(optional)</span></label>
            <input id="kc-device-label" type="text" autocomplete="off"
                   placeholder="e.g. Work Laptop, YubiKey 5"
                   style="margin-top:0.35rem;"
                   oninput="document.getElementById('authenticatorLabel').value=this.value"/>
          </div>

          <div style="margin-bottom:1.25rem;">
            <label class="kc-checkbox">
              <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on"/>
              <span>Sign out from other devices</span>
            </label>
          </div>

          <div style="display:flex;flex-direction:column;gap:0.625rem;">
            <button class="kc-btn kc-btn-primary" type="button" id="registerWebAuthn">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:0.4rem;vertical-align:-2px;"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Register
            </button>
            <a href="${url.loginRestartFlowUrl}" class="kc-btn" style="text-align:center;text-decoration:none;">Cancel</a>
          </div>
        </form>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->
  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">
  <#include "_iam-story.ftl">

</div><!-- /.kc-page -->

<script type="module">
  <#outputformat "JavaScript">
  import { registerByWebAuthn } from "${url.resourcesPath}/js/webauthnRegister.js";
  const btn = document.getElementById('registerWebAuthn');
  btn.addEventListener('click', function() {
    btn.disabled = true;
    btn.textContent = 'Waiting for device…';
    const input = {
      challenge:                      ${challenge?c},
      userid:                         ${userid?c},
      username:                       ${username?c},
      signatureAlgorithms:            [<#list signatureAlgorithms as alg>${alg?c},</#list>],
      rpEntityName:                   ${rpEntityName?c},
      rpId:                           ${rpId?c},
      attestationConveyancePreference:${attestationConveyancePreference?c},
      authenticatorAttachment:        ${authenticatorAttachment?c},
      requireResidentKey:             ${requireResidentKey?c},
      userVerificationRequirement:    ${userVerificationRequirement?c},
      createTimeout:                  ${createTimeout?c},
      excludeCredentialIds:           ${excludeCredentialIds?c},
      initLabel:                      "Security Key",
      initLabelPrompt:                "Name your security key (optional)"
    };
    registerByWebAuthn(input);
  }, { once: true });
  </#outputformat>
</script>
</body>
</html>
