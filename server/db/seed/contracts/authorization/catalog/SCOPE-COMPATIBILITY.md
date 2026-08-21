# Exact scope compatibility

Each plane owns one deny-by-default `scope-compatibility.v1.json`. Every
catalog permission lists the only scope-kind and propagation coordinates at
which it may be granted. A missing permission or missing coordinate denies.

- Studio: tenant, workspace, module, resource
- Neon: tenant, company code, legal entity, operating organization, resource
- Mesh: tenant, network account, network relationship, resource

Tenant, resource, and network-relationship scopes are exact. Operating
organization scope uses explicit subtree propagation. `member_companies` and
`relationship_participants` may be published only after their resolvers and
live qualification cases exist.

The pack applicator suspends undeclared compatibility rows and activates only
the reviewed contract. It never widens a missing coordinate. Use the
authorization scope build/check commands to regenerate and verify all three
scope contracts and packs.
