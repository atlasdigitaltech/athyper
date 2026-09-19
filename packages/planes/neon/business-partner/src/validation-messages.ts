import type {PartnerRequest, ValidationFinding} from './client';
const messages: Record<string, readonly [string,string]> = {
 'role.ownership_subtype.compatible':['Supplier type is compatible with ownership','Choose a supplier type that matches the ownership classification.'],
 'identity.name.required':['Registered name provided','Enter the registered name.'],
 'identity.legal_name.required':['Registered name provided','Enter the registered name.'],
 'role.requested.required':['Partner role selected','Select the partner role.'],
 'role.request_kind.compatible':['Partner role matches the request type','Choose a role supported by this request type.'],
 'organization.operating.required':['Operating organization selected','Select the operating organization.'],
 'company.code.required':['Company code selected','Select the company code.'],
 'customer.sales_scope.required':['Customer operating scope selected','Select the customer operating scope.'],
 'customer.authority_fields.prohibited':['Customer approval-controlled fields are unchanged','Use the customer designation or credit review process to change these fields.'],
 'supplier.qualification_type.required':['Supplier qualification type format is valid','Select a valid supplier qualification type.'],
 'identity.organization_boundary':['Partner category is an organization','Select Organization as the partner category.'],
 'identity.registration_country.format':['Country code format is valid','Enter a two-letter uppercase country code.'],
 'identity.name.duplicate':['No exact-name duplicates found','Review the existing partners with a matching name or alias.'],
 'relationship.primary_address.required':['One primary address provided','Add an address and mark exactly one address as primary.'],
 'relationship.primary_contact.required':['Primary contact and contact channel provided','Add a primary contact with a primary contact channel.'],
 'lifecycle.reason.required':['Change reason provided','Select a valid reason for this lifecycle change.'],
 'lifecycle.dependencies.required':['Required dependency checks are satisfied','Resolve the required dependencies before continuing.'],
};
const skipped: Record<string,string> = {
 COMPANY_CODE_NOT_REQUIRED:'Company code is not required for this request.',
 CUSTOMER_SCOPE_NOT_APPLICABLE:'Customer scope checks do not apply to a supplier request.',
 CUSTOMER_AUTHORITY_NOT_APPLICABLE:'Customer authority checks do not apply to this request.',
 LIFECYCLE_REASON_NOT_APPLICABLE:'A lifecycle change reason is not required for this request.',
 LIFECYCLE_DEPENDENCIES_NOT_APPLICABLE:'Lifecycle dependency checks do not apply to this request.',
 EXISTING_IDENTITY_REUSED:'The existing partner identity is reused.',
 COMMERCIAL_ORGANIZATION_NOT_REQUIRED:'An operating organization is not required for this request.',
 SUPPLIER_QUALIFICATION_NOT_REQUIRED:'Supplier qualification is not required for this request.',
 REGISTRATION_COUNTRY_NOT_PROVIDED:'Country format was not checked because no country was provided.',
 NAME_NOT_AVAILABLE:'Duplicate matching was not checked because no name was available.',
 ROLE_NOT_CREATED:'This request does not create a commercial role.',
};
export function validationMessage(f: ValidationFinding, request: PartnerRequest): string {
 if(f.outcome==='skipped')return skipped[f.messageCode] ?? 'This check was not performed. See technical details for the recorded reason.';
 if(f.ruleCode==='role.target.required')return request.kind==='new_partner'
  ? f.outcome==='passed'?'No existing partner selected for this new partner request':'Remove the existing partner selection when creating a new partner.'
  : f.outcome==='passed'?'Existing partner selected':'Select the partner to update.';
 if(f.ruleCode==='source.mesh.pin.required')return request.source?.kind==='manual' && f.outcome==='passed'
  ? 'Mesh source verification is not required for manual entry.'
  : f.outcome==='passed'?'Source reference requirements are satisfied':'Select a versioned source reference.';
 const pair=messages[f.ruleCode];
 if(f.ruleCode==='role.ownership_subtype.compatible' && request.requestedRole==='customer')return f.outcome==='passed'?'Customer type is compatible with ownership':'Choose a customer type that matches the ownership classification.';
 return pair?.[f.outcome==='passed'?0:1] ?? (f.outcome==='passed'?'Check passed.':'This check needs attention. See technical details.');
}

export function validationNotApplicable(f: ValidationFinding): boolean {
 return f.outcome==='skipped' && /(?:NOT_APPLICABLE|NOT_REQUIRED|ROLE_NOT_CREATED|EXISTING_IDENTITY_REUSED)$/.test(f.messageCode);
}
