<#-- Shared brand block used by every IAM action page. -->
<header class="iam-brand-header">
  <#if client?? && client.baseUrl?has_content>
    <a class="iam-brand" href="${client.baseUrl}" aria-label="${iamProductName} home">
  <#else>
    <a class="iam-brand" href="${url.loginUrl!"#"}" aria-label="${iamProductName} home">
  </#if>
      <#assign iamBrandPlane = (iamPlane!"athyper")>
      <#if iamBrandPlane != "neon" && iamBrandPlane != "mesh" && iamBrandPlane != "admin">
        <#assign iamBrandPlane = "admin">
      </#if>
      <img class="iam-brand-mark" src="${url.resourcesPath}/img/${iamBrandPlane}-wordmark-black.png" alt="${iamProductName}" />
    </a>
</header>
