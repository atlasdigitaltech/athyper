# Stage 5 deployment qualification

## Patched development run — 2026-09-12

**The oversized-ZIP blocker is resolved for the tested fixtures in the patched
development image.** [Captured qualification](virusscan-stage5-patched-20260912.json)
passes live 100 MiB/400 MiB/17-depth limit checks, isolated stored/deflate/bzip2
boundaries, a harmless marker beyond the extraction limit, signature recovery,
live reload and network checks. Stored ZIP headers count toward the outer file
limit. Deflate64 and implode still need dedicated fixture coverage.

The image is `athyper/clamav:1.5.2-zip-limit-1`; see the
[patch and build notes](../../deploy/config/virusscan/README.md). Only the development
scanner was recreated. The base/source are pinned, but the custom release image
has not been published or pinned by output digest for other environments.
This run has no published host port, and clamd listens on both `data` and
`signature-egress`; tested `app` and `edge` peers cannot connect to either interface.
It is development evidence, not production certification.

The ZIP patch does not address the separate compressed-PDF engine behavior.
The corrected adapter compensating control now passes the
[deployed Stage 6 matrix](virusscan-stage6.md); remaining scope restrictions and
workflow qualification boundaries are documented there.

## Historical upstream-image run — 2026-09-11

**Not qualified: an oversized ZIP member can still receive `stream: OK`.**
The deployment hardening and repeatable checks below are implemented, but the
incomplete-inspection acceptance criterion remains blocked. Do not mark Stage 5
complete based on passing adapter tests.

Evidence: [machine-readable local run](virusscan-stage5-local-20260911.json).
Runner: [qualify-virusscan.py](../../tooling/scripts/verification/qualify-virusscan.py).

## Changes and results

| Acceptance item            | Result                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loaded-signature reload    | Live official DB reload completed, with VERSION and daemon completion log recorded; revision remained 28119. No new CDN revision is claimed.                                                                                             |
| Stale admission recovery   | An isolated real 1.5.2 daemon with an unsigned test CUD database transitioned from stale revision 900001 / rejected scan to fresh revision 900002 / healthy and clean. Revision 900003 loaded through SelfCheck without RELOAD.          |
| Notification investigation | The image starts FreshClam before clamd. The earlier missing `/tmp/clamd.sock` notification is consistent with that startup race; socket paths match once started. Earlier dev history also showed a subsequent successful notification. |
| Recovery configuration     | Pin SelfCheck to 60 seconds and FreshClam to 24 checks/day. The isolated recovery test uses SelfCheck=1 for speed; the live daemon confirms SelfCheck=60.                                                                                |
| Runtime alignment          | Three running local host process environments resolve to maxBytes=104857600, upload limit=100 MiB, timeout=30000 ms, freshness max age=172800000 ms and refresh interval=300000 ms. PING succeeds at their configured endpoint.          |
| Inspection configuration   | Pin StreamMaxLength=100M, MaxFileSize=100M, MaxScanSize=400M, MaxRecursion=17, and AlertExceedsMax=yes. The actual effective configuration is recorded.                                                                                  |
| Expanded size / recursion  | Fully submitted compressed fixtures produce `Heuristics.Limits.Exceeded.MaxScanSize` and `Heuristics.Limits.Exceeded.MaxRecursion`, both blocked by the existing infected-result path.                                                   |
| Oversized ZIP member       | **FAIL:** a member of 104857601 bytes returns `stream: OK` despite MaxFileSize=100M and AlertExceedsMax=yes. Separate live probes at 101 MiB and 120 MiB reproduced it.                                                                  |

The custom CUD database is mounted only in an ephemeral qualification container;
it is never installed in the live signature volume. This establishes reload and
admission behavior, not verification of official database signatures or CDN delivery.

## Actual topology

The environment switched from the containerized `dev` stack to the host-process
`local` stack during this work. The final captured run is local qualification,
not production certification.

The base parity service publishes no port. The active **local override publishes
3310 only on 127.0.0.1:31162**, used by local host runtimes. clamd listens on all
container interfaces. Peers on `data`, `signature-egress`, and the local override's
`local-host` network can reach the corresponding scanner interface. Probes from
`app`, `edge`, and `ops` must fail against every scanner interface. The host itself
can also reach bridge IPs; this is not host isolation.

`signature-egress` is a dedicated outbound network, not a signature-server
allowlist and not a restriction to FreshClam alone. No production isolation claim
is made. Repeat the checks against the deployed production topology separately.

## Remaining blocker

`AlertExceedsMax` is useful but insufficient for the oversized ZIP-member case.
The isolated test detects a harmless custom marker at the start of a ZIP member
(`Qualification.Marker.UNOFFICIAL FOUND`) but returns `OK` with the same marker
beyond the 1 MiB extraction limit. This confirms missed inspection in that case.
ClamAV 1.5.2's [ZIP extraction implementation](https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.2/libclamav/unzip.c#L218)
trims extraction when output exceeds MaxFileSize. That code is consistent with
the observed clean response; it does not prove every archive format behaves alike.
The [documented limit-alert policy](https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.2/etc/clamd.conf.sample)
does not replace testing the effective engine behavior.

Closing this blocker requires a verified engine fix or a bounded archive-admission
gate covering the formats the platform accepts. Do not merely loosen a limit,
replace the failing fixture, or treat the existing OK response as proof of full
inspection. The runner deliberately exits nonzero and saves `passed: false` until
the oversized-member case is blocked. Other format-specific inspection limits are
not comprehensively certified by these three fixtures.

Stage 3's previously identified cleanup/concurrency work and integrated document
workflow qualification are separate from these Stage 5 changes.

## Reproduce

Requires Linux Docker access, Python 3, workspace pnpm/tsx dependencies, and a
running scanner using the Compose policy. The runner makes temporary containers,
submits compressed inspection fixtures, and requests a live reload of the existing
database; run against a development environment. It does not alter live signatures.
Expanded fixture data is roughly 480 MiB, so allow memory and CPU headroom.

For the default containerized dev stack:

```sh
python3 tooling/scripts/verification/qualify-virusscan.py \
  --output /tmp/virusscan-qualification.json
```

For host-process local development, substitute the actual scanner name and live
API/worker process PIDs (the stable tsx watch parent environments also work):

```sh
python3 tooling/scripts/verification/qualify-virusscan.py \
  --container athyper-local-2a7d2dadf3eb-virusscan-1 \
  --clients --host-pids 380631 380636 380641 \
  --allow-loopback-publication \
  --output /tmp/virusscan-qualification.json
```

The loopback option permits only explicit 127.0.0.1/::1 publication. The runner
imports application configuration with the selected process environment and records
only malware settings and upload size, never the full environment.

Validation: **47 adapter tests and 21 deployment model tests passed**, including
three new limit-response cases; adapter typecheck passed. An initial concurrent run failed one existing wall-clock
deadline assertion (786 ms against 600 ms); a subsequent run passed without changing
that test. Live qualification remains a deliberate failure as explained above.
