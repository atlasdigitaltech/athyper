# Unified Identity Experience v2 design

**Status:** Proposed for design review; implementation is not authorized by this document
**Date:** 2026-08-22
**Scope:** Keycloak-hosted authentication and application-hosted public identity surfaces for Neon, Mesh, and Studio
**Visual direction:** Athyper black, white, and `#234B84`; split-screen layout inspired by the supplied reference; approved Athyper waveform artwork packaged locally
**Related:** `docs/architecture/iam-authority-contract.md`, `docs/architecture/frontend-auth-session-foundation.md`, `packages/platform/foundation/brand`, `packages/platform/iam/identity-gate`, `stack/config/iam/themes/neon/login`

## 1. Decision summary

Adopt one **Athyper Identity Shell** for every browser-facing authentication and session-management state across Neon, Mesh, Studio, and Keycloak.

The desktop shell uses a `58% / 42%` split:

- The left side is a dark Athyper story panel using the supplied blue waveform direction, a concise plane-specific value statement, and restrained ambient motion.
- The right side is a white task panel with exactly three vertical regions:
  1. plane branding and Athyper Identity assurance;
  2. the active authentication, selection, recovery, or logout task;
  3. compact legal, help, privacy, and security information.

The shell is a shared visual contract, not a new authentication authority. Keycloak continues to own credentials, federation, MFA, WebAuthn, required actions, and provider sessions. The applications continue to own their sanitized BFF session, application context selection, recovery presentation, and explicit application/global logout choices.

No credentials, tokens, authorization decisions, tenant data, or provider-session data move into the marketing panel or into a new client-side component.

## 2. Current-state findings

The repository already has a sound identity boundary but two separate presentations:

| Area | Current authority | Current presentation |
|---|---|---|
| Username/password, OTP, TOTP, WebAuthn, reset, consent, verification, provider errors | Keycloak theme under `stack/config/iam/themes/neon/login` | Centered header, form card, and footer |
| Sign-in bridge and recovery | `@athyper/platform-iam-identity-gate` | `PublicIdentitySurface` centered card |
| Business-context selection | Each application through the shared identity gate | `PublicIdentitySurface` centered card |
| Logout choice and result | Each application through the shared identity gate and auth BFF | `PublicIdentitySurface` centered card |
| Plane identity | Registered Keycloak client or application compile-time plane | Exact Neon, Mesh, or Studio wordmark |

The Keycloak theme already covers the important flow templates, uses local Geist fonts, has accessible form controls, uses client-first plane resolution, and applies the repository's generated design tokens. The application shell already shares one React implementation between all three planes. The redesign should preserve those strengths and replace only the outer presentation contract.

The current Keycloak `login.ftl` comment refers to a split-panel design, but the active shell CSS still renders a centered single-column page. This proposal makes the split layout real and applies it consistently to every template rather than only the initial password page.

## 3. Goals

1. Make Keycloak and application-owned identity pages feel like one continuous Athyper experience.
2. Make the intended plane obvious without making it an authorization input.
3. Preserve a calm, high-trust authentication task area with no visual competition around fields or errors.
4. Support short forms and tall flows such as TOTP enrollment, WebAuthn registration, organization selection, consent, and detailed errors.
5. Keep all fonts, images, CSS, and required scripts local so authentication has no third-party asset dependency.
6. Meet WCAG 2.2 AA and remain usable at 200% browser zoom, 400% text zoom, and on keyboard-only and touch devices.
7. Provide one testable design contract for all three planes and both rendering technologies: FreeMarker and React/Next.js.

## 4. Non-goals

- Replacing Keycloak forms with application-owned credential forms.
- Changing OIDC, PKCE, callback, session, CSRF, logout, MFA, or authorization logic.
- Exposing tenant-controlled HTML, logos, scripts, colors, or marketing copy on the sign-in domain in the first release.
- Adding social proof, customer logos, rotating promotions, tracking pixels, analytics, video, or remote fonts.
- Making API callbacks, back-channel logout, health routes, or protocol endpoints render this shell.
- Making dark mode a first-release requirement for the form panel. The proposed form surface stays white for predictable contrast; the story panel supplies the dark visual treatment.

## 5. Experience architecture

