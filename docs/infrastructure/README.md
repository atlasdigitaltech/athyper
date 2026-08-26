# Infrastructure documentation

Stack v2 under `deploy/` is the only supported runtime architecture. Legacy
Compose definitions and lifecycle scripts under `stack/` were retired after DEV,
platform ingress, and shared operations moved to controller-owned projects.

## Start here

| Topic | Document |
|---|---|
| Controller, lifecycle, backup, restore, and telemetry | [Stack v2 foundation](../../deploy/README.md) |
| New machine preparation and qualification | [Stack v2 machine build plan](./stack-v2-new-machine-build-plan.md) |
| Instance/shared workload ownership | [Stack v2 workload placement](./stack-v2-workload-placement.md) |
| Architecture and permission model | [Infrastructure plan](./infrastructure-plan.md) |
| IAM realm assets | [IAM realm configuration](./iam-realm-config.md) |
| IAM protocol mappers | [IAM protocol mappers](./iam-protocol-mappers.md) |
| Kernel configuration | [Kernel configuration reference](./kernel-config-reference.md) |
| Feature parameters | [Feature parameter reference](./feature-parameter-reference.md) |

## Runtime commands

```bash
pnpm athyper doctor
pnpm athyper plan dev
pnpm athyper up dev --confirm dev
pnpm athyper up dev --confirm dev --preserve-database
pnpm athyper operations up lite --confirm lite
pnpm athyper backup dev --confirm dev
pnpm athyper down dev --confirm dev
```

`--preserve-database` is DEV-only and requires a valid existing migration
receipt. It skips the clean-slate migration while retaining controller ownership
and health reconciliation.

The remaining `stack/config` and `stack/env` paths are shared build, realm, and
validation assets. They are not Compose entry points and must not be used to
launch containers.
