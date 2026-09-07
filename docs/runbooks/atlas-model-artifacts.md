# Atlas local model acquisition and offline restore

Status: completed on 2026-09-07. Downloaded and verified all five referenced blobs; pinned manifest `sha256:500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`. Metadata reports 8.2B parameters, GGUF Q4_K_M, and 5,225,388,164 bytes. Ollama 0.33.3 runs the model entirely on the GPU at context 4,096. The private serving instance passed generation readiness, and a deliberately wrong digest was rejected.

The offline restore passed at **2026-09-07T04:51:18.557683+00:00**: the archived image and model were restored into a fresh volume, the full digest matched, and the model answered `2 + 2` with `4` with thinking disabled. No model pull or image pull occurred. The temporary container and volume were removed. Backup and receipt: `~/.athyper/backups/atlas-models-20260907/` (about 8.4 GiB). Nine Node tests and three Python tests pass.

The deployment uses `qwen3:8b` internally and records the public identity **Atlas RE 1.0 Local** (`atlas-re-1.0-local`). Model weights, Docker image archives, and backup receipts stay outside Git. The checked lock is `deploy/config/atlas/model-lock.json`; the serving policy is `deploy/config/atlas/local-inference.json`.

## Reproducibility

The lock records the full model-manifest SHA-256, every referenced artifact digest and size, parameter size, quantization, exact model template and its hash, bundled license text and upstream license reference, model capabilities and metadata, acquisition time, official Ollama image digest/version/platform/image ID, Git HEAD and working-tree state, and the exact serving-configuration SHA-256.

The locked request policy is context 4,096, maximum output 1,024, and thinking disabled. These are request settings; the eventual application adapter must enforce them for generation. The readiness check uses a smaller bounded output. This phase does not enable application chat or tools.

Initialization through `local-atlas-inference.mjs up` or `recreate` checks the installed model against the configured full digest and runs a bounded generation probe once a pin exists. It fails on missing or mismatched artifacts. Docker process health remains separate. This initialization check requires the existing DEV API network attachment and mounted checker. Direct Docker/Compose invocation bypasses this operator check; future provider initialization must enforce the same pin before admitting application generation.

`/api/tags` supplies the manifest digest. Both bare hexadecimal and `sha256:`-prefixed representations are accepted from Ollama and normalized to the canonical prefixed lock format. Acquisition additionally hashes the on-disk manifest and every referenced blob, rather than relying only on the tag label.

## Acquisition

For a new, unpinned deployment:

```sh
python3 tooling/scripts/atlas/model-artifacts.py acquire
```

This temporarily enables the bootstrap network, pulls `qwen3:8b`, verifies the artifacts, records the lock, and restores private-only serving in a `finally` block. It refuses to silently replace an existing pin. An interrupted acquisition can leave incomplete blob downloads; rerunning an unpinned acquisition resumes Ollama's pull. After a forced termination, restore the private-only configuration immediately:

```sh
node tooling/scripts/verification/local-atlas-inference.mjs up
```

The `record` command verifies and locks an already downloaded artifact without downloading it. It rejects a different existing pin. Model upgrades require an explicit review of the new artifact and lock; a normal service restart never pulls model weights.

## Offline backup and acceptance

Choose a new directory outside the repository with enough space for an uncompressed image archive and model archive:

```sh
python3 tooling/scripts/atlas/model-artifacts.py backup "$HOME/.athyper/backups/atlas-models-20260907"
docker exec athyper-dev-atlas-atlas-inference-1 ollama stop qwen3:8b
python3 tooling/scripts/atlas/model-artifacts.py restore-test "$HOME/.athyper/backups/atlas-models-20260907"
node tooling/scripts/verification/local-atlas-inference.mjs readiness
```

The backup contains:

- `models.tar`: Ollama model manifests and blobs, excluding installation identity/private keys.
- `ollama-image.tar`: the pinned official engine image exported with Docker.
- `model-lock.json` and `local-inference.json`.
- `checksums.json`: SHA-256 checksums of the four files above.
- `restore-receipt.json`: written only after the offline acceptance test passes.

The test validates all archive checksums and required artifact hashes before restoring. It loads the archived Docker image, creates a uniquely named disposable volume, extracts artifacts with `--network=none`, and starts the archived image by immutable image ID with `--pull=never`. Serving joins only the existing internal inference network, with no published ports. The DEV API acts as the HTTP test client.

The restored engine must report the expected version and model digest and answer the arithmetic probe correctly with thinking disabled. The receipt records the response, timing counters, request policy, network isolation, image identity, and backup hashes. Cleanup removes only the disposable test container and volume; the serving volume is preserved. The image is not removed from the shared Docker cache. Loading the archive is tested without pruning that cache or disrupting other services.

Allow sufficient free GPU memory before the restore test: a loaded serving model and restored model may compete for VRAM. The test is intended for a controlled local verification window before application generation is enabled. A single-machine backup protects against an accidental volume deletion, not loss of the host; copy the completed directory to separate storage for disaster recovery.

## Checks

```sh
python3 -m unittest discover -s tooling/scripts/atlas -p 'test_*.py'
node --test tooling/scripts/verification/atlas-inference-readiness.test.mjs \
  deploy/stackctl/tests/atlas-inference-deployment.test.mjs
node tooling/scripts/verification/local-atlas-inference.mjs readiness
```

Sources: [Ollama model-list metadata](https://docs.ollama.com/api/tags), [Ollama Docker storage and GPU configuration](https://docs.ollama.com/docker).
