# Search key bootstrap

The initializer image includes curl and jq so provisioning works on the internal
`data` network without package downloads. Build it through Compose before deployment.
The master secret is mounted only by Meilisearch and this initializer.

The equivalent explicit Bake target is
`docker buildx bake -f deploy/docker-bake.hcl searchcore-key-init`. It is excluded
from the default application build. CI can override its tags and output to
publish the qualified image, record its registry digest, and deploy that digest
with a Compose override that resets `build` (`build: !reset null`) and sets
`pull_policy: missing`. This prevents the base `pull_policy: build` from rebuilding
the initializer instead of consuming the published artifact.

Provisioning reuses the existing runtime key when actions, indexes and expiration
match. It publishes the key atomically and never prints its value. API, worker and
scheduler must wait for initializer success. Local source startup runs the same
initializer and copies only its scoped key into the private checkout secrets directory.

Permissions cannot be patched in Meilisearch. On policy mismatch the initializer
fails closed. To replace a key, stop all consumers, run the initializer with
`SEARCHCORE_REPLACE_KEY=true` (for example, add `-e SEARCHCORE_REPLACE_KEY=true` to
`docker compose run --rm searchcore-key-init` using the deployment's Compose files),
then recreate consumers to reload the published credential. For managed local source
startup, rerun infrastructure startup after replacement to refresh the host copy.
Replacement creates the new key before revoking the old one. If interrupted between
those operations, duplicate descriptions cause startup to fail closed; an operator
must inspect and resolve the duplicate keys before retrying.

Run the disposable Docker regression from the repository root:

```sh
ATHYPER_SEARCH_BOOTSTRAP_TESTS=true node --test deploy/compose/tests/searchcore.integration.test.mjs
```

It resolves the real Compose images, builds the initializer, runs provisioning twice
on an internal network, and verifies adapter operations, forbidden requests, semantic
index access, and explicit policy replacement. All test containers, networks and data
volumes are removed afterwards. The built initializer image remains cached.
