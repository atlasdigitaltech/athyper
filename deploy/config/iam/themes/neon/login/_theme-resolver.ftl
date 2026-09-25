<#include "_iam-head.ftl">
<script>
(function () {
  var fallbackTheme = "atlas-modern";
  var allowedThemes = ["atlas-modern", "atlas-mono"];
  var resolved = "";

  function applyTheme(value) {
    if (allowedThemes.indexOf(value) === -1) return false;
    resolved = value;
    document.documentElement.setAttribute("data-theme-preset", value);
    document.documentElement.setAttribute("data-theme-family", value);
    try {
      localStorage.setItem("theme_preset", value);
    } catch (error) {}
    return true;
  }

  // Highest priority: the plane app forwards its current design-system choice
  // as a query param on the login redirect (see auth-bff requestThemeFamily),
  // so the login page matches whatever the person just came from.
  var params = new URLSearchParams(window.location.search);
  var themeApplied = applyTheme(params.get("theme_preset") || "");

  if (!themeApplied) {
    var cookie = document.cookie
      .split("; ")
      .find(function (row) {
        return row.indexOf("theme_preset=") === 0;
      });
    if (cookie) themeApplied = applyTheme(decodeURIComponent(cookie.split("=")[1] || ""));
  }

  if (!themeApplied) {
    try {
      themeApplied = applyTheme(localStorage.getItem("theme_preset") || "");
    } catch (error) {}
  }

  if (!themeApplied) applyTheme(fallbackTheme);

  document.documentElement.setAttribute("data-plane", "${iamPlane}");
  document.documentElement.setAttribute("data-athyper-product", "${iamProductName}");

  var themeColors = { "atlas-modern": "#234B84", "atlas-mono": "#1A1A1A" };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta && themeColors[resolved]) meta.setAttribute("content", themeColors[resolved]);

})();
</script>
