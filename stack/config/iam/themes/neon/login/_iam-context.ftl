<#--
  Shared IAM request context.

  Plane resolution is client-first. Query-string values are only a legacy
  fallback for older callers that do not provide a known Keycloak client.
  Never use an arbitrary tenant or plane URL parameter as authorization input.
-->
<#assign iamClientId = "">
<#if client?? && client.clientId??>
  <#assign iamClientId = client.clientId?string?lower_case>
</#if>

<#assign iamPlane = "athyper">
<#if iamClientId?contains("neon")>
  <#assign iamPlane = "neon">
<#elseif iamClientId?contains("mesh")>
  <#assign iamPlane = "mesh">
<#elseif iamClientId?contains("admin") || iamClientId?contains("platform")>
  <#assign iamPlane = "admin">
<#else>
  <#assign iamLegacyPlane = "">
  <#if request?? && request.getParameter("athyper_plane")??>
    <#assign iamLegacyPlane = request.getParameter("athyper_plane")?string?lower_case>
  </#if>
  <#if iamLegacyPlane == "neon" || iamLegacyPlane == "mesh">
    <#assign iamPlane = iamLegacyPlane>
  <#elseif iamLegacyPlane == "admin" || iamLegacyPlane == "platform-control">
    <#assign iamPlane = "admin">
  </#if>
</#if>

<#assign iamProductName = "Athyper">
<#assign iamBrowserTitle = "Athyper Studio - Business Technology Platform">
<#if iamPlane == "neon">
  <#assign iamProductName = "Neon">
  <#assign iamBrowserTitle = "Athyper Neon - Business Operating Platform">
<#elseif iamPlane == "mesh">
  <#assign iamProductName = "Mesh">
  <#assign iamBrowserTitle = "Athyper Mesh - Business Collaboration Network">
<#elseif iamPlane == "admin">
  <#assign iamProductName = "Studio">
  <#assign iamBrowserTitle = "Athyper Studio - Business Technology Platform">
</#if>

<#function iamTitle pageTitle>
  <#return iamBrowserTitle>
</#function>
