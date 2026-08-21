# Tenant authority projection

The clean-slate compiler separates three concerns:

- Keycloak proves identity, client admission, organization selection, and
  assurance. It does not grant business operations.
- plane membership and quarantine group membership admit an identity into an
  exact tenant/plane context;
- reviewed plane-local roles and scope assignments provide future allow
  proofs. The clean-slate packs intentionally contain none.

The generated projection retains deterministic `plane_membership`,
`scope_target`, `principal_group`, and `group_member` rows. It emits zero
`role`, `role_permission`, and `group_role` rows. Business resources such as
legal entities and Mesh network accounts are provisioned from lifecycle
contracts, not inferred from role scopes.

When role bundles are introduced, definition rows and assignment rows remain
separate. Every grant must reference an exact catalog permission ID and every
group-role assignment must reference an explicit compatible scope target.
Missing references fail compilation.

Use the tenant-authority build command to regenerate all three packs and the
matching check command to reject catalog, admission, scope, or pack drift.
