<#-- Generated from the canonical plane brand packages. -->
<#-- DO NOT EDIT DIRECTLY - run: pnpm brand:refresh -->
<div class="kc-brand-logo">
  <#assign iamBrandPlane = (iamPlane!"athyper")>
  <#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "admin">
    <#assign iamBrandPlane = "admin">
  </#if>
  <img src="${url.resourcesPath}/img/${iamBrandPlane}-wordmark-black.png" alt="${iamProductName!"Athyper"}" />
</div>
