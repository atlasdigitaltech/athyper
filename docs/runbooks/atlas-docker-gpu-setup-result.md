# Atlas Docker GPU access — completed 2026-09-07

Phase 0 of the [local inference plan](atlas-local-inference-plan.md) is complete. Ollama installation and model download are subsequent phases and were not performed here.

## Environment and changes

- Distribution: Ubuntu-24.04, Ubuntu 24.04.4 LTS under WSL2.
- Docker context: `default`; daemon endpoint: `unix:///var/run/docker.sock`.
- GPU: NVIDIA GeForce RTX 4080 Laptop GPU, 12,282 MiB VRAM; Windows driver 610.88 remained unchanged.
- Installed `nvidia-container-toolkit`, `nvidia-container-toolkit-base`, `libnvidia-container-tools`, and `libnvidia-container1`, all at version `1.20.0-1`, from NVIDIA's signed stable repository.
- Applied package holds to preserve the tested version. A future toolkit upgrade must explicitly remove these holds, select a version, and repeat the GPU and service-recovery checks.
- Added the `nvidia` runtime in `/etc/docker/daemon.json`; the default remains `runc`.
- Validated daemon configuration and restarted Docker. Existing container images and application configuration were preserved.
- Used the distribution's root execution through `wsl.exe -d Ubuntu-24.04 -u root`; no sudo password or Linux display-driver installation was needed.

The root-only pre-change record is `/root/atlas-gpu-backup-20260907`. Docker daemon configuration, NVIDIA runtime configuration, repository list, and repository key did not exist beforehand; their absence is recorded in `absent-before.txt`. The directory also records previous package state and repository inputs.

## Acceptance evidence

| Check | Result |
|---|---|
| Docker recognizes NVIDIA runtime | Passed |
| GPU computation in disposable container | Passed |
| GPU-versus-CPU numerical comparison | `OK` |
| Previously running containers | All 47 running after restart |
| Containers with health checks | All 44 healthy, matching baseline |
| Containers without health checks | All 3 running, matching baseline |
| DEV API `/readyz` | HTTP 200, healthy |
| QA API `/readyz` | HTTP 200, healthy |
| Existing container image changes | None |

`athyper-dev-secretstore-1` has restart policy `no`; it was explicitly restarted to restore the recorded running state. Other baseline containers recovered automatically.

The CUDA image was resolved and run by immutable digest:

```text
nvcr.io/nvidia/k8s/cuda-sample@sha256:59261e419d6d48a772aad5bb213f9f1588fcdb042b115ceb7166c89a51f03363
```

Computation test, with networking disabled:

```sh
docker run --rm --gpus all --network none \
  nvcr.io/nvidia/k8s/cuda-sample@sha256:59261e419d6d48a772aad5bb213f9f1588fcdb042b115ceb7166c89a51f03363 \
  nbody -benchmark -numbodies=65536
```

The sample identified the RTX 4080 Laptop GPU and completed 10 iterations with 65,536 bodies. Its older architecture-name lookup emitted an SM 8.9 naming warning; actual device detection succeeded. This sample validates CUDA operation, not Ollama token throughput.

Correctness test:

```sh
docker run --rm --gpus all --network none \
  nvcr.io/nvidia/k8s/cuda-sample@sha256:59261e419d6d48a772aad5bb213f9f1588fcdb042b115ceb7166c89a51f03363 \
  nbody -compare -numbodies=4096
```

The comparison returned `OK`; both test containers exited successfully and were removed.

## Receipts and recovery

Owner-readable evidence is stored in `~/.athyper/instances/dev/receipts/atlas-gpu/`: `before.json`, `after.json`, DEV/QA readiness responses before and after, `cuda-compute.log`, and `cuda-correctness.log`.

For rollback, first inspect the current daemon file against the recorded change. Remove only the added NVIDIA runtime configuration, preserving any subsequent settings; delete `daemon.json` only if it still consists solely of that addition. Validate configuration and perform another controlled restart, restoring the recorded running containers. Remove package holds before any intentional package change. Do not uninstall the Windows driver or remove application volumes. The current setup passes acceptance, so rollback is not required.

References: [NVIDIA Container Toolkit installation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), [CUDA on WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html).
