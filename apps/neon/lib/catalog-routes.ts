import { entityApplicationHref } from "@athyper/contract-platform-entity-runtime";
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

// The generated catalog owns every workspace/module slug and, from each entity's
// placement.json, the entities placed in each module. The overlay below covers only
// development list fixtures (procurement) that have no repository entity metadata yet.
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
  const normalized = normalizeEntityApplicationPath(pathname);
  return normalized ? publicRouteIndex.get(normalized) : undefined;
}

export function resolveNeonEntityApplicationInternalRoute(
  entityCode: string,
  segments: readonly string[] = [],
): NeonEntityApplicationRoute | undefined {
  const normalized = normalizeEntityApplicationPath(
      `${entityApplicationHref(entityCode)}/${segments.map(encodeURIComponent).join("/")}`,
  );
  return normalized ? internalRouteIndex.get(normalized) : undefined;
}

export function entityApplicationPublicPath(
  entityCode: string,
  segments: readonly string[] = [],
): string | undefined {
  return resolveNeonEntityApplicationInternalRoute(entityCode, segments)
    ?.publicPath;
}

function normalizeEntityApplicationPath(value: string): string | undefined {
  const pathname = value.replace(/\/+$/u, "") || "/";
  if (!pathname.startsWith("/") || pathname.includes("//") || pathname.includes(".."))
    return undefined;
  try {
    if (pathname.split("/").slice(1).some(segment => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || /[\\/\u0000-\u001f]/.test(decoded);
    })) return undefined;
  } catch { return undefined; }
  return pathname;
}
