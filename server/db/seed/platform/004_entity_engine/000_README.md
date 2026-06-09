# Entity Engine Seed Relocation

Entity engine control-table seeds were consolidated into table-owned files under:

```text
platform/003_control/
```

This folder is intentionally left without executable SQL files. Add new platform entity-engine metadata to the matching `control.*` table file in `003_control`.
