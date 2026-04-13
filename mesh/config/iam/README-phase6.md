# Phase 6 — Multi-IdP + Email-Domain Routing

## Summary

KC 26.x organisations support automatic email-domain → IdP routing.
When a user types `kumar@athyper.com`, KC resolves the domain to the
`athyper--ATHQ` org, sees it is linked to the `microsoft` IdP, and
auto-redirects — no `kc_idp_hint` required.

---

## 6.1 Identity Providers Configured

| Alias | Provider | Tenant(s) | Status |
|---|---|---|---|
| `github` | GitHub OAuth | Any user (feature-flagged) | ✓ Enabled |
| `microsoft` | Microsoft Azure AD | athyper, athyper-hq1 | ✓ Enabled |
| `google` | Google Workspace | pepsi | ✓ Enabled |
| *(none)* | Local password | coke, maaza, demo_* | ✓ Built-in |

> **Google credentials**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
> must be set in `mesh/env/.env` before `docker compose up`.
> Obtain from GCP Console → APIs & Services → OAuth 2.0 Credentials.
> Redirect URI to register: `https://<KC_HOST>/realms/athyper/broker/google/endpoint`

---

## 6.2 Org Domain → IdP Routing Matrix

| KC Org Alias | Domain | IdP | Login Flow |
|---|---|---|---|
| `athyper--ATHQ` | `athyper.com` | `microsoft` (Azure AD) | SSO via Entra ID |
| `athyper--AQTU` | `athyper.qa` | `microsoft` (Azure AD) | SSO via Entra ID |
| `pepsi--PEPSI` | `pepsi.com` | `google` (Workspace) | SSO via Google |
| `coke--COKE` | `coke.com` | *(none)* | Local username + password |

All other orgs (athyper subsidiaries, demo_*, maaza): local password login.

---

## 6.3 How Email-Domain Routing Works in KC 26.x

1. User visits login page, enters email address.
2. KC checks `organizationsEnabled = true` and resolves the domain against
   all org `domains[]` entries.
3. If a matching org is found AND it has a linked IdP:
   → KC auto-redirects to that IdP (no extra click needed).
4. If the org has no linked IdP (coke.com):
   → KC presents the standard password form.
5. After IdP login, KC runs the `neon broker login` first-broker-login flow
   which handles account linking and JIT provisioning.

**Browser flow change (Phase 6):** The `Organization` execution in the
browser flow was set from `DISABLED` → `ALTERNATIVE`. This activates
the KC 26 organisation-aware login path.

---

## 6.4 MFA (TOTP) — Status: Ready

MFA via TOTP is wired into the `forms` sub-flow via `Browser - Conditional 2FA`.
The flow is **conditional**: OTP is only required for users who have configured
an authenticator app (i.e. `totp: true` on the user record).

**How to enforce MFA for a user:**
- Admin Console → Users → `{username}` → Credentials → Configure OTP
- Or: require OTP at org/group level via Required Action

**Theme templates present:**
- `login-config-totp.ftl` — TOTP setup screen
- `login-otp.ftl` — OTP entry screen

---

## 6.5 GitHub OAuth — Status: Enabled

GitHub OAuth is fully configured in the realm (`alias: github`).
The app login page shows the GitHub button only when:

```
NEXT_PUBLIC_GITHUB_LOGIN_ENABLED=true
```

Set this in `apps/web/.env.local` for local development.

GitHub users are assigned `neon:WORKBENCH:USER` role via the
`github → neon:WORKBENCH:USER` IdP mapper. They land in `/auth/select`
and must be in at least one KC org to access a workbench.

**Credentials** (`mesh/env/.env`):
```
GITHUB_CLIENT_ID=Ov23liIgDgW7ohpcUO2N
GITHUB_CLIENT_SECRET=e230aae5d7bb7eb955a6d4011c7a75be004ba506
```

---

## 6.6 Magic Link — Status: Deferred (templates present)

The `login-magic-link.ftl` login template and corresponding email templates
(`email/html/magic-link.ftl`, `email/text/magic-link.ftl`) exist in the
`neon` theme.

KC 26.x has **no built-in magic link authenticator**. Enabling magic link
requires a third-party KC SPI plugin (e.g. `keycloak-magic-link` by
Martin Besozzi or Experiment Labs). This is deferred post-launch.

When a magic link SPI is installed, a new `magic-link` authentication flow
should be created and the `login-magic-link.ftl` template will render it.

---

## 6.7 Cross-Tenant Token (Verification)

KC includes ALL org memberships across all orgs in the `organization` JWT
claim regardless of which IdP was used to authenticate. This is a KC 26
built-in behaviour.

**Test:** `kumar` logs in via Microsoft SSO (`kumar@athyper.com`).
Expected JWT `organization` array:
```json
["athyper--ATHQ", "athyper--ASAC", "athyper--AMRE", "athyper-hq1--ATHQ"]
```
All four memberships appear even though only `athyper.com` triggered the
Microsoft IdP. The `/auth/select` page groups them into 2 tenants.

---

## 6.8 Test Checklist

- [ ] Kumar types `kumar@athyper.com` → redirected to Microsoft login (no `kc_idp_hint`)
- [ ] Michael Torres types `michael.torres@pepsi.com` → redirected to Google login
- [ ] Sarah Johnson types `sarah.johnson@coke.com` → sees local password form
- [ ] Ahmad Razak types `ahmad.razak@demomy.demo` → sees local password form
- [ ] After Microsoft login, Kumar JWT has `organization: [...]` with 4 entries
- [ ] No `resource_access.neon-web.roles` in JWT (v4 model)
- [ ] GitHub login button visible when `NEXT_PUBLIC_GITHUB_LOGIN_ENABLED=true`
- [ ] GitHub user lands on `/auth/select` after login
- [ ] User with `totp: true` is prompted for OTP on next login

---

## 6.9 Google Workspace Setup (Required Before Enabling)

1. GCP Console → APIs & Services → OAuth consent screen → External
2. Scopes: `openid`, `email`, `profile`
3. Credentials → OAuth 2.0 → Web Application
4. Authorised redirect URI: `https://<KC_HOST>/realms/athyper/broker/google/endpoint`
5. Copy Client ID + Secret to `mesh/env/.env`:
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```
6. KC Google IdP reads these at startup via env-variable interpolation.

> Until Google credentials are configured, the `google` IdP in the realm
> is enabled but will fail OAuth. Pepsi users will see an error on redirect.
> Set `"enabled": false` for the google IdP in `realm-demosetup.json` if
> not yet ready.
