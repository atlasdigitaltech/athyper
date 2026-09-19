# Development storage console

Open <https://objects.dev.athyper.test/console/> and sign in as `admin`.
The password is in the owner-only file
`~/.athyper/instances/dev/secrets/storage-console-password` on the development host.
This is a separate console credential, not the S3 access key or an Athyper SSO login.

Select **Buckets**, then a bucket name. Use **Upload** to add a file and the
download action on a file row to save it locally. The console is a SeaweedFS
administrator interface; changes affect the real development storage.
Browser uploads are limited to 100 MiB per request. Use an S3 client for larger
transfers.

The S3 endpoint remains <https://objects.dev.athyper.test>. Browser navigation to
its root displays an information page with a console link. S3 clients continue
to use signed requests. `/console` is reserved for the console, so do not create
a bucket with that name.

## Deployment

The opt-in `deploy/compose/instance/compose.storage-console.yaml` overlay adds
the console to the local instance Compose configuration. Supply it alongside
the instance's existing Compose files and image/environment bindings, and start
`storage-console`. DEV gateway routing already includes `/console/`.

Before first startup, create a strong random password in
`$ATHYPER_RUNTIME_ROOT/instances/dev/secrets/storage-console-password`, mode `0600`,
owned by the configured runtime UID. The startup script refuses an empty password.
Password values are read inside the container, not placed in Compose environment
metadata or command-line arguments. Restart the console after changing the file.

The console shares the object-storage container's network namespace so that
master, filer and volume endpoints remain on private loopback. It publishes no
host ports. If storage is recreated, recreate `storage-console` too so it joins
the new network namespace. Console state is ephemeral; recreating it invalidates
sessions and resets console settings, while storage data stays in its existing
volume. No automatic maintenance workers are deployed by this overlay.

The console is deliberately opt-in for local administration. QA and staging
routes do not expose it.

## Verification

With the DEV console running:

```sh
ATHYPER_STORAGE_CONSOLE_TESTS=true node --test deploy/compose/tests/storage-console.integration.test.mjs
```

This browser test checks rejected login, authenticated bucket browsing, secure
session cookies, upload/download content, and denied anonymous downloads. It
removes its temporary uploaded file afterward.
