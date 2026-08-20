# Projection write ownership

Plane-local projection tables are not seed or ordinary administrator write
surfaces. Their five-table boundary is:

- `authz.application_projection`
- `authz.projection_provider`
- `authz.projection_scope`
- `authz.entity_operation_binding`
- `authz.entity_operation_scope_binding`

## Roles

`athyper_projection_reconciler` is a `NOLOGIN`, `NOBYPASSRLS` Studio-side
privilege role. The Studio worker credential inherits it to claim exact desired
versions/hashes, record fenced observations, write durable dead letters, and
emit the narrowly constrained reconciliation alert. It has no plane-local
projection table DML.

`athyper_projection_applier` is a `NOLOGIN`, `NOBYPASSRLS` privilege role for
the reconciliation worker. It receives `SELECT` and `EXECUTE` only. It cannot
insert, update, or delete projection rows directly.

`athyper_projection_owner` is a `NOLOGIN`, `NOBYPASSRLS` role that owns the
`SECURITY DEFINER` mutation APIs. RLS permits this role to mutate projection
tables. It is not granted to the application, applier, jobs, or ordinary admin
roles.

The Studio worker login inherits both `athyper_projection_reconciler` and
`athyper_projection_applier`; Neon and Mesh worker logins inherit only
`athyper_projection_applier`. Role membership is provisioned outside DDL.

`athyper_projection_breakglass` is a `NOLOGIN`, `NOBYPASSRLS` direct repair
role. The DDL grants it table access but grants membership to nobody. A database
operator may receive it only through an externally approved, time-bounded,
audited repair procedure. Membership must be revoked immediately after repair.

## Mutation APIs

- `authz.fn_stage_application_projection` validates and atomically stages the
  application projection, provider rows, and scope ceilings. Source projection
  ID, version, and hash form its replay/conflict boundary.
- `authz.fn_activate_application_projection` performs serialized atomic
  rollover.
- Entity-operation stage, activate, retire, and restore functions remain the
  only compiler-projection mutation path.

Ordinary `athyperadmin` retains read access for diagnosis but receives neither
projection write policies nor projection mutation-function execution. Direct
DDL remains a database-owner deployment responsibility and is not a runtime
repair mechanism.

The live authorization release gate verifies role attributes, table ACLs,
forced RLS, policy roles, mutation-function ownership, row provenance, and
mapped-user parity in every plane. In a rolled-back transaction it also assumes
the actual applier and admin roles to prove that applier table DML is denied,
applier API execution reaches payload validation, and both admin mutation paths
are denied. The admin validation connection must therefore be a deployment or
audit credential allowed to `SET ROLE` to both privilege roles.
