import { resolveEntityReadRoute } from "@athyper/contract-platform-entity-runtime";
import { EntityReadRuntime } from "../entity-read-runtime";

type Params = {
  readonly entityCode: string;
  readonly segments?: readonly string[];
};
/** Server-side route adapter only. API authorization and plane-specific descriptor
 * resolution remain in the existing runtime; this grants no entitlement. */
export function renderEntityReadRoute(params: Params, notFound: () => never) {
  const route = resolveEntityReadRoute(params.entityCode, params.segments);
  if (!route) return notFound();
  return <EntityReadRuntime {...route} />;
}
export function createEntityReadPage(notFound: () => never) {
  return async function EntityReadPage({
    params,
  }: {
    readonly params: Promise<Params>;
  }) {
    return renderEntityReadRoute(await params, notFound);
  };
}
