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
