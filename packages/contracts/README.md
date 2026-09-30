# Shared application contracts

`packages/contracts` publishes `@athyper/contract-*` packages consumed by the
application and platform layers. These define shared browser-safe payloads and
presentation contracts, organized by plane and shared concern. They are not a second
copy of the server's service ports.

`server/packages/contracts` publishes `@athyper/server-contract-*` packages. Those
are backend domain contracts, repository ports, and provider-neutral boundaries;
implementation belongs in server adapters, platform packages, and services.
See [server contract ownership](../../server/packages/contracts/README.md).
Choose the contract owner by the boundary being defined, not by the directory name.
Apps must use declared workspace exports and must not import server implementations.
