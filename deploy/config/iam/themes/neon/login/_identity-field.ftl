<#-- Shared locked identity field used after username-first discovery or when
     an application supplies login_hint. Keep its geometry aligned with the
     editable username field so the form does not visually change modes. -->
<#macro iamLockedIdentity username>
  <div class="kc-field kc-identity-field kc-identity-field-locked">
    <span class="kc-field-label" id="kc-identity-label">${msg("usernameOrEmail")}</span>
    <div class="kc-username-chip" role="group" aria-labelledby="kc-identity-label">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
      <span class="kc-identity-value">${username}</span>
      <a href="${url.loginRestartFlowUrl}" class="kc-chip-restart" data-kc-change-user title="Use another user ID">Change</a>
    </div>
  </div>
</#macro>
