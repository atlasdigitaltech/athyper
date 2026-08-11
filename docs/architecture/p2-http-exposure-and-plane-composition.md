# P2 HTTP exposure and plane composition

Status: implemented adapter baseline; conditional composition remains fail-closed.

## Public HTTP product contracts

| Domain | HTTP status | Runtime condition |
|---|---|---|
| Collaboration | Public adapter implemented | Registered only when a plane metadata database is available. |
| Integration management and inbound webhooks | Public adapter implemented | Studio database, secret store, and jobs runtime are all required. Delivery job registration is part of the same composition branch. |
| Atlas | Public adapter implemented | Host registration remains disabled until durable thread/run/usage/proposal repositories, admission policy, model bindings, credentials, and at least one provider adapter are configured. |
| Master data contacts, addresses, and owner profile | Public adapter implemented | Host registration remains disabled until a plane-local repository and signed evidence verifier are configured. Authorization, audit, and outbox remain mandatory service dependencies. |
| Studio onboarding reconciliation | Public adapter implemented | Host registration remains disabled until the Studio case repository and authenticated target-plane command transport are configured. The route has a distinct authorization gate. |

Reference-data imports, taxonomy crosswalks, classification assignments,
entitlement evaluation, and feature availability remain internal building blocks.
Their current packages contain validation/evaluation functions, not durable
repositories with authorization, audit, outbox, concurrency, or publication
semantics. They must not be presented as public mutation APIs until those
authority services exist. This is an explicit fail-closed classification, not
an assertion that the capabilities are intentionally internal forever.

## Plane composition

- Studio is the control and authoring authority. It owns onboarding desired
  state, metadata authoring, publication, and cross-plane reconciliation. It
  sends authenticated, idempotent commands and never writes another plane's
  database.
- Neon is the enterprise runtime/data plane. It owns enterprise business
  records and plane-local authorization, audit, and outbox state. It consumes
  verified Studio projections and provisioning commands.
- Mesh is the partner-network runtime/data plane. It owns network accounts,
  relationships, exchange envelopes, and plane-local authorization, audit, and
  outbox state. It consumes verified Studio projections and provisioning
  commands.

Registration and availability are separate facts. Every adapter above must be
reported as `unconditional`, `conditional`, or `not registered`, with a
separate deployment-profile availability result. Exporting an adapter alone is
not evidence that the endpoint is available.
