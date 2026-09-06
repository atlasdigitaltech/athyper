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
<#elseif iamClientId?contains("studio") || iamClientId?contains("admin") || iamClientId?contains("platform")>
  <#assign iamPlane = "studio">
<#else>
  <#assign iamLegacyPlane = "">
  <#if request?? && request.getParameter("athyper_plane")??>
    <#assign iamLegacyPlane = request.getParameter("athyper_plane")?string?lower_case>
  </#if>
  <#if iamLegacyPlane == "neon" || iamLegacyPlane == "mesh">
    <#assign iamPlane = iamLegacyPlane>
  <#elseif iamLegacyPlane == "studio" || iamLegacyPlane == "admin" || iamLegacyPlane == "platform-control">
    <#assign iamPlane = "studio">
  </#if>
</#if>

<#assign iamProductName = "Athyper">
<#-- Generated from packages/platform/foundation/brand/src/plane-presentation.json. -->
<#assign iamBrowserTitle = "Studio - Business Technology Platform">
<#assign iamDescriptor = "Business Technology Platform">
<#if iamPlane == "neon">
  <#assign iamProductName = "Neon">
  <#assign iamBrowserTitle = "Neon - Business Operating Platform">
  <#assign iamDescriptor = "Business Operating Platform">
<#elseif iamPlane == "mesh">
  <#assign iamProductName = "Mesh">
  <#assign iamBrowserTitle = "Mesh - Business Collaboration Network">
  <#assign iamDescriptor = "Business Collaboration Network">
<#elseif iamPlane == "studio">
  <#assign iamProductName = "Studio">
  <#assign iamBrowserTitle = "Studio - Business Technology Platform">
</#if>

<#function iamTitle pageTitle>
  <#return "${pageTitle} ${iamProductName}">
</#function>
