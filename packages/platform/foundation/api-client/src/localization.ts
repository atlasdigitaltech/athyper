import type { Operation } from "./index";
import {
  parseExperienceBootstrap,
  parseExperienceLocalePolicy,
  type ExperienceBootstrap,
  type ExperienceLocaleCatalog,
  type ExperienceLocalePolicy,
} from "./bootstrap";
import type { SupportedLocale } from "@athyper/platform-i18n";

type LocalePolicyParams = Readonly<Record<string, string | number>>;

export const updatePrincipalLocaleOperation: Operation<
  ExperienceBootstrap,
  { readonly localeCode: string }
> = Object.freeze({
  method: "PATCH",
  path: "/api/platform/profile/locale",
  parse: parseExperienceBootstrap,
  requestClass: "interactive",
  idempotency: "forbidden",
  response: "json",
});

export const localePolicyOperation: Operation<ExperienceLocalePolicy> = Object.freeze({
  method: "GET",
  path: localePolicyPath,
  parse: parseLocalePolicy,
  requestClass: "interactive",
  idempotency: "forbidden",
  response: "json",
});

export const updateLocalePolicyOperation: Operation<
  ExperienceLocalePolicy,
  {
    readonly catalogs: readonly Pick<ExperienceLocaleCatalog,"localeCode"|"status"|"coveragePct"|"linguisticReviewPassed"|"layoutReviewPassed"|"automatedTestsPassed">[];
    readonly enabledLocales: readonly SupportedLocale[];
    readonly defaultLocale: SupportedLocale;
    readonly fallbackLocale: "en";
  }
> = Object.freeze({
  method: "PUT",
  path: localePolicyPath,
  parse: parseLocalePolicy,
  requestClass: "interactive",
  idempotency: "required",
  response: "json",
});

function localePolicyPath(params: LocalePolicyParams): string {
  return `/api/platform/localization/policies/${encodeURIComponent(String(params.planeKey))}`;
}

function parseLocalePolicy(value: unknown): ExperienceLocalePolicy { return parseExperienceLocalePolicy(value); }
