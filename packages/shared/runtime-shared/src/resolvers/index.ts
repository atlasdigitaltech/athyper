/**
 * Client-side resolver adapter (network-backed).
 *
 * All client-side `rederive` actions go through this module. There are NO
 * pure-client resolvers — every code resolves via BFF so tenant scoping
 * and auth remain server-side.
 */

export {
  callResolver,
  type CallResolverOptions,
  type ResolverError,
  type ResolverErrorReason,
  type ResolverResponse,
} from "./client";
export {
  applyServerDefaultsResolve,
  type ApplyClientSourceChangeArgs,
  type ApplyClientSourceChangeResult,
  type ApplyServerDefaultsResolveArgs,
} from "./apply-client-source-change";
export {
  createRefilterCheck,
  type CreateRefilterCheckArgs,
  type RefilterCheckFn,
} from "./refilter-check";
