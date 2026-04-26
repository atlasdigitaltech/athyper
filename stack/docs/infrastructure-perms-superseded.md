# ⚠ SUPERSEDED

**This document is obsolete and must not be followed.**

It described a single-root deployment model (`/opt/athyper/`) with environment variables `ATHYPER_REPO`, `ATHYPER_CONFIG`, `ATHYPER_DATA`, and `ATHYPER_ENV_FILE` that no longer exist. The systemd unit it documented had only three `Environment=` lines and used `WorkingDirectory=/opt/athyper/repo` — all of which contradict the current architecture.

## Current authoritative reference

**[`stack/docs/INFRA_MASTER_PLAN.md`](INFRA_MASTER_PLAN.md)** — two-root layout, six runtime root vars, correct systemd unit, current permission model. This is the document to follow for all staging and production deployments.

## What changed

| Old (this document) | Current (INFRA_MASTER_PLAN.md) |
|---------------------|-------------------------------|
| `/opt/athyper/repo` (git checkout) | `/opt/products/athyper/` (git checkout) |
| `/opt/athyper/config` | `/opt/stack/athyper/config` |
| `/opt/athyper/data` | `/opt/stack/athyper/data` |
| `ATHYPER_REPO`, `ATHYPER_CONFIG`, `ATHYPER_DATA`, `ATHYPER_ENV_FILE` | `ATHYPER_PRODUCT_ROOT`, `ATHYPER_CONFIG_ROOT`, `ATHYPER_DATA_ROOT`, `ATHYPER_LOG_ROOT`, `ATHYPER_SECRETS_ROOT`, `ATHYPER_BACKUP_ROOT` |
| 3 `Environment=` lines in systemd unit | 6 `Environment=` lines in systemd unit |
| Single-root `/opt/athyper/` | Two-root: products at `/opt/products/`, runtime state at `/opt/stack/` |
