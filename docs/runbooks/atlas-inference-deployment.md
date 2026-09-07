# Atlas isolated local inference deployment

Status: deployed and verified on 2026-09-07. All eight targeted tests pass. The API reaches Ollama 0.33.3 with HTTP 200; forced recreation preserved volume data; the private network contains only the DEV API and inference container; DEV/QA readiness remains HTTP 200. Model acquisition subsequently completed: generation readiness now passes with the pinned model. See [artifact lock and offline restore](atlas-model-artifacts.md).

This deployment runs the official Ollama engine as `atlas-inference` in the separate `athyper-dev-atlas` Compose project. The application-facing identity is **Atlas RE 1.0 Local**, ID `atlas-re-1.0-local`; the pinned upstream model is `qwen3:8b`.

## Configuration

- Image version and immutable digest: `deploy/config/atlas/local-inference.json`.
- Serving configuration: `deploy/compose/atlas/compose.yaml`.
- Persistent volume: `athyper-dev-atlas_atlas-models`, mounted at `/root/.ollama`.
- Private network: `athyper-dev-atlas_inference`, declared `internal: true`.
- Internal service endpoint: `http://atlas-inference:11434`.
- No host ports, gateway routes, or normal-serving egress network.
- NVIDIA GPU reservation, 10 GiB host-memory ceiling, four-CPU limit.
- Cloud disabled, one loaded model, one simultaneous generation, bounded queue of eight, five-minute keep-alive, initial context 4,096.

The DEV API joins this network through its existing owner-local `local-atlas.compose.json` overlay. Existing image, environment, secrets, and network connections are preserved. The overlay also mounts the policy and model-readiness probe read-only. The existing deployment controller retains this overlay on API redeployments. The inference project is managed separately by the commands below; it is not implicitly added to QA or other environments.

## Process health and generation readiness

Docker health runs `ollama list`. This checks whether the engine API responds; it intentionally passes with an empty model volume.

The separate generation probe checks:

1. Correct engine version.
2. Exact expected model installed.
3. Full expected model digest recorded and matching.
4. A successful bounded inference request using that model.

It returns JSON with `processReady`, `generationReady`, and a reason code. Exit code 1 means generation is unavailable; it does not mean the engine process is unhealthy. Before the model is downloaded, the expected reason is `model_not_installed`. Merely downloading an unpinned model produces `model_not_pinned`. A wrong digest is rejected.

The probe is an explicit operator check, not a frequent application liveness check. It may take up to 120 seconds to load and probe an installed model. It does not change the general API `/readyz` contract or enable Atlas chat; provider/runtime integration is a later phase. No frontend model selector is changed by this deployment.

Ollama's output count and thinking mode are request options, not global server environment limits. The checked policy and reusable request builder record/enforce `num_predict <= 1024`, `num_ctx = 4096`, and `think = false` for requests made through that builder. The readiness probe uses a one-token output limit. The future Atlas adapter must use the same policy for actual chat; arbitrary direct engine callers are not constrained by that helper. Only trusted API/network administrators should access the native engine.

## Operations

Run from the repository root:

```sh
node tooling/scripts/verification/local-atlas-inference.mjs up
node tooling/scripts/verification/local-atlas-inference.mjs attach-api
node tooling/scripts/verification/local-atlas-inference.mjs status
node tooling/scripts/verification/local-atlas-inference.mjs readiness
node tooling/scripts/verification/local-atlas-inference.mjs recreate
```

`up` and `recreate` load the immutable image reference from the checked configuration. `attach-api` checks for image/environment drift before replacing only the DEV API. It retains all recorded Compose overlays. `recreate` replaces only inference and preserves its volume.

## Temporary downloads

`compose.bootstrap.yaml` is a separate explicit overlay that adds outbound connectivity for artifact acquisition. It is not included by normal lifecycle commands and was removed after the completed model acquisition. During the subsequent model-download phase, use it only for the pull/verification operation, then recreate with serving configuration alone. Verify the bootstrap network is detached before normal serving. Disabling cloud features does not itself prevent registry downloads; the serving network provides the egress restriction.

The full model digest is now recorded in the serving configuration and model lock. Do not replace it with a short model ID or accept a mutable tag as a pin. [Artifact acquisition and restore](atlas-model-artifacts.md) records metadata and offline acceptance evidence.

## Verification and rollback

Tests:

```sh
node --test deploy/stackctl/tests/atlas-inference-deployment.test.mjs \
  tooling/scripts/verification/atlas-inference-readiness.test.mjs
```

Live acceptance verifies API-to-inference DNS/HTTP connectivity, private network membership, no published port, cloud-disabled logs, GPU visibility, persistent sentinel data across forced recreation, generation-not-ready with no model, and unchanged DEV/QA readiness. Receipts are saved below `~/.athyper/instances/dev/receipts/atlas-inference/`.

To stop inference, stop its service without deleting the volume. To remove the API connection, restore the saved local API overlay and recreate only the API with its existing Compose sources. Preserve model data and conversation databases. `docker compose down --volumes` is destructive and is not a normal update or rollback operation.

Sources: [Ollama Docker](https://docs.ollama.com/docker), [Ollama configuration and cloud controls](https://docs.ollama.com/faq).
