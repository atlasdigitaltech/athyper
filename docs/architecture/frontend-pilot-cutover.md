# Frontend spine pilot cutover

The active Neon, Mesh, and Studio applications are spine-only compositions. The backup trees are retained solely as operational reference and rollback source for the previously deployed frontend; they are not workspace packages, build inputs, imports, runtime mounts, or deployment artifacts.

Pilot promotion order is Neon, Mesh, then Studio. For each plane, qualify the standalone build, `/livez`, `/readyz`, authentication redirect/callback/session flow, experience bootstrap, permitted landing route, mobile and desktop shell, logout, and a direct forbidden deep link. Promote the new deployment only after those checks pass against the plane's realm and database.

Rollback changes the deployment target back to the previous immutable frontend artifact. It does not start an application from `apps-backup` or `packages-backup`, and it does not alter the active workspace graph. Session cookie compatibility must be evaluated before promotion; when incompatible, increment the configuration revision and require a fresh login.
