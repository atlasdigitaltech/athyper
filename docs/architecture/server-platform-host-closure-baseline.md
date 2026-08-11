# Server Platform Host closure baseline

Captured: 2026-08-10  
Branch: `refactor/three-plane-packages`  
Commit: `951299c22c366c153055d8f3515da2c54211c614`

## Source preservation

- `server-backup` file count: 2,059.
- Tracked files physically below `server-backup`: 0.
- Committed `server/` blobs at the baseline commit: 2,059.
- Byte-identical `server-backup` files recoverable from the committed `server/` tree: 2,059.
- Changed or missing files: 0.
- Committed server tree: `19f29f3331c0c66a61fc1c099b295eabee354c4a`.

The preserved implementation is therefore recoverable with:

`git archive 951299c22c366c153055d8f3515da2c54211c614 server`

The archive contains the source under `server/`; a restore procedure may rename that extracted directory to `server-backup` outside the active worktree. This record does not authorize deletion of the current backup.

## Workspace baseline

- Node: `v24.15.0`.
- pnpm: `10.33.0`.
- Server manifests found outside generated dependency/build folders: 68.
- One duplicate package name is an intentional Publication runtime-contract test fixture, not an active workspace member.

## Worktree protection

The baseline worktree is intentionally dirty and contains broad user-owned server reconstruction, DDL, policy, documentation, and workspace changes. Closure work must remain path-scoped. Clean-checkout qualification must use CI or a separate temporary worktree at a committed candidate revision; it must not reset, clean, or stash this worktree.