### 5.1 Desktop composition

```text
+-------------------------------------------+-------------------------------+
| STORY PANEL — 58%                         | TASK PANEL — 42%              |
|                                           |                               |
|  Athyper Identity                         |  1. BRAND                     |
|                                           |  [plane wordmark]             |
|  Plane value statement                    |  Secured by Athyper Identity  |
|  One short supporting sentence            |                               |
|                                           +-------------------------------+
|  Local waveform artwork                   |  2. ACTIVE TASK               |
|  Subtle, decorative motion only           |  title and supporting text    |
|                                           |  alerts                       |
|  Plane descriptor                         |  fields / choices / actions   |
|                                           |  request reference if needed  |
|                                           +-------------------------------+
|                                           |  3. SIMPLE INFORMATION        |
|                                           |  © Athyper · Privacy · Help   |
|                                           |  Secure access assurance      |
+-------------------------------------------+-------------------------------+
```

Recommended desktop dimensions:

- Split: `minmax(32rem, 58vw) minmax(28rem, 42vw)` when sufficient width exists.
- Task content measure: `28rem` preferred, `32rem` maximum for organization lists and consent.
- Right-panel horizontal padding: `clamp(2rem, 4vw, 5rem)`.
- Three task rows: `auto minmax(0, 1fr) auto`; the middle region scrolls independently only when the viewport cannot contain a tall flow.
- The task form is vertically centered for short flows but starts at a safe top offset for tall flows. The brand and footer do not overlap it.

### 5.2 Tablet composition

Between `48rem` and `75rem`, use a reduced `42% / 58%` split. Keep the left panel copy to a heading, one sentence, and the visual. This protects the form width before removing the story panel.

### 5.3 Mobile composition

Below `48rem`, use one column:

```text
+----------------------------------+
| COMPACT BRAND BANNER             |
| wordmark · plane descriptor      |
+----------------------------------+
| ACTIVE TASK                      |
| title, message, fields, actions  |
+----------------------------------+
| SIMPLE INFORMATION               |
+----------------------------------+
```

- Do not place form fields over the image.
- Replace the full story panel with a `6rem`–`8rem` dark banner using a pre-cropped, low-weight image or CSS gradient.
- Hide marketing paragraphs before hiding required task content.
- Keep every target at least `44px` high and preserve a single logical tab order.
- The mobile keyboard must not cover the primary action or trap the footer inside a fixed-height viewport.

## 6. Plane branding and proposed copy

Plane identity is selected only from a trusted registered client/application mapping. Query parameters may never introduce arbitrary branding or select an authorization plane.

| Plane | Required wordmark | Descriptor | Proposed story heading | Proposed supporting copy |
|---|---|---|---|---|
| Neon | NEON | **Business Operating Platform** | Run the business with clarity. | Connect finance, operations, and enterprise workflows in one governed business context. |
| Mesh | MESH | **Business Collaboration Network** | Work across trusted boundaries. | Coordinate customers, suppliers, and partners through secure shared business processes. |
| Studio | STUDIO | **Business Technology Platform** | Shape the platform with confidence. | Govern identity, metadata, configuration, and platform operations from one controlled workspace. |

Copy rules:

- The product descriptor is always visible at least once, preferably below the story copy and in the accessible name of the plane header.
- The task panel says **Secured by Athyper Identity**; it does not imply that Neon, Mesh, or Studio stores the credential.
- Marketing claims must be factual, short, and environment-neutral. Do not claim certifications, uptime, encryption properties, or regulatory compliance unless the claim is independently approved.
- The user-selected tenant, organization, company, account name, and email never appear in the story panel.
- Studio is a first-class plane. It must never inherit legacy `admin` wording or Neon branding.

## 7. Right-panel information model

### 7.1 Region 1 — brand and trust context

The top region contains:

- the exact plane wordmark;
- the plane descriptor on larger layouts;
- the universal Athyper favicon/mark as a small trust cue where appropriate;
- the text **Secured by Athyper Identity**;
- an optional “Use another application” action only when the current flow safely supports it.

It must not contain navigation back into an authenticated application while a required authentication action is incomplete.

### 7.2 Region 2 — active task

