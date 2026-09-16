# Cloudflare Pages deployment: docs-external and docs-internal

Operator runbook for standing up `apps/docs-external` (public) and
`apps/docs-internal` (SSO-gated wiki) on Cloudflare Pages, on the domain
zone already managed in Cloudflare. Requires a Cloudflare account with
access to that zone and to Zero Trust Access.

**Do not enable automatic production deployments on either project until
Step 4 (Access verification) passes.** Deploy the harmless placeholder
manually first.

## 1. Create the two Pages projects

For each app, in the Cloudflare dashboard: Workers & Pages → Create →
Pages → Connect to Git → select this repository.

| Setting | `athyper-docs-external` | `athyper-wiki-internal` |
| --- | --- | --- |
| Production branch | your chosen production branch | same |
| Root directory | `apps/docs-external` | `apps/docs-internal` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @athyper/docs-external build` | `pnpm install --frozen-lockfile && pnpm --filter @athyper/docs-internal build` |
| Build output directory | `dist` | `dist` |
| Environment variable | `NODE_VERSION=24.19.0` | `NODE_VERSION=24.19.0` |

After creating each project: Settings → Builds & deployments → **disable
"Automatic production branch deployments"** for now (preview deployments
on other branches can stay on if useful, since they're covered by the
Access policy in Step 3 too).

### Build watch paths

Settings → Builds & deployments → Build watch paths (include, both
projects — a change to any of these should trigger a rebuild; nothing else
should):

```
docs/**
apps/docs-external/**      (or apps/docs-internal/** for that project)
tooling/scripts/docs/**
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
```

Without the lockfile/workspace/shared-script paths, a change to the
staging pipeline or a dependency bump wouldn't trigger a rebuild — this is
the fix for the earlier review point that flagged watching only the app
directory as insufficient.

## 2. Deploy the harmless placeholder (manual, not git-triggered)

Each app has a `build:placeholder` script
(`tooling/scripts/docs/stage-content.mjs --target <t> --empty`) that
produces a real Starlight build — real Pagefind index, real sitemap — with
zero docs/ content, specifically so Access can be tested against real
artifact shapes before any real content ships. Requires a Cloudflare API
token (`CLOUDFLARE_API_TOKEN` env var, Pages:Edit scope) and
`CLOUDFLARE_ACCOUNT_ID`.

```sh
pnpm --filter @athyper/docs-external build:placeholder
npx wrangler pages deploy apps/docs-external/dist --project-name=athyper-docs-external

pnpm --filter @athyper/docs-internal build:placeholder
npx wrangler pages deploy apps/docs-internal/dist --project-name=athyper-wiki-internal
```

## 3. Custom domains

Pages project → Custom domains → Add:
- `athyper-docs-external` → `docs.athyper.com`
- `athyper-wiki-internal` → `wiki.athyper.com`

Since the zone is already on Cloudflare, the CNAME is created
automatically — no manual DNS edit needed.

## 4. Configure and verify Access on the wiki

`athyper-wiki-internal` only — `athyper-docs-external` is intentionally
public and gets no Access policy.

### 4a. Create the Access application(s)

Zero Trust → Access → Applications → Add an application → Self-hosted.
Cloudflare's one-click "Protect your Pages previews" toggle (Pages project
→ Settings → Access policy) covers `*.pages.dev` preview URLs only — the
custom domain and the project's production `.pages.dev` hostname need
their own explicit application(s). Create policies covering all of:

- `wiki.athyper.com` (custom domain, production)
- `athyper-wiki-internal.pages.dev` (production `.pages.dev` hostname)
- `*.athyper-wiki-internal.pages.dev` (preview/branch alias subdomains —
  or rely on the "Protect previews" toggle for this one, but verify it in
  Step 4b regardless rather than trusting the toggle blindly)

Policy on each: **Allow**, Include → an explicit employee group (SSO
group from your IdP, or an email-domain rule scoped to your company
domain) — not "Everyone" and not "Any valid certificate."

### 4b. Verify unauthenticated access is denied

Run against **every** hostname above, for **every** surface — the page
itself, the Pagefind index, and the sitemap (the search index and sitemap
are separate leak surfaces from the HTML, per the earlier review — a
policy that only covers the page but not `/pagefind/` or
`/sitemap-index.xml` is incomplete):

```sh
for host in wiki.athyper.com athyper-wiki-internal.pages.dev <a-preview-subdomain>.athyper-wiki-internal.pages.dev; do
  for path in / /pagefind/pagefind.js /sitemap-index.xml; do
    echo -n "$host$path -> "
    curl -s -o /dev/null -w "%{http_code}\n" "https://$host$path"
  done
done
```

Expect a redirect to the Access login page (or a 403), never a `200` with
real content, on every line. If any line returns `200`, stop — do not
proceed to Step 5 until the policy is fixed and this re-passes.

Once the real internal wiki ships (Step 5 below, with real CSV/XLSX
downloads under `/assets/`), repeat this same sweep including a sample
`/assets/*.csv` path — the placeholder build has no downloads to test yet.

### 4c. Verify authorized access succeeds

As an employee account in the configured SSO group, open
`https://wiki.athyper.com/` in a browser, complete the SSO login, and
confirm the placeholder page renders. This confirms the policy isn't
accidentally denying everyone.

Only after 4b and 4c both pass: Pages project → Settings → Builds &
deployments → re-enable automatic production deployments for
`athyper-wiki-internal`.

## 5. Deploy the real internal wiki

Once Step 4 passes, either push to the production branch (now that
automatic deployments are re-enabled) or deploy manually:

```sh
pnpm --filter @athyper/docs-internal build
npx wrangler pages deploy apps/docs-internal/dist --project-name=athyper-wiki-internal
```

Re-run the Step 4b sweep once more against the real build, including a
real `/assets/*.csv` path, before considering this done.
