// framework/runtime/src/registries/routes.registry.ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteDef = {
  method: HttpMethod;
  path: string;

  handlerToken: string;

  /** If true, require Bearer token */
  authRequired?: boolean;

  /** Optional policy token hook (RBAC/ABAC) */
  policyToken?: string;

  tags?: string[];
};

export class RouteRegistry {
  private routes: RouteDef[] = [];

  add(def: RouteDef) {
    this.routes.push(def);
  }

  list(): readonly RouteDef[] {
    return this.routes;
  }
}