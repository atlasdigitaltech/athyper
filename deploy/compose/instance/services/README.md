# Instance service ownership

This directory is the target boundary for environment-neutral Stack v2 service
fragments. The active foundation remains in `../compose.yaml` until the
controller can render Compose `include` graphs on every supported Compose
version. New core services must be added here instead of enlarging the base
file, then registered in the catalog and Compose policy tests.

The intended split is database, IAM, cache, object storage, gateway, and
applications. Files in this directory may not declare a project name, explicit
normal network/volume name, host-wide container name, or host port.
