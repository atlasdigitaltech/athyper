export const CIRRUSATLANTIC_DEMO_AUTH_CONFIRMATION = "LOCAL-CIRRUSATLANTIC-DEMO-AUTH";
export const CIRRUSATLANTIC_TENANT_ID = "44444444-4444-4444-8444-444444444444";
export const CIRRUSATLANTIC_TENANT_CODE = "cirrusatlantic";
export const CIRRUSATLANTIC_CONTEXT_PERMISSION = "neon.context.catalog.read";

export type DemoScopeCoordinate = Readonly<{
  kind: "tenant" | "legal_entity" | "company_code" | "operating_organization";
  key: string;
  propagation: "exact" | "subtree";
}>;

export type DemoPersona = Readonly<{
  username: "catl.admin" | "catl.owner" | "catl.finance";
  subjectId: string;
  groupCode: string;
  groupName: string;
  roleCode: string;
  roleName: string;
  scopes: readonly DemoScopeCoordinate[];
}>;

const legalEntity = Object.freeze({ kind: "legal_entity", key: "legal_entity:catl", propagation: "exact" } as const);
const company = Object.freeze({ kind: "company_code", key: "company_code:catl", propagation: "exact" } as const);
const operations = Object.freeze({ kind: "operating_organization", key: "operating_organization:catl.operations", propagation: "subtree" } as const);

export const CIRRUSATLANTIC_DEMO_PERSONAS: readonly DemoPersona[] = Object.freeze([
  Object.freeze({
    username: "catl.admin",
    subjectId: "aa003000-0000-0000-0000-000000000001",
    groupCode: "catl.demo.tenant_administrators",
    groupName: "CirrusAtlantic Demo Tenant Administrators",
    roleCode: "catl.demo.tenant_context_administrator",
    roleName: "CirrusAtlantic Demo Tenant Context Administrator",
    scopes: Object.freeze([
      Object.freeze({ kind: "tenant", key: CIRRUSATLANTIC_TENANT_CODE, propagation: "exact" } as const),
      legalEntity,
      company,
      operations,
    ]),
  }),
  Object.freeze({
    username: "catl.owner",
    subjectId: "aa003000-0000-0000-0000-000000000002",
    groupCode: "catl.demo.legal_entity_owners",
    groupName: "CirrusAtlantic Demo Legal Entity Owners",
    roleCode: "catl.demo.legal_entity_context_owner",
    roleName: "CirrusAtlantic Demo Legal Entity Context Owner",
    scopes: Object.freeze([legalEntity, company, operations]),
  }),
  Object.freeze({
    username: "catl.finance",
    subjectId: "aa003000-0000-0000-0000-000000000003",
    groupCode: "catl.demo.company_finance_users",
    groupName: "CirrusAtlantic Demo Company Finance Users",
    roleCode: "catl.demo.company_finance_context_reader",
    roleName: "CirrusAtlantic Demo Company Finance Context Reader",
    scopes: Object.freeze([legalEntity, company, operations]),
  }),
]);

export function validateCirrusAtlanticDemoAuthorizationModel(): void {
  if (CIRRUSATLANTIC_DEMO_PERSONAS.length !== 3) throw new Error("CirrusAtlantic demo requires exactly three personas");
  const usernames = new Set<string>();
  for (const persona of CIRRUSATLANTIC_DEMO_PERSONAS) {
    if (usernames.has(persona.username)) throw new Error(`duplicate CirrusAtlantic username: ${persona.username}`);
    usernames.add(persona.username);
    const coordinates = new Set(persona.scopes.map((scope) => `${scope.kind}/${scope.key}/${scope.propagation}`));
    if (coordinates.size !== persona.scopes.length) throw new Error(`duplicate scope coordinate for ${persona.username}`);
    for (const required of ["legal_entity:catl", "company_code:catl", "operating_organization:catl.operations"]) {
      if (!persona.scopes.some((scope) => scope.key === required)) throw new Error(`${persona.username} is missing ${required}`);
    }
    if (persona.scopes.some((scope) => scope.propagation === ("member_companies" as string))) {
      throw new Error("member_companies propagation is forbidden in the local demo overlay");
    }
  }
}
