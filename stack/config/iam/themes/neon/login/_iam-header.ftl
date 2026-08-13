<header class="kc-page-header">
  <#assign iamBrandPlane = (iamPlane!"athyper")>
  <#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "admin">
    <#assign iamBrandPlane = "admin">
  </#if>
  <img src="${url.resourcesPath}/img/${iamBrandPlane}-wordmark-black.png" alt="${iamProductName!"Athyper"}" />
</header>
