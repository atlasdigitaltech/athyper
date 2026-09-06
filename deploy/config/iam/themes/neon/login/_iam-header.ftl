<#assign iamBrandPlane = (iamPlane!"athyper")>
<#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "studio">
  <#assign iamBrandPlane = "studio">
</#if>

<#-- Decorative product story. It is deliberately outside the authentication
     landmark and never contains account, tenant, or transaction data. -->
<aside class="kc-story-panel" aria-label="${iamProductName!"Athyper"} — ${iamDescriptor!"Business Technology Platform"}">
  <div class="kc-story-copy">
    <p class="kc-story-eyebrow">${iamDescriptor!"Business Technology Platform"}</p>
    <h1>${iamStoryHeading!"Build and manage Athyper."}</h1>
    <p>${iamStoryCopy!"Manage access, settings, data, and platform operations."}</p>
  </div>
  <#if iamPlane == "mesh">
    <canvas id="kc-story-network-canvas" class="kc-story-network-canvas" aria-hidden="true"></canvas>
    <script src="${url.resourcesPath}/js/world-network-motif.js"></script>
  <#else>
    <svg class="kc-story-art" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="athyper-wave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--a-story-wave)" stop-opacity="0" />
          <stop offset="0.28" stop-color="var(--a-story-wave)" stop-opacity="0.75" />
          <stop offset="0.72" stop-color="var(--a-story-wave-bright)" stop-opacity="0.95" />
          <stop offset="1" stop-color="var(--a-story-wave)" stop-opacity="0.12" />
        </linearGradient>
      </defs>
      <g class="kc-story-wave-lines" fill="none" stroke="url(#athyper-wave)" stroke-width="2">
        <path d="M-40 285 C180 285 235 120 430 270 S720 430 910 220 S1110 170 1240 280" />
        <path d="M-40 300 C190 300 245 145 440 282 S725 415 920 232 S1115 190 1240 292" />
        <path d="M-40 315 C200 315 255 170 450 294 S730 400 930 244 S1120 210 1240 304" />
        <path d="M-40 330 C210 330 265 195 460 306 S735 385 940 256 S1125 230 1240 316" />
        <path d="M-40 345 C220 345 275 220 470 318 S740 370 950 268 S1130 250 1240 328" />
        <path d="M-40 360 C230 360 285 245 480 330 S745 355 960 280 S1135 270 1240 340" />
      </g>
    </svg>
  </#if>
  <p class="kc-story-plane">${iamProductName!"Athyper"} <span>${iamDescriptor!"Business Technology Platform"}</span></p>
</aside>

<#-- Region one of the task panel: exact client-derived plane identity. -->
<header class="kc-page-header">
  <img class="kc-plane-wordmark" src="${url.resourcesPath}/img/${iamBrandPlane}-advertising.svg" alt="Athyper ${iamProductName!"Studio"}" />
</header>
