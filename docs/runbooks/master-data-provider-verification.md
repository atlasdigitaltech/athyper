# Master data provider verification protocol v1

The host implements `ProviderEvidenceVerifier` with Node's Ed25519 verification. It trusts only operator-configured public keys, scoped by provider, key ID, tenant, plane, and key validity window. No keys, algorithms, or key-fetch URLs are accepted from request bodies. The implementation uses Node's [crypto.verify](https://nodejs.org/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback) with a null algorithm for Ed25519.

## Host configuration

Set `MASTER_DATA_VERIFICATION_KEYS_JSON` to a JSON array:

```json
[
  {
    "provider": "your-provider",
    "keyId": "2026-09",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n<Ed25519 SPKI public key base64>\n-----END PUBLIC KEY-----\n",
    "planeKeys": ["neon"],
    "tenantIds": ["11111111-1111-4111-8111-111111111111"],
    "notBefore": "2026-09-01T00:00:00.000Z",
    "notAfter": "2026-12-01T00:00:00.000Z"
  }
]
```

The example contains placeholders, not a usable key or tenant grant. Obtain the public key from the provider through a trusted administrative channel. The provider retains its private key; the application must never receive it. Configure only tenants and planes that provider is authorized to verify. Wildcards are not supported. Duplicate `(provider,keyId)` entries, private keys, non-Ed25519 keys, unknown configuration fields, and malformed validity windows fail configuration loading without echoing input.

Omitting the variable or configuring `[]` leaves contact verification unavailable (503). Other master-data operations continue to use PostgreSQL. To rotate keys, publish both old and new keys with distinct key IDs during the overlap window, switch provider signing, then remove the old entry and restart/redeploy the host. Removing an entry revokes that key on the next configuration load. This implementation does not fetch remote keys or dynamically reload configuration.

## What the provider attests

The provider must establish control/validity of the exact contact channel and stored normalized value before signing a positive verification result. An unverify operation requires separately signed evidence for `verified=false`. Possession of the signing key is authority to attest these results within its configured scope; signing arbitrary caller-supplied claims would defeat the verification process.

The existing HTTP evidence object keeps these fields:

- `provider`, `keyId`, `evidenceId`: 1–128 ASCII letters/digits with `.`, `_`, `:`, or `-` after the first character.
- `issuedAt`, `expiresAt`: required canonical UTC millisecond timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- `payloadHash`: lowercase hexadecimal SHA-256 of the signing bytes.
- `signature`: Ed25519 signature encoded as unpadded canonical base64url (64 decoded bytes).

Although the shared legacy evidence type still permits omitted `expiresAt`, protocol v1 rejects it. Evidence must already be issued, must not be expired, and may be valid for at most 10 minutes. No future clock-skew allowance is applied. The complete evidence validity interval must fit inside the configured key window.

## Exact signing bytes

Encode the following fixed-position JSON array as UTF-8 with no whitespace outside strings. Do not sort, rename, omit, or add array elements. Use JSON string escaping compatible with `JSON.stringify`. Do not normalize Unicode or normalize the contact value again. UUIDs are lowercase; all other strings retain exact spelling. The seventh element is a JSON boolean, not a string.

```json
["athyper.master.contact.verification.v1","neon","11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","email","person@example.com",true,"your-provider","2026-09","unique-evidence-id","2026-09-07T00:00:00.000Z","2026-09-07T00:05:00.000Z"]
```

Array positions are: protocol domain/version, plane, tenant ID, contact ID, channel type, stored contact value, requested verified state, provider, key ID, evidence ID, issuance, expiration. The protocol version is part of the signed bytes; the HTTP endpoint has no client-selectable algorithm or protocol downgrade option.

Sign the complete bytes using Ed25519. Do not sign the hexadecimal hash instead. The `payloadHash` is independently recomputed by the application, but checking that hash alone is never sufficient.

A Node provider can use the exported `contactVerificationSigningBytes(fields, target)` helper:

```ts
const bytes = contactVerificationSigningBytes(fields, target);
const evidence = {
  ...fields,
  payloadHash: createHash("sha256").update(bytes).digest("hex"),
  signature: sign(null, bytes, providerPrivateKey).toString("base64url"),
};
```

Submit `{ "verified": true, "evidence": evidence }` to `PATCH /api/master/contacts/{contactId}/verification`. The provider must know the tenant, plane, contact ID, and current normalized value from an authenticated integration. This change supplies the verifier and protocol; it does not implement a provider's email/SMS challenge-delivery workflow or provision external provider keys.

## Target binding and replay behavior

The service authorizes the request, obtains the current contact under a PostgreSQL row lock, and constructs the target from the verified request context and stored contact. It never uses a client-supplied contact value for verification. A proof for a different tenant, plane, contact, value, channel, or requested state fails with 422. Missing contacts return 404; permission denials return 403.

Accepted evidence and the contact update commit in the same transaction as audit/outbox effects. Each contact keeps its last accepted evidence timestamp in the existing verification JSON. A subsequent proof must have a strictly newer `issuedAt`; repeated current provider/evidence IDs are also rejected. Concurrent submissions of the same proof produce one success and one `409 VERIFICATION_EVIDENCE_REPLAY`. An older valid proof cannot restore an earlier state after newer evidence. Equal timestamps are rejected even for distinct IDs, so providers must issue monotonically increasing timestamps per contact, including across provider/key rotation. Out-of-order delivery intentionally fails and needs fresh evidence.

If audit or outbox persistence fails, the evidence update rolls back too, allowing a retry. This is an ordering-based replay policy per contact, not a separate global evidence-ID ledger. Provider reissuance of an old ID with a newer timestamp is not the same signed proof; providers must keep evidence IDs unique.

## Validation

Tests use real generated Ed25519 signatures, exact signing-byte assertions, altered target/envelope cases, recomputed attacker hashes, expiry and key-window boundaries, key rotation/removal, malformed trust configuration, and host registration with the production verifier. A disposable PostgreSQL integration test verifies concurrent replay rejection, signed-state binding, and retry after transaction rollback. No application database or deployed provider configuration was changed.


### Target-binding regression evidence

The PostgreSQL suite now has 11 passing integration tests. Additional cases submit Contact A's genuine proof to a distinct Contact B with the same email, another tenant's contact, another plane context, the opposite requested state, and Contact A after its stored value changes. The test key trusts both tested tenants and planes, so the failures exercise signed-target comparison rather than merely a key allowlist. All rejected operations leave verification evidence empty, verification false, and audit/outbox callbacks untouched. The cross-plane case tests cryptographic context binding with a test transaction coordinator, not physical routing across databases.

A separate two-transaction test acquires the same row lock used during verification and confirms that a concurrent value update fails with PostgreSQL lock timeout until the first transaction releases the row. This supplements the existing concurrent replay and rollback tests. Exact committed retries intentionally return 409 under the documented strict ordering policy; retries after rollback remain permitted.
