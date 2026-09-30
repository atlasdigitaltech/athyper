<#-- Browser-local greeting shared by IAM pages. A pre-authentication name is
     accepted only from the Athyper Keycloak authenticator after it consumes
     and validates the one-time server-side presentation context. Never derive
     a person's name from login_hint or an untrusted query parameter. -->
<#macro iamGreeting verifiedName="">
  <#local displayName = verifiedName?trim>
  <h2 data-iam-greeting<#if displayName?has_content> data-verified-name="${displayName}"</#if>>Welcome back<#if displayName?has_content>, ${displayName}</#if></h2>
  <script>
  (function () {
    var heading = document.currentScript && document.currentScript.previousElementSibling;
    if (!heading || !heading.hasAttribute('data-iam-greeting')) return;

    var hour = new Date().getHours();
    var greeting = hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : 'Good evening';
    var verifiedName = (heading.getAttribute('data-verified-name') || '').trim();

    heading.textContent = verifiedName ? greeting + ', ' + verifiedName : greeting;
  })();
  </script>
</#macro>