The middle region is the only primary interaction region. It contains:

- one `h1` describing the current task;
- one short supporting statement when it improves comprehension;
- a status or error message immediately before the affected control group;
- Keycloak- or application-owned controls;
- one visually primary action per step;
- secondary actions with explicit consequences;
- a non-sensitive support reference on operational error pages.

Do not wrap every task in an additional floating card. The white task panel is already the surface. A light bordered group may be used for organization choices, security-key instructions, recovery codes, or consent scopes.

### 7.3 Region 3 — simple information

Recommended content:

```text
© {year} Athyper · Privacy · Help
Secure access by Athyper Identity
```

- Render `Privacy` and `Help` as links only after stable public destinations exist; do not ship dead links.
- Environment badges such as `Development` may be shown outside production, but never expose internal hosts, realm IDs, client secrets, or deployment versions.
- Error/request references belong next to the task result, not in the universal footer.

## 8. Surface coverage

### 8.1 Keycloak-hosted surfaces

Every current FreeMarker template must use the same shell partials and task semantics:

| Surface | Preferred task title | Special requirement |
|---|---|---|
| Combined login | Welcome back / time-aware greeting | Username and password remain Keycloak-owned |
| Username-first login | Sign in to continue | Preserve identifier autocomplete and remembered identity |
| Password step | Enter your password | Display the locked identity with a clear Change action |
| OTP challenge | Enter your verification code | Explain code source without revealing configured factors |
| TOTP setup | Set up an authenticator | Allow tall content and QR zoom without changing the shell |
| WebAuthn registration | Set up your security key | Preserve browser ceremony and fallback guidance |
| WebAuthn error | Security key could not be verified | Safe retry and alternative-method actions |
| Magic link | Check your email | Do not disclose whether an unknown account exists |
| Password reset | Reset your password | Use anti-enumeration-safe confirmation copy |
| Password update | Choose a new password | Keep server-provided policy feedback adjacent to the field |
| Email verification | Verify your email | Support resend state without losing the current flow |
| Organization selection | Choose your organization | Long names wrap; aliases are secondary; selection is keyboard usable |
| OAuth consent | Review requested access | Scopes are readable and denial remains available |
| Information | Follow the next step | No success styling unless Keycloak confirms success |
| Error | We could not complete this request | Show safe next action and optional support reference |

### 8.2 Application-hosted surfaces

The shared React shell must cover all three applications without per-app forks:

| Surface | Current shared owner | Required behavior |
|---|---|---|
| Sign-in bridge | `LoginGatePage` | Explain transition to Athyper Identity and retain safe `returnTo` handling |
| Sign-in recovery | `LoginGatePage` | Preserve all current recovery reasons and exact outcome wording |
| Business-context selection | `ContextGatePage` | Keep tenant/context choices server-authorized and session-scoped |
| Logout choice | `LogoutGatePage` | Clearly distinguish application logout from Athyper-wide logout |
| Logout result | `LoginGatePage` recovery state | Never report complete global logout when revocation was not verified |
| Loading/redirect | `AuthLoadingPage` | Announce progress and avoid an indefinite decorative animation |

OIDC callback, login-start, logout callback, back-channel logout, session API, readiness, and error-problem endpoints remain headless protocol/API routes.

## 9. Visual system

### 9.1 Core palette

| Token | Proposed value | Use |
|---|---|---|
| `identity.brand` | `#234B84` | Primary action, focus-supporting accent, approved brand detail |
| `identity.brand.hover` | `#1B3C6A` | Primary action hover/pressed transition |
| `identity.story.start` | `#06142B` | Left-panel background |
| `identity.story.end` | `#0A2A55` | Left-panel depth/gradient |
| `identity.task` | `#FFFFFF` | Right task panel |
| `identity.task.subtle` | `#F4F7FB` | Grouped instructions and low-emphasis regions |
| `identity.text` | `#172033` | Primary task text |
| `identity.muted` | `#5B6578` | Supporting copy |
| `identity.border` | `#D5DCE7` | Controls and separators |
| `identity.focus` | `#2E90FA` | Keyboard focus ring |
| `identity.danger` | `#B42318` | Errors only |
| `identity.success` | `#067647` | Confirmed success only |

