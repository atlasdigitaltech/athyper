# G3 MESH registration and relationship capability — start report

**Status:** In progress  
**Date:** 2026-09-03

The first G3 construction slice adds a genuine `mesh.network_relationship_capability` child rather than capability flags or unbounded relationship metadata. Capability episodes have bounded capability codes, effective ranges, versions, approval coordinates, bounded routing policy and non-overlap enforcement. Requested rows cannot satisfy the active-state approval invariant and the runtime role receives read access only.

Relationship kinds now reference `mesh.network_relationship_kind`; `commercial` is the current canonical kind. Account commodity capabilities also receive canonical active-period non-overlap enforcement.

The executable readiness matrix is `server/db/ddl/planes/mesh/governed-lifecycle-g3-readiness.v1.json`. It keeps the supported-upgrade migration, capability commands, bounded registration exchange, discovery restriction, and live scenario certification explicitly open.

No access resolver has been changed to trust the new table yet. That is intentional: capability state must remain non-authorizing until the command/evidence/outbox slice and bilateral live probes land together.
