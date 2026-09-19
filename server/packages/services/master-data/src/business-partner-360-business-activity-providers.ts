import type{BusinessPartner360BusinessActivityProvider}from"./business-partner-360-service.js";

export const BUSINESS_PARTNER_360_BUSINESS_ACTIVITY_PROVIDER_CODES=["procurement","finance","sales","projects","contracts"]as const;

/** Explicit fail-closed entries used until an owning module supplies its documented summary reader. */
export function createUnavailableBusinessPartner360ActivityProviders(configured:readonly BusinessPartner360BusinessActivityProvider[]=[]):readonly BusinessPartner360BusinessActivityProvider[]{
 const byCode=new Map(configured.map(provider=>[provider.code,provider]));
 return BUSINESS_PARTNER_360_BUSINESS_ACTIVITY_PROVIDER_CODES.map(code=>byCode.get(code)??{code,async read(){return{provider:code,state:"unavailable",metrics:[],reasonCode:"PROVIDER_NOT_CONFIGURED",observedAt:new Date().toISOString()};}});
}