The plane wordmarks may use the approved `#234B84` assets. Do not restore unrelated purple/green plane accents inside authentication. Plane distinction comes from the wordmark, name, and descriptor, while the interaction system stays consistent.

### 9.2 Typography and controls

- Continue using the locally packaged Geist variable font with system fallbacks.
- Body text: `1rem / 1.5`; labels: at least `0.875rem`; task heading: `clamp(1.75rem, 2.5vw, 2.5rem)`.
- Inputs and primary buttons: minimum `3rem` height on the new shell.
- Task content: left aligned. Avoid center-aligned fields, errors, consent scopes, and long instructions.
- Use sentence case. Avoid all-caps except a small optional plane descriptor eyebrow with sufficient letter spacing.
- Password reveal controls require stateful accessible labels: “Show password” and “Hide password,” not a fixed “Toggle” label.

### 9.3 Imagery

Use the supplied large waveform artwork as the visual direction for the story panel, subject to source/licensing approval. During implementation:

1. Place the approved original in `packages/platform/foundation/brand/assets/identity/` as the canonical source.
2. Produce desktop AVIF/WebP and a dedicated mobile crop; retain a PNG only where a required browser/tool cannot consume the modern formats.
3. Synchronize deterministic copies into the Keycloak resources and each application public asset set through the existing brand build/sync process.
4. Apply a dark navy gradient behind the image so white copy meets contrast at every crop.
5. Mark decorative artwork `aria-hidden="true"`; meaningful plane text remains real HTML.

The two smaller supplied images may be retained as optional future illustrations for context selection or strong-authentication enrollment. V2 should initially use one shared background treatment to avoid a different visual scene during every auth step.

### 9.4 Motion

Recommended motion is intentionally limited:

- one slow `18s`–`24s` background drift using `transform` and opacity only;
- no particles, canvas, video, or animation attached to typing, validation, errors, OTP timers, or submit actions;
- no auto-advancing marketing carousel;
- pause work when the document is hidden;
- `prefers-reduced-motion: reduce` renders a fully static background;
- the authentication controls and their focus outline never move.

The design remains complete when animation is disabled or fails to load.

## 10. Interaction and content rules

1. Keep one primary action per step. Use secondary or text actions for switching account, cancelling consent, alternative MFA, and returning safely.
2. Place validation next to the relevant control and provide a page-level summary only when multiple fields fail.
3. Preserve the user's entered identifier after a password error when Keycloak permits it; never preserve password or OTP values.
4. Disable a submit control only while the same submission is in progress. Announce progress with `aria-live` and prevent accidental duplicate submission without trapping recovery.
5. Never use color alone for success, warning, or failure.
6. Avoid account enumeration. Recovery and magic-link confirmation copy must be valid for both known and unknown identifiers.
7. Organization and context choices display only server-authorized options. Marketing content does not vary by selected tenant.
8. Application logout and Athyper-wide logout retain separate wording and consequences. A failure must not be presented as verified completion.
9. Browser back, refresh, expired state, and restarted flows must return to a coherent shell and safe action.
10. The application favicon and wordmark must match the trusted plane derived by the server, including Studio rather than the legacy `admin` label.

## 11. Security and privacy requirements

- Keycloak remains the only collector of passwords, OTPs, WebAuthn ceremonies, and recovery credentials.
- The React application must not render a password field that resembles the Keycloak form.
- Plane presentation is client-first in Keycloak and compile-time/server-selected in the applications. A query string is not an authorization or arbitrary branding source.
- All imagery, fonts, styles, and scripts are served from the trusted application or IAM origin. No CDN, remote font, remote image, analytics, or marketing request is allowed before authentication.
- Preserve CSP and progressively remove inline event handlers during implementation. Prefer bundled, nonce-compatible scripts and standard form submission.
- Error pages expose no stack trace, internal hostname, realm configuration, token, provider-session identifier, tenant membership, or account-existence signal.
- Safe request IDs may be displayed for support correlation. They must not encode identity or secrets.
- Keep `autocomplete="username"`, `current-password`, `new-password`, and `one-time-code` semantics correct so password managers and platform authenticators remain reliable.
- Preserve Keycloak's CSRF/action URL and the application BFF's session-bound CSRF checks. The shell must not rewrite, cache, or replay form actions.
- Public identity pages use `Cache-Control: no-store` where they expose transaction, session, error, or logout state.
- Frame embedding remains denied except for a separately reviewed identity-provider requirement.

