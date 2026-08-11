<#include "_iam-head.ftl">
<script>
(function () {
  var fallbackTheme = "neon-base";
  var allowedThemes = ["neon-base"];

  function applyTheme(value) {
    if (allowedThemes.indexOf(value) === -1) return false;
    document.documentElement.setAttribute("data-theme-preset", value);
    try {
      localStorage.setItem("theme_preset", value);
    } catch (error) {}
    return true;
  }

  var params = new URLSearchParams(window.location.search);
  var plane = params.get("athyper_plane") || params.get("plane");
  var themeApplied = false;
  if (plane === "neon" || plane === "mesh" || plane === "studio" || plane === "platform-control") {
    themeApplied = applyTheme(fallbackTheme);
  }

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

  document.title = "${iamBrowserTitle}";

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".kc-panel-left, .kc-carousel, .kc-dots").forEach(function (node) {
      node.remove();
    });
  }, { once: true });
})();
</script>
