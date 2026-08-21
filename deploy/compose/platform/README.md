# Shared Stack v2 ingress

This Compose project is the sole owner of workstation ports 80 and 443. Start it
with project name `athyper-platform` before any instance project. It creates the
deliberately shared `athyper-platform-ingress` network; only instance gateways
may attach to that network.

Required untracked files:

```text
~/.athyper/platform/secrets/tls.crt
~/.athyper/platform/secrets/tls.key
```

The certificate must cover the approved `*.dev.athyper.test`,
`*.qa.athyper.test`, and `*.stg.athyper.test` names. Keep the private key mode
0600. The platform ingress uses only Traefik's file provider and never receives
the Docker socket.

The platform project has a longer lifecycle than instances: start it first and
stop it only after all attached instance projects are down.
