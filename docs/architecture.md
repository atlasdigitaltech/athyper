# Architecture — athyper Business Operating Framework

## Overview

**athyper** is the central orchestration framework that defines how the atlasdigitaltech ecosystem components interoperate. It establishes the contracts, interfaces, and conventions that **neon**, **mesh**, and **atlas** conform to.

---

## Ecosystem Components

```
┌──────────────────────────────────────────────────────────────┐
│                        athyper                               │
│                Business Operating Framework                  │
│                                                              │
│  Defines: Contracts · Conventions · Orchestration Layer      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │     neon     │  │     mesh     │  │      atlas       │  │
│  │   Platform   │  │   Network    │  │    AI Agent      │  │
│  │              │  │              │  │                  │  │
│  │ - Runtime    │  │ - Messaging  │  │ - Intelligence   │  │
│  │ - Services   │  │ - Routing    │  │ - Decisions      │  │
│  │ - APIs       │  │ - Events     │  │ - Automation     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### athyper — Business Operating Framework

- Defines the shared data models and interface contracts
- Orchestrates lifecycle events across components
- Provides configuration management
- Establishes versioning and compatibility guarantees

### neon — Business Operating Platform

- Hosts and runs business services
- Exposes APIs consumed by mesh and atlas
- Manages state and persistence

### mesh — Business Operating Network

- Handles inter-component and external communication
- Routes events, messages, and requests
- Manages service discovery

### atlas — Business Operating AI Agent

- Provides AI-driven decision support
- Automates business workflows
- Integrates with neon (data) and mesh (communication)

---

## Design Principles

1. **Framework-first** — athyper defines contracts; components implement them
2. **Loose coupling** — components communicate via mesh, not direct calls
3. **Convention over configuration** — sensible defaults, extensible where needed
4. **Semantic versioning** — breaking changes require major version bumps
5. **Observability** — all components emit structured logs and events

---

## Integration Interfaces

> To be defined as the framework evolves.

| Interface          | Direction       | Description                       |
| ------------------ | --------------- | --------------------------------- |
| `FrameworkContext` | athyper → all   | Shared config and runtime context |
| `PlatformAdapter`  | neon → athyper  | Platform capability registration  |
| `NetworkAdapter`   | mesh → athyper  | Network routing registration      |
| `AgentAdapter`     | atlas → athyper | AI capability registration        |

---

## Directory Structure

```
athyper/
├── src/
│   ├── core/           # Framework core — context, lifecycle
│   ├── interfaces/     # Shared interface definitions
│   ├── config/         # Configuration schema and loader
│   └── utils/          # Shared utilities
├── tests/
│   ├── unit/
│   └── integration/
└── docs/
    └── architecture.md (this file)
```

---

## Versioning Strategy

| Version Range | Status                               |
| ------------- | ------------------------------------ |
| `v0.x.x`      | Development / pre-release            |
| `v1.0.0`      | First stable release                 |
| `v1.x.x`      | Stable, backwards-compatible updates |
| `v2.0.0+`     | Breaking changes                     |

---

## Decision Log

| Date       | Decision           | Rationale                             |
| ---------- | ------------------ | ------------------------------------- |
| 2026-03-04 | Repository created | Base version `v0.1.0` established     |
| 2026-03-04 | MIT License chosen | Open, permissive for ecosystem growth |

---

_Last updated: 2026-03-04_
