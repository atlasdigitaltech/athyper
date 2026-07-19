<script>
(function () {
  function decodeBase64UrlJson(value) {
    if (!value) return null;
    var normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    try {
      var decoded = atob(normalized);
      try {
        return JSON.parse(decodeURIComponent(Array.prototype.map.call(decoded, function (char) {
          return '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2);
        }).join('')));
      } catch (err) {
        return JSON.parse(decoded);
      }
    } catch (err) {
      return null;
    }
  }

  function redirectUriFromCurrentUrl() {
    var params = new URLSearchParams(window.location.search);
    var direct = params.get('redirect_uri');
    if (direct) return direct;
    var clientData = decodeBase64UrlJson(params.get('client_data'));
    return clientData && typeof clientData.ru === 'string' ? clientData.ru : null;
  }

  function appChangeUserUrl() {
    var redirectUri = redirectUriFromCurrentUrl();
    if (!redirectUri) return null;
    try {
      var callbackUrl = new URL(redirectUri);
      var target = new URL('/login', callbackUrl.origin);
      target.searchParams.set('change_user', '1');
      return target.toString();
    } catch (err) {
      return null;
    }
  }

  var href = appChangeUserUrl();
  if (!href) return;
  document.querySelectorAll('[data-kc-change-user]').forEach(function (link) {
    link.href = href;
  });
})();
</script>

<#-- Promote an application-provided login_hint into the same identity chip
     used after the username-first Keycloak step. The username input remains
     in the form, hidden, so the server still receives the submitted identity. -->
<script>
(function () {
  function applicationLoginHint() {
    return new URLSearchParams(window.location.search).get('login_hint');
  }

  function resolveChangeUserUrl() {
    var params = new URLSearchParams(window.location.search);
    var redirectUri = params.get('redirect_uri');
    if (!redirectUri) return '${url.loginRestartFlowUrl?js_string}';
    try {
      var callbackUrl = new URL(redirectUri);
      var target = new URL('/login', callbackUrl.origin);
      target.searchParams.set('change_user', '1');
      return target.toString();
    } catch (err) {
      return '${url.loginRestartFlowUrl?js_string}';
    }
  }

  function promoteLoginHint() {
    var username = document.getElementById('username');
    var password = document.getElementById('password');
    if (!password) return;

    var passwordField = password.closest('.kc-field');
    if (!passwordField) return;

    var existingChip = document.querySelector('.kc-username-chip');
    if (existingChip) {
      var existingField = existingChip.closest('.kc-identity-field') || existingChip;
      passwordField.parentNode.insertBefore(existingField, passwordField);
      return;
    }

    var loginHint = applicationLoginHint();
    if (!loginHint || !username) return;

    var usernameField = username.closest('.kc-field');
    if (!usernameField) return;

    var identityValue = username.value.trim() || loginHint;
    username.type = 'hidden';
    username.value = identityValue;
    username.removeAttribute('autofocus');
    usernameField.classList.add('kc-identity-field', 'kc-identity-field-locked');

    var label = usernameField.querySelector('label');
    if (label) {
      label.classList.add('kc-field-label');
      label.removeAttribute('for');
      label.id = 'kc-identity-label';
    }

    var chip = document.createElement('div');
    chip.className = 'kc-username-chip';
    chip.setAttribute('role', 'group');
    if (label) chip.setAttribute('aria-labelledby', label.id);

    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    var head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', '12');
    head.setAttribute('cy', '8');
    head.setAttribute('r', '5');
    var shoulders = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shoulders.setAttribute('d', 'M20 21a8 8 0 1 0-16 0');
    icon.appendChild(head);
    icon.appendChild(shoulders);

    var identity = document.createElement('span');
    identity.className = 'kc-identity-value';
    identity.textContent = identityValue;

    var change = document.createElement('a');
    change.className = 'kc-chip-restart';
    change.href = resolveChangeUserUrl();
    change.textContent = 'Change';
    change.title = 'Use another user ID';
    change.setAttribute('data-kc-change-user', '');

    chip.appendChild(icon);
    chip.appendChild(identity);
    chip.appendChild(change);
    usernameField.appendChild(chip);
    passwordField.parentNode.insertBefore(usernameField, passwordField);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', promoteLoginHint, { once: true });
  } else {
    promoteLoginHint();
  }
})();
</script>
