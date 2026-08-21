# Notification plane isolation and trust boundary

Status: accepted for expand rollout

## Decision

`PlaneKey` is the existing `neon | mesh | admin` taxonomy. Notification
messages, push subscriptions, and principal preferences carry `plane_key`.
For a notification message this is the delivery and visibility boundary; it is
not event provenance.

For authenticated BFF traffic, the relay-stamped `X-Plane` header is the sole
plane authority. Notification handlers reject missing or invalid values and
never read a plane from query parameters, request bodies, or cookies.

Internal writers do not synthesize an HTTP header. They must receive a typed
`PlaneKey` from trusted request context or domain provenance and persist it
explicitly. Background processes whose source has not yet become plane-aware
use `neon` only during the expand rollout.

One message belongs to one delivery plane. A product requirement to show the
same event on multiple planes creates one message per plane; no array-valued
audience column is introduced.

## Rollout

The expand release adds `plane_key` with a temporary `neon` default and
backfills existing rows. All readers and writers are upgraded before a later
contract release removes the defaults. The compatibility Neon relay remains
available through that mixed-version window.

## Push and capabilities

A single VAPID key pair is shared across planes. Subscriptions remain isolated
by `plane_key`. The capabilities endpoint has no plane parameter and derives
its response from `X-Plane`; client configuration is never an authorization
input.
