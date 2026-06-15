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
