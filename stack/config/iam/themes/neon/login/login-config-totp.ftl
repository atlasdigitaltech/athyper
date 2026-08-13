<#-- =======================================================================
     Neon Keycloak Login Theme - login-config-totp.ftl
     Mobile Authenticator (TOTP) Setup page - matches login.ftl split-panel layout.
     ======================================================================= -->
<#include "_iam-context.ftl">
<!DOCTYPE html>
<html lang="${locale!'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${iamTitle(msg("loginTotpTitle"))}</title>
  <link rel="icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
  <link rel="shortcut icon" type="image/png" href="${url.resourcesPath}/img/neon-icon.png" />
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

      <!-- Header -->
      <div class="kc-header">
        <h2>${msg("loginTotpTitle")}</h2>
        <p>${msg("loginTotpStep1")}</p>
      </div>

      <!-- Alert -->
      <#if message?has_content>
        <div class="kc-alert kc-alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <form class="kc-form" action="${url.loginAction}" method="post">

        <!-- Step 1 - Install app -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">1</span>
            ${msg("loginTotpStep1")}
          </div>
          <div class="kc-totp-apps">
            <ul>
              <#list totp.supportedApplications as app>
                <li>${msg(app)}</li>
              </#list>
            </ul>
          </div>
        </div>

        <!-- Step 2 - Scan QR -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">2</span>
            ${msg("loginTotpStep2")}
          </div>
          <div class="kc-totp-qr">
            <img src="data:image/png;base64,${totp.totpSecretQrCode}" alt="${msg("loginTotpUnableToScan")}" />
          </div>
          <div style="text-align:center;">
            <button type="button" class="kc-scan-manually" onclick="toggleSecret(this)">
              ${msg("loginTotpUnableToScan")}
            </button>
          </div>
          <div id="kc-totp-secret-key" class="kc-totp-secret">
            <span class="kc-totp-secret-label">${msg("loginTotpManualStep2")}</span>
            <span class="kc-totp-secret-value">${totp.totpSecretEncoded}</span>
          </div>
        </div>

        <!-- Step 3 - Enter OTP -->
        <div class="kc-totp-step">
          <div class="kc-totp-step-title">
            <span class="kc-totp-step-num">3</span>
            ${msg("loginTotpStep3")}
          </div>

          <div class="kc-field">
            <label for="totp">${msg("authenticatorCode")} <span style="color:var(--destructive)">*</span></label>
            <input
              id="totp"
              name="totp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              autofocus
              pattern="[0-9]*"
              maxlength="8"
            />
          </div>

          <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
          <#if mode??>
            <input type="hidden" id="mode" name="mode" value="${mode}" />
          </#if>

          <input type="hidden" id="userLabel" name="userLabel" value="My Authenticator" />
        </div>

        <!-- Submit -->
        <div>
          <button class="kc-btn kc-btn-primary" type="submit">${msg("doSubmit")}</button>
        </div>

      </form>

      </div><!-- /.kc-form-card -->
    </div><!-- /.kc-form-wrapper -->

  </div><!-- /.kc-panel-right -->
  <#include "_footer.ftl">

</div><!-- /.kc-page -->

<script>
function toggleSecret(btn) {
  var el = document.getElementById('kc-totp-secret-key');
  if (el.style.display === 'none' || el.style.display === '') {
    el.style.display = 'flex';
    btn.textContent = '${msg("loginTotpScanBarcode")?js_string}';
  } else {
    el.style.display = 'none';
    btn.textContent = '${msg("loginTotpUnableToScan")?js_string}';
  }
}
</script>
</body>
</html>
