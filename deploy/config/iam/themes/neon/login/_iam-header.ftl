<#assign iamBrandPlane = (iamPlane!"athyper")>
<#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "studio">
  <#assign iamBrandPlane = "studio">
</#if>

<#-- Region one of the task panel: exact client-derived plane identity. -->
<header class="kc-page-header">
  <img class="kc-plane-wordmark" src="${url.resourcesPath}/img/${iamBrandPlane}-advertising.svg" alt="Athyper ${iamProductName!"Studio"}" />
</header>
