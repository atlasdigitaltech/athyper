# Dependency rules

1. Entrypoints invoke launch policy. They do not implement entity-specific APIs.
2. Launch policy validates the process role before dynamically importing its
   runtime. Bootstrap validates the deployment profile before constructing resources.
3. Kernel orchestration owns registration order. The module registry uses literal
   loaders; metadata never supplies arbitrary module paths.
4. Composition wires packages through explicit contracts. Shared entity code must
   not gain product-specific cases merely to onboard a table or read model.
5. Space-specific compatibility bindings keep their domain names. They must not
   become an alternative Entity list/detail/provider stack.
6. Server authorization and locked collection/record scope remain mandatory.
   Source moves must preserve the existing admission and authorization bindings.
7. Foundation lifecycle primitives stay in foundation. Host modules should not
   duplicate them or add forwarding layers without a concrete responsibility.
8. Source moves include imports, dynamic imports, test source paths, executable
   commands, and Docker smoke checks. Historical inventory reports remain dated
   evidence, not authoritative maps of the current tree.

These are ownership rules, not a claim that the existing dependency graph is fully
separated. Compatibility registrars still combine capabilities; development
publication is still wired by the compatibility service root, and provenance
recovery still uses its configuration type. The container still knows existing
capabilities. Extract these dependencies incrementally with behavioral coverage
before enabling isolated deployment profiles.

Naming review does not justify deleting existing apps, changing published keys,
or creating generic-looking wrappers around domain-specific behavior.


Resource registrars must not import combined host registrars or eagerly import
other resource registrars. The combined adapter coordinator is the place where
resources are ordered. Factory contracts use type-only imports. Shared identity
authority must not import host routes or Studio administration. Executable source
import-boundary tests cover these constraints; they do not claim package-level
bundle isolation.

Database access added for coordination is not worker or writer authority. Keep
workload credentials and authorization-writer pools restricted to served planes.
Each independently selected resource must register its cleanup when it is
constructed; a failure in later composition must not leave earlier resources
without cleanup ownership.


Shared Entity service and HTTP composition must not import the host container,
combined registrars, development helpers, or space packages. Pass metadata
readers, authorization, transactions, scope resolvers, presentation callbacks,
mutation policies, and import adapters through explicit ports. Publication and
HTTP must use the same service instances. Route extraction must not replace
server-derived parent constraints with caller-supplied filters.