## 12. Accessibility requirements

The release gate is WCAG 2.2 AA for every covered state.

- One `h1` and one unambiguous accessible page name per task.
- A skip link to the active task on desktop so keyboard and screen-reader users can bypass the decorative story region.
- The story panel is outside the form landmark and is skipped when decorative.
- Logical DOM order follows brand, task, footer regardless of the CSS split.
- Every input has a persistent label; placeholders are supplemental only.
- Errors are programmatically associated with their controls; the first invalid field receives focus after failed submission when safe.
- Visible focus has at least a `3px` ring and is not obscured by the panel or viewport.
- Text and interactive states meet AA contrast against every image/gradient crop.
- Layout works at 320 CSS pixels, 200% zoom, and 400% text zoom without horizontal scrolling of the active task.
- Screen readers announce loading, errors, confirmation, timeout, and logout results without repeating decorative content.
- Reduced-motion, forced-colors, high-contrast, and browser text-scaling modes receive deliberate tests.

## 13. Proposed implementation architecture

### 13.1 One contract, two renderers

FreeMarker and React cannot safely share a runtime component, so they should share a build-time contract:

```text
packages/platform/foundation/brand
  identity experience manifest + tokens + canonical assets
                 |
                 +--> generated Keycloak content/tokens/assets
                 |       -> FreeMarker shell partials
                 |
                 +--> React brand/content adapter
                         -> IdentityExperienceShell
```

Recommended sources and outputs:

- Canonical plane names, descriptors, wordmarks, favicon, story copy, and image descriptors live in `@athyper/platform-brand` or a runtime-neutral manifest beside it.
- A deterministic brand build generates a Keycloak-compatible `_identity-plane-content.ftl` mapping and copies hashed/verified assets.
- Generated files carry a header and are checked for drift in CI.
- The React package consumes the same canonical values directly.
- The layout tokens are generated into both the platform theme and Keycloak CSS. Do not maintain visually equivalent colors and spacing by hand in two files.

### 13.2 Keycloak composition

Proposed partial responsibilities:

| Partial | Responsibility |
|---|---|
| `_identity-shell-start.ftl` | Document start, trusted plane data, head assets, shell and story region |
| `_identity-story.ftl` | Plane descriptor, approved copy, responsive artwork |
| `_identity-task-header.ftl` | Wordmark and Athyper Identity assurance |
| `_identity-message.ftl` | Sanitized message rendering and accessible status semantics |
| `_identity-task-footer.ftl` | Legal/help/security information |
| `_identity-shell-end.ftl` | Balanced closing markup and approved scripts |

Each Keycloak template remains responsible for its Keycloak variables, form action, fields, factors, and flow-specific decisions. The shell partials must not attempt to normalize server behavior that differs by authentication execution.

### 13.3 Application composition

Replace the current centered `PublicIdentitySurface` use with a shared `IdentityExperienceShell` that accepts:

```ts
interface IdentityExperienceShellProps {
  plane: "neon" | "mesh" | "studio";
  labelledBy: string;
  children: React.ReactNode;
  tone?: "default" | "recovery" | "completion";
  supportReference?: string;
}
```

`LoginGatePage`, `ContextGatePage`, `LogoutGatePage`, and `AuthLoadingPage` provide only task content. They do not provide their own story copy, brand resolution, legal footer, or layout.

## 14. Performance and resilience budgets

These are proposed acceptance budgets, not claims about the current build:

| Measure | Target |
|---|---:|
| Largest desktop story asset | `<= 250 KB` transferred |
| Mobile story asset | `<= 80 KB` transferred |
| New JavaScript required only for layout/visual effect | `0 KB` |
| Cumulative layout shift | `<= 0.05` |
| Public auth LCP at p75 on the agreed test profile | `<= 2.5 s` |
| Local font files | Existing Geist only; no new family |

The form and primary action render without waiting for the story image. A missing image produces the navy gradient and complete text, not a blank or broken shell. Authentication remains usable when optional motion or client JavaScript is unavailable.

