# Protected reveal runtime amendment

The approved Finance release passed 28 of 30 provider checks. Bank reveal returned 404 because its synthetic account has no protected-value token; isolated NEON also has no configured secret-store adapter. Tax reveal returned 500 because `audit.append_event` correctly refused an unregistered event contract. Neither failure is treated as a successful reveal.

[Exact amendment](../../governance/policy/reviews/business-partner-protected-values-amendment-20260912.proposal.dev.json): `5c4316658e4dc8205ca620e4f008a7ef2e360c4dc603eaec06c951fe8a213c57`.

It proposes:

- Image `sha256:31a2a5bd53303becf42800e68c75f9aeeb19dc67c0ea8e95c7fa15b8bf7d8d0a`, release-set `123e49b522733748477d385417e21bdea658c89a26687fd35f354389bb10fb3f`. The only compiled-file change registers the configured secret store independently of publication. Unrelated workspace changes are excluded. The five signed artifacts remain unchanged and publication activation stays disabled.
- One exact audit contract for existing bank/tax reveal event codes: user actors, tenant scope, execute operation and metadata-only capture. The command still requires a valid purpose, separate source/target permissions, elevated assurance and replay protection. Raw values are not written to audit.
- One new synthetic protected bank account and BP link. Existing linked account identity is immutable and is left unchanged. The new account remains unverified and has no company acceptance or payment authority. Its database identifier is a SHA-256 fingerprint; the raw synthetic value is resolved through Infisical.
- One new secret in the existing dev Infisical project (`ed696684-8309-4e0f-903a-8adece9246b7`, environment `dev`), under `protected-values/44444444-4444-4444-8444-444444444444/qualification.bp.finance-reveal.01d4baa18931c720.bank`. This is a bounded exception to leaving shared infrastructure data untouched: it adds only this synthetic fixture secret, changes no existing secret and changes no shared DEV application data/access. Retain the synthetic secret with its inventoried bank fixture.
- A new TLS pass-through relay supplies connectivity. Only that relay joins both networks; API/worker stay solely on the isolated network. TLS verification remains enabled and existing shared containers are unchanged. Existing service credentials stay in a private environment file and are not logged.

Validation completed: 15 adapter tests pass, including secret-store registration with publication disabled and lifecycle shutdown; host compilation passes. Both audit events append successfully in a rolled-back real database rehearsal. The protected account/link fixture passes all ownership and banking constraints in rollback. Canary health is 200, and a TLS-verified read confirms the proposed secret does not exist (404). No secret, audit contract, bank fixture or amendment deployment has been applied.

This amendment **adds, renews, restores or extends no grants**. It uses only the 52 assignments already approved under parent revision `01d4baa18931c72025a4cea425b7b34ff111f5e76c54767d7f7c428c15fc6d45`; expiry remains **16:00 MYT, 12 September 2026**. All will be revoked when qualification finishes. Enforcement activation, compatibility retirement and the 66-disposition acceptance remain separate.

Approval is needed because the prior proposal pinned a different image and did not authorize creating this fixture secret in shared dev Infisical. After approval, qualify both positive reveals and their audits, rerun final-image comparisons, revoke access, and qualify compatible recovery. If approval is not given, retain the failed reveal evidence and close the current run with the existing access revoked.
