# Meta-entity metadata rollback

Owner: Metadata Platform. Entity-owner approval is required.

1. Identify current and previous `entity_version_id`, compiled hash, overlay hash, and affected planes.
2. Shadow-compile the previous version against the current handler registry. Stop on missing storage, handler, lifecycle, relation, or stable-sort bindings.
3. In one publication transaction, activate the previous known-good version and write an exact `log.descriptor_cache_invalidation` row.
4. Confirm exact `execdesc:gen:v1` increments and `execdesc:invalidate:v1` publication.
5. Verify `X-Descriptor-Hash`, runtime bootstrap parity, two-tenant isolation, and permission revocation with warm caches.

Healthy convergence is under 5 seconds p99; polling recovery is under 35 seconds. Never edit a serialized payload in Redis or use wildcard deletion. If publication is unavailable, stop writes for the affected entity instead of bypassing activation.