## 15. Test and evidence plan

### 15.1 Contract and unit tests

- Every registered client resolves to exactly one approved plane presentation.
- Unknown clients fail to the neutral Athyper/Studio-safe presentation without granting a plane.
- Studio never resolves to Neon branding and legacy `admin` remains an internal compatibility alias only.
- All application identity states render through the shared shell.
- Safe-return, recovery-reason, logout-scope, and CSRF behavior remain unchanged.
- Generated Keycloak and application assets match the canonical manifest hashes.

### 15.2 Keycloak template coverage

Render and validate every template listed in section 8.1 using representative success, warning, validation, and error data. Add a static contract test that fails when a new top-level login template does not include the identity shell.

### 15.3 Visual regression matrix

Minimum matrix:

- planes: Neon, Mesh, Studio;
- widths: `1440x900`, `1024x768`, `768x1024`, `390x844`, `320x568`;
- flows: login, invalid login, password-only, OTP, TOTP setup, WebAuthn, reset, organization/context selection, consent, logout choice, logout result, operational error;
- modes: standard, reduced motion, forced colors/high contrast where supported;
- content stress: 200% zoom, 400% text, long translated labels, long organization name, and browser autofill.

### 15.4 Live DEV qualification

1. Start each application from its normal public URL and verify the correct Keycloak plane brand.
2. Complete login, invalid login, password reset request, OTP/TOTP, context selection, application logout, global logout, and session-expiry recovery.
3. Confirm direct Keycloak and application refresh/back navigation remain coherent.
4. Confirm no third-party network request is made before or during authentication.
5. Confirm cookies, callback parameters, CSP, frame policy, and `Cache-Control` are unchanged or strengthened.
6. Confirm keyboard, screen-reader, reduced-motion, and mobile tests against the live gateway.
7. Capture screenshots and a test receipt per plane and flow; do not use screenshots containing real personal data.

## 16. Rollout and rollback

1. **Design approval:** approve layout, copy, plane wordmarks, artwork license/source, footer destinations, and mobile collapse behavior.
2. **Foundation:** add the canonical identity manifest, generated token/content adapters, optimized assets, and shell primitives without changing live realm selection.
3. **Keycloak migration:** move every FreeMarker surface to the new shell in one versioned theme. Validate against the exact deployed Keycloak version.
4. **Application migration:** switch the shared identity gate once; Neon, Mesh, and Studio inherit it together.
5. **DEV canary:** deploy the versioned Keycloak theme and application revision, clear only the documented theme caches, and run the full matrix.
6. **QA and promotion:** run the same receipts twice with plane isolation proof before STG promotion.

Rollback keeps the previous versioned Keycloak theme and previous application image available. Reverting presentation must not require realm deletion, user import, credential reset, session-key rotation, database reset, or a change to authentication flows.

## 17. Recommended review decisions

| Decision | Recommendation |
|---|---|
| Desktop split | Approve `58% story / 42% task` |
| Tablet split | Approve `42% story / 58% task` |
| Mobile | Approve compact banner; no full marketing paragraph |
| Story artwork | Approve supplied waveform direction after source/licensing confirmation |
| Plane differentiation | Exact wordmark + descriptor; shared `#234B84` interaction color |
| Story behavior | One stable scene, no carousel; optional slow reduced-motion-safe drift |
| Right panel | Three fixed semantic regions: brand, task, simple information |
| Tenant customization | Defer; use platform-approved plane content only |
| Footer | Approve security assurance; add Privacy/Help only with real public routes |
| Dark mode | Defer for task panel; retain dark story/white task composition |

## 18. Approval gate

No authentication UI, application page, Keycloak theme, image asset, container, or live realm is changed by this design document.

Build should begin only after review approves:

1. the `58/42` split and mobile collapse;
2. the three plane copy lines;
3. use and provenance of the supplied waveform artwork;
4. the exact footer information and destinations;
5. the shared blue interaction palette led by `#234B84`;
6. the full surface and visual regression matrix.

After approval, implementation should start with the shared manifest and shell contract, then migrate Keycloak and the application identity gate before any live realm deployment.
