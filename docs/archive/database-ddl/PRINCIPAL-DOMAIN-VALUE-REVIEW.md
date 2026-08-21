# Principal domain and lookup-value review

Date: 2026-07-30

Status: implemented identically in Athyper, Neon, and Mesh.

## Value ownership

Stable protocol and lifecycle values are sealed PostgreSQL domains in each
plane-local `master` schema. They are not customer-extensible because every
new value requires corresponding application, policy, or adapter behavior.

| Domain | Values |
|---|---|
| `master.principal_type_d` | `user`, `service_account`, `bot`, `integration`, `support` |
| `master.principal_provisioning_source_d` | `internal`, `jit`, `sync`, `import`, `api` |
| `master.principal_status_d` | `active`, `suspended`, `deactivated` |
| `master.identity_provider_d` | `keycloak`, `oidc`, `saml`, `microsoft`, `google`, `okta`, `ldap`, `github` |
| `master.identity_binding_status_d` | `active`, `disabled`, `revoked` |
| `shared.idp_sync_status_d` | `pending`, `synced`, `drift`, `error`, `disabled` |
| `master.ui_appearance_mode_d` | `light`, `dark`, `system` |
| `master.ui_density_d` | `compact`, `comfortable`, `spacious` |
| `master.notification_channel_d` | `in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp` |
| `master.notification_digest_frequency_d` | `hourly_digest`, `daily_digest`, `weekly_digest` |
| `shared.ref_status_d` | used by notification preference for `active` / `deprecated` |

NULL `frequency_code` means immediate/default delivery. It is intentionally
not represented by an `immediate` lookup value.

## Extensible registry codes

These fields remain normalized text rather than PostgreSQL enums:

- `principal_ui_preference.preference_code`
- `principal_ui_preference.surface_code`
- `principal_notification_preference.event_code`

Their values are product/module-owned and will grow as capabilities are added.
The database enforces lowercase structured-code formats; the application
registry owns whether a specific code is currently supported. This prevents a
database enum migration for every new UI surface or notification event.

No new generic `control.lookup_domain` or `control.lookup_value` dependency is
introduced into the clean three-plane foundation.

## Legacy value contraction

Legacy role-shaped principal types are authorization concerns:

| Legacy value | New principal type | Additional authority |
|---|---|---|
| `tenant_user`, `tenant_admin`, `partner_user`, `partner_admin`, `platform_staff`, `product_owner` | `user` | Authz role/membership |
| `support_user` | `support` | Time-bounded support authorization |
| `integration_user` | `integration` | Explicit integration grants |
| `service_account` | `service_account` | Service-account grants |
| `bot`, `system` | `bot` | Reserved platform policy where applicable |

Legacy provisioning sources map as follows:

| Legacy value | New value |
|---|---|
| `internal`, `local`, `provisioned` | `internal` |
| `oidc_jit`, `saml_jit`, `support_jit`, `invite_jit`, `sso` | `jit` |
| `scim` | `sync` |
| `import` | `import` |
| `api` | `api` |

These mappings belong to the later data-migration script; the desired-state
DDL contains only the contracted values.
