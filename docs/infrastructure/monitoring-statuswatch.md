# Monitoring Config — statuswatch Source of Truth

`statuswatch` is the stack service name for Uptime Kuma. Uptime Kuma 1.x does not
expose a stable REST API for monitor CRUD. The supported
integration surface is **Settings → Backup / Restore** (JSON). This directory holds
the monitor definitions that should be in place after a clean bring-up of the
`monitoring` profile.

## Files

| File | Environment | Purpose |
|---|---|---|
| `statuswatch-monitors.local.json` | local | Dev probes for `*.athyper.local` (self-signed, TLS verification off) |

Staging and production are not tracked here: operator bring-up follows the same
runbook but substitutes `athyper.local` → `*-stg.athyper.com` / `athyper.com` and
flips `ignoreTls` to `false`. Once configured in the UI, export back via
**Settings → Backup** and commit the resulting file as
`statuswatch-monitors.staging.json` / `statuswatch-monitors.production.json` if
the monitor set diverges from local.

## Format

The file is Uptime Kuma's native backup envelope:

```jsonc
{
  "version": "1.23.x",
  "notificationList": [],   // notifiers (Slack/email) — not tracked here; add via UI
  "monitorList": [ ... ],   // the interesting bit
  "proxyList": []
}
```

Fields used per monitor:

| Field | Notes |
|---|---|
| `name` | Must be unique across the whole list |
| `type` | `http` \| `keyword` \| `port` \| `ping` — we use `http` and `port` |
| `url` | Full URL for `http`/`keyword` probes |
| `hostname` + `port` | Required for `port` probes; Docker-network DNS (e.g. `db`, `memorycache`) works because Uptime Kuma is on the `internal` network |
| `interval` | Seconds between probes. 60 for critical, 120–300 for observability stack |
| `retryInterval` | Seconds between retries after a failed probe |
| `maxretries` | Attempts before the monitor goes DOWN |
| `timeout` | Per-request timeout in seconds |
| `ignoreTls` | `true` in local only — self-signed certs |
| `accepted_statuscodes` | Ranges as strings: `"200-299"` |

## Regeneration loop

After editing monitors via the UI:

1. Open `https://uptime.athyper.local` (local) or the env-specific host
2. Settings → Backup → **Export**
3. Save the downloaded JSON here as `statuswatch-monitors.<env>.json`
4. Commit — the diff is the change

## Runbook

For first boot, open the statuswatch UI, import `statuswatch-monitors.local.json`
through Settings → Backup / Restore, then export the live file back here whenever
operators change the monitor set.

Create two **Push** monitors named `platform worker` and `platform scheduler`.
Copy their complete push URLs into `STATUSWATCH_WORKER_PUSH_URL` and
`STATUSWATCH_SCHEDULER_PUSH_URL`. The corresponding processes send a fail-open
heartbeat every 10 seconds; set each monitor's heartbeat interval to 30 seconds
with at least two retries. Empty URLs disable this integration for local
host-run processes.
