# `@athyper/platform-communications-notifications-client`

Shared notification inbox, settings, live stream, and browser-push client for
Neon, Mesh, and Admin.

Each authenticated app:

1. Adds `@athyper/platform-communications-notifications-client` as a workspace dependency and
   transpiled package.
2. Creates a `NotificationsClientConfig` with its fixed `PlaneKey`, shared
   `bffFetch`, and router navigation callback.
3. Mounts `NotificationStreamProvider` once inside the authenticated shell.
4. Renders `NotificationsInbox` and `NotificationsSettingsSection`.
5. Runs `service-worker/sync-sw.mjs` from `predev` and `prebuild`.

The configured plane scopes browser storage and UI behavior only. Server
authorization always uses the relay-stamped `X-Plane` header. The package must
never import server routes, database clients, or application-private modules.
