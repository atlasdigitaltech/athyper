# Athyper — Feature Parameter Reference

Human-readable catalog of the platform's runtime-reloadable business parameters.

**Authoritative seed SQL** → [`server/db/seed/platform/003_control/085_control_parameter_definition_contract.sql`](../../server/db/seed/platform/003_control/085_control_parameter_definition_contract.sql)
**For env vars and kernel config** → [env-reference.md §1](env-reference.md#configuration-layer-architecture)

---

## Contents

1. [What the parameter system is](#1-what-the-parameter-system-is)
2. [Three-table architecture](#2-three-table-architecture)
3. [Resolution chain](#3-resolution-chain)
4. [runtime_reload modes](#4-runtime_reload-modes)
5. [control_level and tenant_visibility](#5-control_level-and-tenant_visibility)
6. [How to override a parameter for a tenant](#6-how-to-override-a-parameter-for-a-tenant)
7. [Catalog — Auth & Session](#7-catalog--auth--session)
8. [Catalog — Finance](#8-catalog--finance)
9. [Catalog — Collaboration](#9-catalog--collaboration)
10. [Catalog — Notifications](#10-catalog--notifications)
11. [Catalog — API & List](#11-catalog--api--list)
12. [Catalog — Platform & UX](#12-catalog--platform--ux)
13. [Catalog — Keycloak mirrors](#13-catalog--keycloak-mirrors)

---

## 1. What the parameter system is

The feature parameter table is the **third configuration layer** — sitting below env vars and
kernel config. It owns business-logic tunables that:

- May vary per tenant (one tenant wants 30-day AP terms, another wants 60)
- Should be changeable without a deploy
- Have a product-level default that tenants can optionally override

Parameters are never secrets. Do not store credentials, keys, or connection strings here.

---

## 2. Three-table architecture

| Table | Owns |
|---|---|
| `control.parameter_definition` | Product catalog — 109 seeded parameters with defaults, bounds, types, and reload modes |
| `master.tenant_parameter_value` | Tenant overrides — per-tenant value rows with `override_enabled` toggle |
| `log.parameter_change_log` | Append-only audit trail — every create/update/disable recorded with old and new values |

---

## 3. Resolution chain

```
GET /api/parameters/:code   (or ParameterResolverService.resolve(code, tenantId))
  1. Read control.parameter_definition for schema, default_value, bounds, cache_ttl_seconds
  2. Query master.tenant_parameter_value WHERE tenant_id = ? AND parameter_code = ? AND override_enabled = true
  3. Return tenant override if found → else return default_value
  4. Cache result in Redis for cache_ttl_seconds (default 300s)
```

Cache is keyed by `(parameter_code, tenant_id)`. Invalidation on write is automatic via the
parameter routes.

---

## 4. runtime_reload modes

The `runtime_reload` column determines when a value change takes effect:

| Mode | Takes effect | Used for |
|---|---|---|
| `immediate` | Next Redis cache expiry (cache_ttl_seconds) | UI-only settings, display preferences |
| `next_request` | After current in-flight request completes | Most business tunables |
| `next_login` | When user next authenticates | Session TTL changes — active sessions keep old value |
| `restart` | Server restart required | Cookie names, structural auth config |
| `external_provider` | KC realm change required — **read-only mirror** | `keycloak.*` rows — KC is authoritative |

---

## 5. control_level and tenant_visibility

`control_level` determines **who owns** the value:

| Value | Meaning |
|---|---|
| `system_controlled` | Platform engineering only — no tenant override |
| `tenant_configurable` | Product sets default; tenant may override |
| `tenant_owned` | Reserved for tenant-created custom parameters |

`tenant_visibility` determines **what the tenant sees** in the admin UI:

| Value | Tenant sees | Tenant can change |
|---|---|---|
| `hidden` | No | No |
| `readonly` | Yes | No |
| `configurable` | Yes | Yes |

---

## 6. How to override a parameter for a tenant

```sql
INSERT INTO master.tenant_parameter_value (
    tenant_id, parameter_code, override_enabled, value, reason, created_by
) VALUES (
    '<tenant-uuid>',
    'finance.ap.payment_terms_days',
    true,
    '60'::jsonb,
    'Extended terms negotiated with supplier',
    '<principal-uuid>'
)
ON CONFLICT (tenant_id, parameter_code)
DO UPDATE SET
    override_enabled = true,
    value = EXCLUDED.value,
    reason = EXCLUDED.reason,
    updated_at = now();
```

The change takes effect after the next cache TTL expiry (300s for most params). For
`next_login` reload mode, the existing session keeps the old value until the user re-authenticates.

To disable an override (revert to product default):

```sql
UPDATE master.tenant_parameter_value
SET override_enabled = false
WHERE tenant_id = '<tenant-uuid>' AND parameter_code = 'finance.ap.payment_terms_days';
```

---

## 7. Catalog — Auth & Session

### auth.session

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `auth.session.absolute_ttl_seconds` | `28800` (8h) | 1800 | 43200 | `next_login` | Yes | Maximum Redis-backed web session lifetime before a full login is required |
| `auth.session.expired_redirect_countdown_seconds` | `30` | 5 | 300 | `immediate` | Yes | Countdown shown before an expired-session dialog redirects to sign in |

### auth.inactivity

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `auth.idle.timeout_seconds` | `900` (15m) | 300 | 3600 | `immediate` | Yes | Idle duration after which the session is locked and a re-auth is required |
| `auth.idle.warning_seconds` | `60` | 30 | 600 | `immediate` | Yes | How long before idle expiry the browser warning dialog is shown |
| `auth.heartbeat.interval_ms` | `60000` | 60000 | 600000 | `immediate` | Yes | Minimum interval between browser touch calls that update `lastSeenAt` |

### auth.mfa

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `auth.mfa.pending_ttl_seconds` | `900` | 300 | 1800 | `next_request` | Yes | How long an MFA-pending browser state can live before restarting sign in |
| `auth.mfa.trusted_device_ttl_days` | `30` | 1 | 90 | `next_request` | Yes | How long a remembered device can bypass repeated MFA challenges |
| `runtime.mfa.step_up_ttl_seconds` | `600` | 60 | 1800 | `next_request` | Yes | How long a successful MFA step-up remains valid for sensitive actions |

### auth.discovery (system_controlled — not tenant-overridable)

| Code | Default | Reload | Description |
|---|---|---|---|
| `auth.discovery.stage1_verification_mode` | `disabled` | `next_request` | Whether org discovery requires email verification (`required`/`disabled`) |
| `auth.discovery.neon.stage1_verification_mode` | `disabled` | `next_request` | Neon-plane override for stage 1 discovery |
| `auth.discovery.mesh.stage1_verification_mode` | `disabled` | `next_request` | Mesh-plane override for stage 1 discovery |
| `auth.discovery.admin.stage1_verification_mode` | `disabled` | `next_request` | Admin-plane override for stage 1 discovery |
| `auth.discovery.token_ttl_seconds` | `900` | `next_request` | Lifetime of a stage 1 discovery verification link |
| `auth.discovery.resend_cooldown_seconds` | `30` | `next_request` | Minimum wait before requesting another discovery verification link |
| `auth.discovery.verified_trust_ttl_days` | `30` | `next_request` | How long a browser that completed stage 1 can skip re-verification |

### auth.token / auth.refresh (system_controlled)

| Code | Default | Reload | Description |
|---|---|---|---|
| `auth.token.client_refresh_lead_seconds` | `90` | `immediate` | Browser token refresh starts this many seconds before access token expiry |
| `auth.token.server_refresh_buffer_seconds` | `120` | `next_request` | Server-side refresh buffer: proactively refreshes when inside this window |
| `auth.refresh.lock_ttl_seconds` | `10` | `next_request` | Distributed Redis lock lifetime preventing refresh-token rotation races |
| `auth.refresh.lock_wait_ms` | `300` | `next_request` | How long a concurrent request waits before reading a rotated session |
| `auth.refresh.sid_rotation_grace_seconds` | `30` | `next_request` | Short lookup window from old SID to new SID for in-flight requests |
| `auth.pkce.state_ttl_seconds` | `1800` | `next_request` | Maximum lifetime of the OAuth PKCE state record used during sign in |

### auth.logout (system_controlled)

| Code | Default | Reload | Description |
|---|---|---|---|
| `auth.logout.revoke_refresh_tokens` | `true` | `external_provider` | Whether logout attempts to revoke the active Keycloak refresh token |
| `auth.logout.clear_all_bff_namespaces` | `true` | `next_request` | Whether logout clears every known BFF session namespace for the user |

### auth.cookie (system_controlled — restart required to change)

| Code | Default | Description |
|---|---|---|
| `auth.cookie.session_name` | `neon_sid` | Name of the secure HTTP-only BFF session cookie |
| `auth.cookie.csrf_name` | `__csrf` | Name of the CSRF binding cookie |
| `auth.cookie.mfa_pending_name` | `neon_mfa_pending` | Name of the MFA pending state cookie |
| `auth.cookie.realm_name` | `neon_realm` | Name of the login realm hint cookie |

### runtime.session / runtime.portal (system_controlled)

| Code | Default | Reload | Description |
|---|---|---|---|
| `runtime.session.cache_ttl_seconds` | `300` | `next_request` | Cache lifetime for resolved runtime session context |
| `runtime.bootstrap.cache_ttl_seconds` | `300` | `next_request` | Cache lifetime for tenant bootstrap data used by the shell |
| `runtime.portal.default_workbench` | `user` | `next_login` | Fallback portal when IAM/KC does not provide a resolved portal (`user`/`partner`/`admin`) |

---

## 8. Catalog — Finance

### finance.ap

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `finance.ap.payment_terms_days` | `30` | 0 | 365 | `next_request` | Yes | Default net-payment days on AP invoices when no supplier-specific terms are set |
| `finance.ap.tolerance_amount` | `5` | 0 | 10 000 | `next_request` | Yes | Maximum absolute currency difference allowed when matching a purchase invoice to a GR |
| `finance.ap.tolerance_percent` | `2` | 0 | 20 | `next_request` | Yes | Maximum percentage difference allowed during invoice-to-GR/PO matching |
| `finance.ap.default_procurement_line_type` | `goods` | — | — | `immediate` | Yes | Default procurement type on new AP invoice lines (`goods`/`services`) |
| `finance.ap.default_procurement_line_uom` | `EA` | — | — | `immediate` | Yes | Default unit of measure on standalone AP invoice lines |

### finance.ar

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `finance.ar.credit_days` | `30` | 0 | 365 | `next_request` | Yes | Default credit period given to customers on AR invoices |
| `finance.ar.late_payment_grace_days` | `0` | 0 | 30 | `next_request` | Yes | Days after invoice due date before a receivable is classified as overdue in aging reports |

### finance.gl

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `finance.gl.period_close_lock_days` | `5` | 0 | 30 | `next_request` | Yes | Days after a period ends before it is automatically locked to new postings |

### finance.numbering

| Code | Default | Reload | Tenant? | Description |
|---|---|---|---|---|
| `finance.numbering.je_prefix` | `JE` | `next_request` | Yes | Prefix prepended to auto-generated journal entry document numbers |
| `finance.numbering.ap_invoice_prefix` | `API` | `next_request` | Yes | Prefix prepended to auto-generated AP invoice document numbers |
| `finance.numbering.ar_invoice_prefix` | `ARI` | `next_request` | Yes | Prefix prepended to auto-generated AR invoice document numbers |

### finance.reporting

| Code | Default | Reload | Tenant? | Description |
|---|---|---|---|---|
| `finance.reporting.default_report` | `profit-loss` | `next_request` | Yes | Which report tab opens by default on the Finance > Reports page (`profit-loss`/`balance-sheet`/`trial-balance`/`cash-flow`/`ap-aging`/`ar-aging`) |

---

## 9. Catalog — Collaboration

### collab.attachments

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `collab.attachments.max_file_bytes` | `104 857 600` (100 MB) | 1 048 576 | 524 288 000 | `next_request` | Yes | Largest single file uploadable to a comment or document attachment |
| `collab.attachments.max_files_per_batch` | `10` | 1 | 50 | `next_request` | Yes | Number of files attachable in a single upload action |

---

## 10. Catalog — Notifications

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `notifications.dedup_window_ms` | `300 000` (5m) | 0 | 3 600 000 | `next_request` | Yes | Time window within which identical notifications are suppressed to prevent alert storms |
| `notifications.webhook.rate_limit_rpm` | `120` | 10 | 1200 | `next_request` | Yes | Maximum inbound webhook events accepted per minute per integration endpoint |

---

## 11. Catalog — API & List

### api.pagination (legacy — prefer api.list for new work)

| Code | Default | Reload | Tenant? | Description |
|---|---|---|---|---|
| `api.pagination.default_page_size` | `20` | `next_request` | Yes | Records per page on entity list views when no `page_size` is specified |
| `api.pagination.max_page_size` | `500` | `next_request` | No | Hard upper bound on `page_size` query parameter |
| `api.pagination.load_more_increment` | `50` | `next_request` | Yes | Additional records requested when Load More is used |
| `api.pagination.picker_tree_min_page_size` | `500` | `next_request` | No | Minimum page-size ceiling for entity picker tree mode |

### api.list (runtime-canvas progressive list)

| Code | Default | Reload | Tenant? | Description |
|---|---|---|---|---|
| `api.list.lazy_load_enabled` | `true` | `next_request` | Yes | Enables hybrid lazy loading (first page immediate, later pages appended on scroll) |
| `api.list.page_size_selector_enabled` | `true` | `next_request` | Yes | Shows rows-per-page selector in paginated lists |
| `api.list.default_page_size` | `20` | `next_request` | Yes | Default fetch page size for runtime-canvas lists |
| `api.list.lazy_load_page_size` | `20` | `next_request` | Yes | Technical fetch page size for hybrid lazy lists |
| `api.list.lazy_prefetch_distance_px` | `320` | `next_request` | Yes | Scroll distance before the list bottom where the next page is prefetched |
| `api.list.loaded_page_cache_ttl_seconds` | `300` | `next_request` | Yes | Browser session-cache lifetime for visited list pages |
| `api.list.max_loaded_rows` | `200` | `next_request` | Yes | Upper limit for rows in browser memory before virtualization activates |
| `api.list.redis_page_cache_ttl_seconds` | `45` | `next_request` | No | Server Redis TTL for scoped list page responses |
| `api.list.redis_count_cache_ttl_seconds` | `120` | `next_request` | No | Server Redis TTL for scoped list total counts |

### api.search

| Code | Default | Reload | Tenant? | Description |
|---|---|---|---|---|
| `api.search.default_scope` | `auto` | `next_request` | Yes | Default behavior for list search: `auto` searches loaded rows first then expands; `loaded`/`all` are explicit |
| `api.search.min_query_length` | `2` | `next_request` | Yes | Minimum characters before all-record search runs |
| `api.search.loaded_search_threshold` | `500` | `next_request` | Yes | Maximum loaded-row count before stronger all-records prompts are shown |
| `api.search.auto_search_all_on_empty` | `true` | `next_request` | Yes | Auto-run all-record search when loaded rows have no matches |

---

## 12. Catalog — Platform & UX

### workbench.supply_chain

| Code | Default | Min | Max | Reload | Tenant? | Description |
|---|---|---|---|---|---|---|
| `workbench.supply_chain.commodity_category_tree_batch_size` | `500` | 50 | 1000 | `immediate` | Yes | Maximum commodity-category hierarchy rows per tree request in the supply-chain Explorer |

### Additional namespaces (see seed SQL for full definitions)

The following namespaces exist in the seed SQL but are not individually listed here. Refer to
[`085_control_parameter_definition_contract.sql`](../../server/db/seed/platform/003_control/085_control_parameter_definition_contract.sql)
for the full 109-row catalog:

| Namespace | What it covers |
|---|---|
| `api.export` | Export format defaults, row limits |
| `api.audit` | Audit query defaults, retention visibility |
| `governance.cert` | Certification snapshot TTL, immutability window |
| `jobs.sla` | Job SLA thresholds, escalation windows |
| `jobs.editlock` | Concurrent edit lock TTL |
| `ux.recents` | Recent-items list size, staleness window |

---

## 13. Catalog — Keycloak mirrors

> **These rows are read-only mirrors. KC is the authoritative source. Do not set tenant
> overrides on `keycloak.*` parameters — `override_enabled` must remain `false`.**

`keycloak.*` rows carry `control_level = system_controlled` and
`runtime_reload = external_provider`. They exist for display in the admin UI (platform
operators can see KC-side TTLs alongside app-side session TTLs in one view) but the server
never reads them to make auth decisions.

| Code | Default (KC default) | Description |
|---|---|---|
| `keycloak.token.access_ttl_seconds` | `900` | Reference value for KC realm access token lifetime |
| `keycloak.session.idle_timeout_seconds` | `1800` | Reference value for KC SSO idle timeout |
| `keycloak.session.max_lifespan_seconds` | `36000` | Reference value for KC SSO maximum session lifespan |
| `keycloak.refresh.revoke_tokens_enabled` | `true` | Reference value for KC refresh-token revocation behavior |
| `keycloak.refresh.max_reuse` | `0` | Reference value for KC refresh max reuse (0 = single-use rotation) |

To change these values, update the Keycloak realm configuration (not this table). After
updating KC, also update the `default_value` in `control.parameter_definition` to keep the
mirror in sync.

---

## Related documentation

| Document | Scope |
|---|---|
| [env-reference.md §1](env-reference.md#configuration-layer-architecture) | Three-layer config architecture and decision flowchart |
| [kernel-config-reference.md](kernel-config-reference.md) | IAM realm topology, feature flags, SUPERSTAR pattern |
| [secrets-management.md](secrets-management.md) | Secret generation, rotation runbooks |
| [iam-realm-config.md](iam-realm-config.md) | Keycloak realm JSON and KC-side configuration |
