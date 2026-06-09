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
  if (plane === "neon" || plane === "mesh" || plane === "admin" || plane === "platform-control") {
    applyTheme(fallbackTheme);
    return;
  }

  var cookie = document.cookie
    .split("; ")
    .find(function (row) {
      return row.indexOf("theme_preset=") === 0;
    });
  if (cookie && applyTheme(decodeURIComponent(cookie.split("=")[1] || ""))) return;

  try {
    if (applyTheme(localStorage.getItem("theme_preset") || "")) return;
  } catch (error) {}

  applyTheme(fallbackTheme);
})();
</script>
