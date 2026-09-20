import {
  validateCatalogRoutes,
  type CatalogWorkspaceRoute,
} from "@athyper/contract-platform-navigation";
import { PLATFORM_CATALOG_ROUTES } from "@athyper/contract-platform-navigation/generated";

const entityRoutes: Readonly<
  Record<
    string,
    Readonly<
      Pick<
        CatalogWorkspaceRoute["modules"][number],
        "defaultEntityCode" | "entities"
      >
    >
  >
> = Object.freeze({
  bp: {
    defaultEntityCode: "business_partner",
    entities: [
      {
        code: "business_partner",
        routeSlug: "business-partners",
        name: "Business Partners",
      },
      {
        code: "business_partner_request",
        routeSlug: "requests",
        name: "Business Partner Requests",
      },
    ],
  },
  org: {
    defaultEntityCode: "currency",
    entities: [
      {
        code: "currency",
        routeSlug: "currencies",
        name: "Currencies",
      },
    ],
  },
  buy: {
    defaultEntityCode: "purchase_order",
    entities: [
      {
        code: "purchase_order",
        routeSlug: "purchase-orders",
        name: "Purchase Orders",
      },
      {
        code: "purchase_request",
        routeSlug: "purchase-requests",
        name: "Purchase Requests",
      },
      {
        code: "supplier_invoice",
        routeSlug: "invoices",
        name: "Supplier Invoices",
      },
      {
        code: "purchasing_document",
        routeSlug: "documents",
        name: "Purchasing Documents",
      },
    ],
  },
});

// The generated catalog owns every workspace/module slug. Entity adapters are
// overlaid only where the corresponding production runtime exists today.
export function applyNeonEntityRoutes(
  catalog: readonly CatalogWorkspaceRoute[],
): readonly CatalogWorkspaceRoute[] {
  const modules = new Set(
    catalog.flatMap((workspace) =>
      workspace.modules.map((module) => module.code),
    ),
  );
  for (const code of Object.keys(entityRoutes)) {
    if (!modules.has(code))
      throw new Error(
        `Neon runtime overlay references an absent catalog module: ${code}`,
      );
  }
  const routes = Object.freeze(
    catalog.map((workspace) =>
      Object.freeze({
        ...workspace,
        modules: Object.freeze(
          workspace.modules.map((module) =>
            Object.freeze({
              ...module,
              ...(entityRoutes[module.code] ?? {}),
              entities: entityRoutes[module.code]?.entities ?? module.entities,
            }),
          ),
        ),
      }),
    ),
  );
  validateCatalogRoutes(routes);
  return routes;
}
export const neonCatalogRoutes = applyNeonEntityRoutes(
  PLATFORM_CATALOG_ROUTES.neon,
);

/**
 * Public aliases are catalog-owned. The internal path is intentionally not a
 * user-facing contract: proxy rewrites preserve the original address, query and
 * browser history while the shared entity entry point renders the surface.
 */
export interface NeonEntityApplicationRoute {
  readonly publicPath: string;
  /** Additional public aliases that render the same shared application surface. */
  readonly publicAliases?: readonly string[];
  readonly internalPath: string;
  readonly workspaceCode: string;
  readonly moduleCode: string;
  readonly entityCode: string;
  readonly surfaceKey: string;
}

const entityApplicationRoutes: readonly NeonEntityApplicationRoute[] = Object.freeze([
  Object.freeze({
    publicPath: "/mdg/business-partner/manage",
    publicAliases: Object.freeze([
      "/mdg/business-partner",
      "/mdg/business-partner/partners",
      "/mdg/business-partner/business-partners",
    ]),
    internalPath: "/app/entity/business_partner/manage",
    workspaceCode: "mdg",
    moduleCode: "bp",
    entityCode: "business_partner",
    surfaceKey: "manage",
  }),
]);

const publicRouteIndex = new Map(
  entityApplicationRoutes.flatMap((route) => [
    [route.publicPath, route] as const,
    ...(route.publicAliases ?? []).map((path) => [path, route] as const),
  ]),
);
const internalRouteIndex = new Map(
  entityApplicationRoutes.map((route) => [route.internalPath, route]),
);

export function resolveNeonEntityApplicationPublicRoute(
  pathname: string,
): NeonEntityApplicationRoute | undefined {
  return publicRouteIndex.get(normalizeEntityApplicationPath(pathname));
}

export function resolveNeonEntityApplicationInternalRoute(
  entityCode: string,
  segments: readonly string[] = [],
): NeonEntityApplicationRoute | undefined {
  return internalRouteIndex.get(
    normalizeEntityApplicationPath(
      `/app/entity/${entityCode}/${segments.join("/")}`,
    ),
  );
}

export function entityApplicationPublicPath(
  entityCode: string,
  segments: readonly string[] = [],
): string | undefined {
  return resolveNeonEntityApplicationInternalRoute(entityCode, segments)
    ?.publicPath;
}

function normalizeEntityApplicationPath(value: string): string {
  const pathname = value.replace(/\/+$/u, "") || "/";
  if (!pathname.startsWith("/") || pathname.includes("//") || pathname.includes(".."))
    throw new TypeError("Invalid entity application route path");
  return pathname;
}
