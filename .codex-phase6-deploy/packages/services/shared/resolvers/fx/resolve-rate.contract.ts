import { asResolverCode, type ResolverContract } from "@athyper/cascade";

export const fxResolveRateContract: ResolverContract = {
  code: asResolverCode("fx.resolve_rate"),
  description: "Resolves document exchange_rate and fx_rate_snapshot using the shared FX policy resolver.",
  requiredSources: ["currency_code", "base_currency_code"],
  outputType: "object",
};
