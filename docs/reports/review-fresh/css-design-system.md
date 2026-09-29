# Review: CSS, theme tokens and the design system

Area slug: `css-design-system`
Revision reviewed: working tree at the time of writing (2026-09-29+; `git status` dirty).
Independence: this report was derived only from current source, the repository's own gates, and
executing those gates read-only. No pre-existing review under `docs/reports/` was opened.

---

## 1. What actually renders on the Country route

`/app/entity/country/` is served by the shared Entity Framework. The CSS that reaches the browser is
determined by the app layout, not by the entity:

```
apps/neon/app/layout.tsx:1  import "@athyper/platform-theme/styles.css";
apps/neon/app/layout.tsx:2  import "@athyper/platform-iam-identity-gate/styles.css";
apps/neon/app/layout.tsx:3  import "@athyper/product-neon-shell/styles.css";
apps/neon/app/layout.tsx:4  import "@athyper/platform-shell-activity-center-data/styles.css";
apps/neon/app/layout.tsx:5  import "@athyper/platform-entity-list-view/styles.css";
apps/neon/app/layout.tsx:6  import "@athyper/platform-entity-form-detail/styles.css";
```

`@import` chain (verified with a repo-wide `@import` sweep):

```
packages/planes/neon/shell/src/styles.css:1   @import "@athyper/platform-shell/styles.css";
packages/platform/shell/shell/src/styles.css:1  @import "@athyper/platform-collection-controls/styles.css";
packages/platform/shell/shell/src/styles.css:2  @import "@athyper/platform-ui/styles.css";
packages/platform/foundation/ui/src/styles.css:1  @import "./composer-frame/styles.css";
packages/platform/foundation/ui/src/styles.css:2  @import "@athyper/platform-theme/styles.css";
packages/platform/iam/identity-gate/src/styles.css:1 @import "@athyper/platform-surface-kit/styles.css";
packages/platform/foundation/surface-kit/src/styles.css:1 @import "@athyper/platform-ui/styles.css";
packages/platform/entity/runtime/form-detail/src/styles.css:1-3 @import "./record/record.css" / "./record/record-collaboration.css" / "./detail-workspace.css";
```

Country is a flat read-only entity: `metadata/products/shared/entities/country/definition.json`
declares only `entity.record.list.v1` and `entity.record.read.v1` and has **no** `collections` key.
`metadata/products/shared/entities/country/capabilities.json` **does** enable `comments`
(+ `attachments`, `draft`, `reactions`, `mentions`, `history`). So the reachable CSS is:

* theme + identity-gate (loaded on every route) + plane shell + shell + list-view + form-detail
  (`styles.css`, `record.css`, `record-collaboration.css`, `detail-workspace.css`) +
  collection-controls + foundation/ui
* the record surface (`.a-entity-record*`), the related-record surface (`.a-related-*`), the
  collaboration/comments and attachment surfaces (`.a-comment-*`, `.a-attachment-*`,
  `.a-collaboration-*`, `.a-composer-*`), the list surface (`.a-entity-list*`, `.a-entity-pulse*`),
  toasts and dialogs.
* Collections (`.a-collection*`) and intake (`.a-data-surface*`, `.a-intake-*`) are **not** reachable
  from Country today, but they are shared-framework code that every newly onboarded writeable entity
  uses. Findings that touch only those are marked accordingly.

Total source CSS on this path: **4,034 lines** across 8 files (measured `cat | wc -l`).

---

## 2. Measurements

All numbers below were produced by running commands against the current tree.

**Design-system gates, executed as-is**

| Gate | Command | Result |
| --- | --- | --- |
| theme token integrity | `node tooling/scripts/policy/verify-theme-token-integrity.mjs` | exit 0, 148 global tokens, 0 authority issues, **11 unresolved (0 error, 11 warning)** |
| theme token integrity (strict) | `... --strict` | **exit 1**, 11 findings |
| design system | `node tooling/scripts/policy/verify-design-system.mjs` | exit 0, **143** violations, ratchet total 144 → "1 file(s) now clean" |
| style tokens (strict) | `tsx tooling/scripts/policy/audit-style-tokens.ts --strict` | exit 0, **95** findings, ratchet total 203 → "2 file(s) improved, 5 file(s) now clean" |
| foundation phase 1 | `node tooling/scripts/policy/verify-foundation-phase1.mjs` | **exit 1**, 3 violations |

Relevant profile membership (`governance/config/governance/static-policy-profiles.json`):
`policy:foundation-phase1` is in `workspace` (line 22), `release` (37) and `ci` (67);
`policy:theme-token-integrity:strict` (90), `policy:design-system` (91) and
`policy:style-tokens:strict` (92) are in `ci`.
`package.json:224` maps `policy:static` → `--profile ci`, and that is exactly the command in
`.github/workflows/ci.yml:79` with no `continue-on-error`, so a failing policy fails the job.

**Tokens**

* Token authority `packages/platform/foundation/theme/src/styles.css`: **301** `--a-*` definitions,
  106 lines, 24,438 bytes. Vocabulary the gate recognises: **148** tokens.
* Token definitions outside the authority: **41** across 9 files —
  `iam/identity-gate/src/styles.css` 9, `surface-kit/src/public-identity-layout.css` 9,
  `foundation/ui/src/styles.css` 7, `surface-kit/src/public-identity-showcase.css` 6,
  `form-detail/src/styles.css` 4, `record.css` 2, `record-collaboration.css` 2,
  `shell/shell/src/styles.css` 1, `list-view/src/styles.css` 1.
* `--a-*` tokens referenced from `.tsx`/`.ts`: **38 distinct**, all 38 defined in the authority.

**Sweep of the 8 Country-path stylesheets**

| Metric | Count |
| --- | --- |
| `!important` declarations | 65 in **38** rule blocks; 14 blocks are the standard `[hidden]` / visually-hidden / reduced-motion patterns, leaving **24** blocks where `!important` is used as a specificity workaround |
| literal `z-index` occurrences | **51** (18 distinct); 20 use `var(--a-z-*)`/relative `calc()` |
| `border-radius` literals (non-token) | foundation/ui 16, list-view 7, form-detail 12, record.css 7 (vs **1** token use in record.css), shell 66 |
| raw `font-size`/`font-weight` literals | 65 |
| raw `line-height`/`letter-spacing` literals | 22 (repo audit reports 47 `raw-css-typography` + 15 `raw-css-tracking-leading`) |
| spacing `px` literals inside padding/margin/gap | 72 |
| CSS-only class names (defined in CSS, never referenced as an exact literal in any `.tsx`/`.ts`/`.html`, excluding `.next*`, `.git`, `node_modules`) | **117** (6 are `rdp-*`, from react-day-picker) |
| dead `.a-entity-list__*` classes | **35** of 196 defined (33 after removing two dynamic `--status--success|warning`) |
| dead comment/attachment classes (reachable surface — comments are enabled for Country) | **15** of 113 |

**Duplication of the palette**

`grep -oE '#[0-9a-fA-F]{3,8}'` + case-normalise + `comm`:
`foundation/theme/src/styles.css` has **60** distinct hex literals, `foundation/theme/src/tokens.ts`
has **59**, and **53 are byte-identical in both**; the remaining 7 CSS literals are short forms of 6
tokens.ts values (`#000`↔`#000000`, `#0ff`↔`#00ffff`, `#333`↔`#333333`, `#6f9`↔`#66ff99`,
`#ff0`↔`#ffff00`, `#fff`↔`#ffffff`). Only `#234b84` is not mirrored in `tokens.ts` — it is instead
re-hardcoded in `packages/platform/foundation/brand/src/atlas-modern.ts:8`.

---

## 3. Findings

### F1 — `high` — the theme-token gate reads generated build output (`.next-bp-consolidated`)

**Citation:** `tooling/scripts/policy/verify-theme-token-integrity.mjs:20-27`

```js
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
```

`stylesheetsBelow()` (lines 39-55) only skips a directory whose **exact** name is in that set, so
`apps/studio/.next-bp-consolidated/`, which is a Next.js alternate `distDir`, is walked. The gate's
own output proves it:

```
WARNING (no definition, every usage has a fallback — tolerated during rollout)
  apps/studio/.next-bp-consolidated/static/chunks/0adjft-j9-1qj.css:1 --a-on-brand (1x)
  apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-record-sticky-top (1x)
  apps/studio/.next-bp-consolidated/static/chunks/1xz07w6xqovn0.css:1 --a-surface-subtle (1x)
```

Controlled experiment (importing the exported analyser, no file mutation):

```
DEFAULT targetRoots findings: 11   → 3 of them come only from .next-bp-consolidated
targetRoots: ['packages/platform','packages/planes'] findings: 8
```

**Why it is wrong.** `.gitignore:48` is `**/.next-*/` — the repo already declares these directories
generated, and both sibling gates already implement exactly that rule:

* `tooling/scripts/policy/verify-design-system.mjs:54-66`
  ```js
  // Alternate Next.js distDir outputs (.next-bp-consolidated and friends)
  // are generated exactly like .next/, and .gitignore already treats them as such.
  function isGeneratedDirectory(name) {
    return (name === "node_modules" || name === "dist" || ... || name.startsWith(".next-"));
  }
  ```
* `tooling/scripts/policy/audit-style-tokens.ts:39-50`
  ```ts
  const IGNORE_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules"]);
  // Alternate Next.js distDir outputs (.next-bp-consolidated and friends) are
  // generated, exactly like .next/, and .gitignore already treats them as such.
  const ignoredDir = (name: string) =>
    IGNORE_DIRS.has(name) || name.startsWith(".next-");
  ```
  (used at line 302 in the tree walk)

I searched for another guard and found none: `DEFAULT_TARGET_ROOTS`
(`verify-theme-token-integrity.mjs:13-19`) is `packages/platform`, `packages/planes`, `apps/neon`,
`apps/mesh`, `apps/studio`; there is no `.gitignore`-aware filter, no `--strict`-only exclusion, and
`verify-theme-token-integrity.test.mjs` (15 tests, 185 lines) has no generated-directory case at all
(the only related assertion is the documented "no cascade simulation" limitation at lines 54-60).

**Consequence.** The `ci` profile runs `policy:theme-token-integrity:strict`
(`static-policy-profiles.json:90`), which promotes every warning to a failure. The verdict therefore
depends on whether a build happened to write `apps/studio/.next-bp-consolidated/` on the machine
running the gate: a developer machine with stale build output gets 11 findings, a clean CI checkout
gets 8. Worse, three of the reported files no longer exist in source at all — the CSS comes from the
removed `packages/planes/neon/business-partner` plane
(`packages/planes/neon/business-partner/src/` does not exist), so a token that was fixed in source
still "fails" and a genuinely new no-fallback reference in generated JS/CSS is indistinguishable from
source debt. This makes the strict gate untrustworthy and directly contributes to F2/F3 being ignored.

**Fix.** Replace the set membership test with the same predicate the other two gates use:
`IGNORE_DIRS.has(name) || name.startsWith(".next-")` in `stylesheetsBelow()`
(`verify-theme-token-integrity.mjs:39-55`), and add a fixture test asserting that a `.next-*/**/*.css`
with a bare `var(--a-missing)` produces no finding.

---

### F2 — `high` — `policy:theme-token-integrity:strict` fails today on 8 source warnings

**Citation:** `tooling/scripts/policy/verify-theme-token-integrity.mjs:223-232`

```js
const STRICT = process.argv.includes("--strict");
...
export function selectFailures(findings, { strict } = {}) {
  return strict
    ? findings
    : findings.filter((finding) => finding.severity === "error");
}
```

Running the exact command the `ci` profile runs:

```
$ node tooling/scripts/policy/verify-theme-token-integrity.mjs --strict
...
Theme token integrity failed: 11 finding(s).
$ echo $?
1
```

After excluding generated output (F1), the eight source findings remain:
`foundation/ui/src/styles.css:131` ×2 (`--a-page-sticky-top`, `--a-record-sticky-top`),
`:317` (`--a-surface-muted`), `:388` (`--a-color-danger`), `:520` (`--a-toast-bottom-offset`),
`shell/shell/src/styles.css:535` (`--a-on-brand`),
`form-detail/src/record/record.css:223` and `form-detail/src/detail-workspace.css:8`
(`--a-page-sticky-top`). Every one is classified `warning`, i.e. *all* usages carry a fallback, so no
declaration breaks.

**Why it is wrong.** The comment at lines 219-222 states the intent: `--strict` exists so a new
`var(--a-typo, something)` cannot slip in *behind a fallback*. But the strict profile was turned on in
`ci` (line 90) while six pre-existing source tokens were never resolved. Because the treatment of
these eight findings is identical to `warning`-tolerated rollout debt, the strict gate can never pass
and provides no protection at all — a new fallback-masked typo today is indistinguishable from the
eight known ones.

I checked whether anything else absorbs this: `selectFailures` has no allowlist, the ratchets
(`design-system-ratchet.json`, `style-tokens-ratchet.json`) do not cover theme-token findings, and
`run-static-policies.mjs:138` returns `1` for any failed policy. Nothing mitigates it.

**Consequence.** The design-system CI job is permanently red (together with F3), so reviewers learn to
read "Static policies: failed" as normal noise, and the design system has no working enforcement.

**Fix.** Either (a) resolve the eight references — delete the dead `--a-record-sticky-top` hook
(F11), replace `var(--a-color-danger,#b42318)` with `var(--a-danger)` (F5), replace
`var(--a-on-brand,#fff)` with `var(--a-brand-foreground)` (F6), replace
`var(--a-toast-bottom-offset,0px)` with a documented runtime contract, and declare
`--a-page-sticky-top`/`--a-surface-muted` in the authority or drop the indirection — or (b) demote
`policy:theme-token-integrity:strict` out of `ci` until they are resolved, so a green run means
something.

---

### F3 — `high` — `policy:foundation-phase1` fails three design-system checks and cannot pass

**Citation:** `tooling/scripts/policy/verify-foundation-phase1.mjs:81-104` and `:205-211`

```js
const cssBytes = cssFiles.reduce((total, file) => total + statSync(file).size, 0);
if (cssBytes > 24 * 1024)
  violations.push(`Foundation CSS is ${cssBytes} bytes; budget is 24576 bytes`);
const tokenBytes = statSync(join(foundation, "theme", "src", "tokens.ts")).size;
if (tokenBytes > 12 * 1024)
  violations.push(`Theme token source is ${tokenBytes} bytes; budget is 12288 bytes`);
```

```js
if (/#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(authCss))
  violations.push(
    "Identity-gate CSS contains literal colors instead of semantic theme tokens",
  );
```

Actual output:

```
Foundation Phase 1 policy failed:
- Foundation CSS is 130558 bytes; budget is 24576 bytes
- Theme token source is 14613 bytes; budget is 12288 bytes
- Identity-gate CSS contains literal colors instead of semantic theme tokens
```

Measured file sizes: `theme/src/styles.css` 24,438; `theme/src/tailwind.css` 3,721;
`foundation/ui/src/styles.css` 80,177; `surface-kit/src/styles.css` 5,100;
`iam/identity-gate/src/styles.css` 17,122 → 130,558 total. `theme/src/tokens.ts` is 14,613.

**Why it is wrong.** The gate is registered in `workspace`, `release` **and** `ci`
(`static-policy-profiles.json:22,37,67`), so `pnpm policy:static` always reports a failure. The
identity-gate violation is not unexpected debt either: the file itself documents the literals and why
they exist —

`packages/platform/iam/identity-gate/src/styles.css:7-22`
```css
/* ... The app never sets [data-theme="dark"] on <html>, so semantic tokens that
   differ by theme (focus/success/warning/danger/contrast) would otherwise
   silently resolve to their light-mode values here ... Pin them to the Atlas theme's own dark-mode
   values (foundation/theme/src/styles.css, :root[data-theme="dark"]) ... */
.a-public-identity__story{
  --a-focus:#84caff;--a-danger:#f97066;--a-danger-foreground:#230402;
  ...
}
```

so a deliberate, documented design decision and an absolute "no literal colour" predicate are in
direct conflict with no allowlist on either side. I looked for an exemption list in the script: the
only scoping is `for (const plane of ["neon","mesh","studio"])` and fixed file paths; there is no
allowlist, and the check runs unconditionally.

**Consequence.** The same as F2 — the design-system enforcement surface is red by construction. The
byte budgets are also unmaintainable signals: 130,558 vs 24,576 is 5.3× over, so the number can no
longer distinguish "someone added 300 bytes" from "someone added 30 KB".

**Fix.** (1) Re-baseline or delete the byte budgets against measured reality (or convert them to a
ratchet with a `--update-ratchet` path like `policy:design-system`, so they can only go down from a
true baseline); (2) either add an explicit, documented exemption for
`iam/identity-gate/src/styles.css`'s `.a-public-identity__story` block, or express the pinned values
as new tokens in the authority (e.g. `--a-story-focus`, `--a-story-danger`) so the file contains no
literals at all — the second option is the one consistent with the comment's own intent.

---

### F4 — `medium` — the palette lives in two unsynchronised authorities (app CSS vs `tokens.ts`)

**Citations:**
`packages/platform/foundation/theme/src/styles.css:1-50` (hand-written theme blocks) and
`packages/platform/foundation/theme/src/tokens.ts:80-140` (parallel literal tables)

```ts
export const COLOR_TOKENS: Readonly<Record<ColorMode, ColorTokenSet>> =
  Object.freeze({
    light: Object.freeze({
      background: "#f8fafc",
      foreground: "#172033",
      surface: "#ffffff",
      ...
      danger: "#b42318",
```

vs `styles.css:2-8`
```css
:root, :root[data-theme="light"] {
  --a-background:#f8fafc;--a-foreground:#172033;--a-surface:#fff;--a-surface-raised:#fff;
  ...
  --a-danger:#b42318;--a-danger-foreground:#fff;
```

Plus a third copy of the brand values in
`packages/platform/foundation/brand/src/atlas-modern.ts:7-9`:
```ts
  colors: Object.freeze({
    primary: "#234B84",
```

**Measured duplication:** 53 of 60 hex literals in `styles.css` are byte-identical in `tokens.ts`
(plus 6 short-form equivalents), and `#234b84` is repeated in `atlas-modern.ts`.

**Why it is wrong.** `tokens.ts` is not the source of `styles.css`; it is consumed only by the
generator `packages/platform/foundation/theme/scripts/build-iam-css.ts`, which emits
`deploy/config/iam/themes/neon/login/resources/css/iam.tokens.css` /
`iam.generated.css`. The drift check the repo has is
`packages/platform/foundation/theme/package.json:20` → `tsx scripts/build-iam-css.ts --check`, run by
`package.json:103 brand:check`. That check compares *generated CSS* against `tokens.ts`; **nothing
compares `tokens.ts` against `styles.css`.** I searched for a test or policy that does
(`grep -rn 'COLOR_TOKENS' packages apps tooling` returns only `tokens.ts` itself and the generator;
`verify-theme-token-integrity` only reads `styles.css`) — there is none.

**Consequence.** Changing a theme colour in the file that actually paints the app
(`theme/src/styles.css`) silently leaves `tokens.ts` behind, so the Keycloak/IAM login theme and any
future generated artefact diverge from the application, with no failing check. This is the most
likely place for a real "the login page is a different colour from the app" bug and it is invisible to
every gate.

**Fix.** Make one file authoritative. Concretely: move the literals into `tokens.ts`, generate
`theme/src/styles.css` the same way `build-iam-css.ts` generates the IAM theme, and add
`iam:check`-style freshness assertion for it; or delete `COLOR_TOKENS`/`MONO_COLOR_TOKENS` and have
`build-iam-css.ts` parse the CSS. If neither is affordable now, add a gate that extracts hex literals
from both files and fails on any divergence — that is a ~20-line script and would have caught the
`#fff` vs `#ffffff` class of drift already present.

---

### F5 — `medium` — `var(--a-color-danger,#b42318)` breaks destructive-action contrast in dark and high-contrast themes

**Citation:** `packages/platform/foundation/ui/src/styles.css:388`

```css
.a-collection__actions .a-collection__remove{background:transparent;border-color:transparent;color:var(--a-color-danger,#b42318);padding-inline:0;text-decoration:underline}
```

**Proof the token is undefined:** `--a-color-danger` has **0** occurrences as a definition anywhere in
`packages/`, `apps/`, `server/`, `deploy/`, `tooling/`, `metadata/` (`grep -rn -E '^\s*--a-color-danger\s*:|[;{]\s*--a-color-danger\s*:'` → nothing); it is absent from
`theme/src/styles.css`; the design-system gate does not list it (it has a fallback), and the
theme-token gate reports it as `unresolved`/`warning` precisely because it is undefined.

**Why it is wrong.** The fallback is the *light-mode* `--a-danger` value hardcoded. Measured contrast
(WCAG relative-luminance):

| theme | rendered colour | background | ratio | colour with `var(--a-danger)` | ratio |
| --- | --- | --- | --- | --- | --- |
| dark (`data-theme="dark"`) | `#b42318` | `#111b2e` | **2.62:1** | `#f97066` | 6.18:1 |
| high-contrast | `#b42318` | `#000` | **3.19:1** | `#ff6b6b` | 7.57:1 |

Both fall below the 4.5:1 AA threshold for the underlined text of the destructive "Remove" control,
where the correctly-tokenised value passes comfortably. This is a genuine fallback-masked defect — the
reason the strict gate exists (F2).

Mitigation search: `.a-collection__remove` is live (`form-detail/src/collection-section.tsx:503`
and `:578`), so this is not dead code; and there is no later override of `color` for that class
(`grep -n 'a-collection__remove'` returns `styles.css:388` and the two TSX sites only).

**Reachability.** Collections are not part of `country/definition.json`, so this control is not
rendered on `/app/entity/country/` today. It is on the shared collection path used by any entity with
collections, which is the framework surface this repo is actively onboarding into.

**Fix.** `color:var(--a-danger)`. If a dedicated "danger text" role is wanted, declare
`--a-color-danger` (or better, `--a-text-danger`) in `theme/src/styles.css` for all four theme blocks
and drop the literal.

---

### F6 — `medium` — `var(--a-on-brand,#fff)` makes count badges unreadable in atlas-mono dark and high-contrast

**Citation:** `packages/platform/shell/shell/src/styles.css:535` and `:623`

```css
.a-management-navigation__count{padding:.1rem .4rem;border-radius:999px;background:var(--a-brand);color:var(--a-on-brand,#fff);font-size:var(--a-font-size-xs)}
```
```css
.a-management-navigation__step[aria-current=step] .a-intake-progress__number{background:var(--a-brand);border-color:var(--a-brand);color:var(--a-on-brand,#fff)}
```

**Proof the token is undefined:** `--a-on-brand` never appears as a definition
(`grep -rn -E '\-\-a-on-brand\s*:' packages apps` → nothing) and is not in `theme/src/styles.css`;
the gate reports it as `unresolved` at exactly these two lines. The intended token exists and is
themed in all four blocks: `--a-brand-foreground` (`theme/src/styles.css:8, 19, 30, 41, 47`).

**Why it is wrong.** The fallback `#fff` is only correct for the atlas-modern/atlas-mono *light*
brand. Measured:

| theme | `--a-brand` | `--a-brand-foreground` | `#fff` fallback ratio | correct ratio |
| --- | --- | --- | --- | --- |
| atlas-mono dark (`styles.css:47`) | `#e0e0e0` | `#121212` | **1.32:1** | 14.19:1 |
| high-contrast (`styles.css:30`) | `#ff0` | `#000` | **1.07:1** | 19.56:1 |

At 1.07:1 the count text is invisible in high-contrast mode.

**Reachability.** `.a-management-navigation__count` is rendered by
`packages/platform/shell/shell/src/management-workspace.tsx:96` (management/administration pages) and
`.a-intake-progress__number` by `packages/platform/entity/runtime/form-detail/src/intake.tsx:278`
(create/edit intake). Neither is on the read-only Country route, so this is a shared-chrome theme
defect rather than a Country-route defect — it is reported because it is the same fallback-masked
class of bug as F5 and it is one of the eight blockers in F2.

**Fix.** Use `var(--a-brand-foreground)` at both sites. There is no reason for a distinct
"on-brand" token; if one is wanted, define it in the authority for all four theme families.

---

### F7 — `medium` — literal colours hidden from the design-system gate inside SVG data URIs

**Citation:** `packages/platform/foundation/ui/src/styles.css:266-267`

```css
:root { --a-field-action-width:2.5rem; --a-field-icon-size:1.125rem; --a-field-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364758b' stroke-width='2' ... %3C/svg%3E"); }
:root:is([data-theme="dark"],[data-theme="high-contrast"]) { --a-field-chevron:url("data:image/svg+xml,... stroke='%23e2e8f0' ..."); }
```

The literal colours are `#64758b` and `#e2e8f0`, percent-encoded as `%2364758b` / `%23e2e8f0`.

**Proof the gate cannot see them:** `tooling/scripts/policy/verify-design-system.mjs:48`

```js
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g;
```

The `#` is encoded as `%23`, so the regex does not match (`grep -n '266\|267'` on the gate's output:
absent; the gate does report 15 other violations in this same file). This is a genuine hole in a gate
that otherwise reports the file.

**Why it is wrong.** Three problems at once: (a) the chevron colour bypasses the token system
entirely; (b) it *drifts* from the token it is copying — the light value `#64758b` is not
`--a-muted-foreground` (`#5b6578`, `styles.css:3`); (c) the dark override keys off
`data-theme="dark"|"high-contrast"` only, so `data-theme-family="atlas-mono"` gets `#e2e8f0` while its
own `--a-muted-foreground` is `#a6a6a6` (`styles.css:45`) — a 3-way mismatch across families.

Also note this file is the *only* place declaring global tokens outside the authority (F13), and it
is not in `DEFAULT_TOKEN_AUTHORITIES` (`verify-design-system.mjs:39-43`), so it is policed as a
consumer rather than as an authority.

**Consequence.** Any future "put the palette in one place" or brand-refresh change will silently miss
the select/date-input chevron, which is visible on the Country list filters and on the record detail
form controls. The design-system ratchet will also never count it.

**Fix.** Replace the data URI with a `currentColor`-based mask
(`mask-image` + `background-color:var(--a-muted-foreground)`) so the chevron is token-driven, or at
minimum widen `colorLiteral` to also match `%23[0-9a-fA-F]{3,8}` (a one-character change in the
gate's regex).

---

### F8 — `medium` — two packages style the same class, and one package names its root with another package's prefix

**Citations:**
`packages/platform/entity/runtime/list-view/src/styles.css:455-466`
`packages/platform/entity/runtime/collection-controls/src/styles.css:5-6`
`packages/platform/entity/runtime/collection-controls/src/index.tsx:48`

```css
.a-entity-list__controls-drawer{width:min(46rem,100vw);display:flex;flex-direction:column}
...
.a-entity-list__controls-drawer>.a-drawer__header{position:relative;z-index:2}
```
```css
.a-entity-list__controls-drawer > [data-list-drawer]:not([hidden]){display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.a-entity-list__controls-drawer > [data-list-drawer] > .a-collection-fields{flex:1;min-height:0;overflow:auto;align-content:start}
```
```tsx
        className="a-entity-list__controls-drawer"
```

**Why it is wrong.** `collection-controls` is a shared package that generic entity drawers compose;
it hardcodes the *entity-list* BEM block as its own root class and adds only the `>` child-combinator
rules (`[data-list-drawer]`, `.a-collection-fields`) that its own markup needs. The result is a
cross-package contract held together by load order:
`shell/shell/src/styles.css:1-2` imports `collection-controls` **before** `platform-ui`, and the app
imports `list-view` before `form-detail` (`apps/neon/app/layout.tsx:5-6`), so `list-view` wins ties on
`.a-entity-list__controls-drawer` (equal specificity `.a-entity-list__controls-drawer` vs
`.a-entity-list__controls-drawer > …`, later file). Nothing declares or tests that ordering.

I checked whether the split is accidental: `collection-controls/src/styles.css` has exactly 7 lines
and 3 of them are about `.a-entity-list__controls-drawer`/`.athyper-activity-query--compact` — it is a
pure "reach into two other components' DOM" stylesheet.

**Consequence.** A change to the entity-list drawer markup (renaming `data-list-drawer`, adding a
wrapper element) silently breaks the collection controls inside the shared Controls drawer for every
entity, with no gate or test covering the coupling
(`tests/foundation-browser/entity-drawer-selector.spec.ts:12-13` inlines a hand-written copy of the
markup with the same classes, so it will keep passing after the real markup changes).

**Fix.** Give the collection-controls root its own namespace
(`.a-collection-fields-drawer`) and style only that; keep `.a-entity-list__controls-drawer` in
`list-view` (moving the two child rules there too, since they are the *list* drawer's layout
contract). Longer term this is an argument for a shared "framework drawer" class in
`foundation/ui` that both packages compose.

---

### F9 — `medium` — duplicated sticky rules in `record.css` leave dead declarations and a fallback-free override

**Citations:** `packages/platform/entity/runtime/form-detail/src/record/record.css:217-225` and `:364-370`

```css
@media (min-width: 961px) {
  .a-entity-record
    .athyper-page-workspace__body:has(> .a-entity-record-record-body--pinned)
    > .a-record-page-header
    > .a-entity-record__tabs {
    position: sticky;
    top: var(--a-page-sticky-top, calc(var(--shell-topbar, 4.5rem) + var(--shell-crumbs, 0px)));
    z-index: 16;
  }
```
```css
@media (min-width: 961px) {
  .a-entity-record
    .athyper-page-workspace__body:has(> .a-entity-record-record-body--pinned)
    > .a-record-page-header
    > .a-entity-record__tabs {
    top: calc(var(--shell-topbar) + var(--shell-crumbs));
  }
```

Same selector, same media query, 147 lines apart. The second wins for `top`; the first's `top`
declaration is dead, and its `position`/`z-index` survive.

**Why it is wrong.** The surviving `top` uses **bare** `var(--shell-topbar)` and
`var(--shell-crumbs)` with no fallbacks, while every other declaration for the same concept in the
codebase supplies them (`foundation/ui/src/styles.css:131-132,425,459`;
`detail-workspace.css:8`; `record.css:223,228-229`). `--shell-topbar`/`--shell-crumbs` are defined
only on `.athyper-shell` (`shell/shell/src/styles.css:4`), so any host that renders the record surface
outside the shell (or a future refactor that drops the shell wrapper) makes the second declaration
invalid-at-computed-value-time, i.e. `top:auto`, which silently stops the record tabs from sticking.
It also discards the intended `--a-page-sticky-top` indirection, which is the token the shell
publishes for exactly this purpose (`shell/shell/src/styles.css:482-483`).

Also in the same file: the checked-item checkmark is defined and then killed —

`record.css:149-156` defines `.a-entity-record__view-control > div button[aria-checked="true"]::before`
with `content:""; border-block-end/…; transform: rotate(-45deg)`; `record.css:306-308` then sets
```css
.a-entity-record__view-control > div button::before {
  content: none !important;
}
```
which makes lines 149-156 unreachable (34 lines of dead rule, and the only `!important` on `content`
in the codebase).

**Consequence.** Three-way duplication of the sticky geometry (`217-248`, `364-378`, `398-411`,
`470-508`, `509-558` all restate pane pinning/scrollbar rules) means the record tab/rail alignment for
the Country detail route is decided by source order rather than by one declaration. The dead
`top` and the dead checkmark make the next person editing this file change the wrong rule.

**Fix.** Delete `record.css:364-370` (or `217-225`) so there is exactly one `top` declaration, and
keep the fallback-bearing form. Delete `record.css:149-156` or the `content:none` override, whichever
the design intends. Consolidate the five repeated `@media (min-width: 961px)` blocks
(`217`, `251`, `364`, `381`, `398`, `470`, `481`, `509`) into one.

---

### F10 — `medium` — dead component CSS retains pre-rename class names (50 verified classes)

**Citations** (all confirmed: the class name appears in the repo only inside a `.css` file, and the
owning package has no template-literal construction that could produce it):

`packages/platform/entity/runtime/list-view/src/styles.css:8, 10-12, 360-362, 455-468, 587-588`
```css
.a-entity-list__identity,.a-entity-list__context-actions{display:flex;align-items:center;min-width:0;gap:var(--a-space-2)}
.a-entity-list__identity h1{margin:0;font-size:clamp(1.35rem,2vw,1.8rem);...}
.a-entity-list__count{color:var(--a-muted-foreground);font-size:var(--a-font-size-sm);font-variant-numeric:tabular-nums}
.a-entity-list__identity .a-badge{opacity:.78;font-size:var(--a-font-size-2xs)}
.a-entity-list__context-actions{justify-content:flex-end;margin-inline-start:auto}
```
```css
.a-entity-list__page-title>.a-entity-list__count{font-size:var(--a-font-size-sm);font-weight:var(--a-font-weight-normal);letter-spacing:normal}
.a-entity-list__page-title>.a-badge{font-size:var(--a-font-size-2xs);letter-spacing:normal}
```
```css
.a-entity-list__drawer-selector{display:inline-flex;align-items:center;justify-content:flex-start;gap:var(--a-space-2);padding:0;min-height:0;font:inherit;color:inherit}
.a-entity-list__drawer-menu{min-width:15rem}
```
(Cross-check: `grep -n 'entity-list__count\|entity-list__identity\|entity-list__page-title' packages/platform/entity/runtime/list-view/src/index.tsx` returns nothing, so these are stale names from before the toolbar was restructured — the same file now renders `__toolbar-actions`/`__toolbar-label`/`__action-count` at `index.tsx:1971-2042`.)

`packages/platform/foundation/ui/src/styles.css:176-179, 337-341, 348`
```css
.a-related-record__badge { display:inline-flex; border:1px solid var(--a-border); border-radius:1rem; padding:.125rem .5rem; font-size:.8125rem; }
.a-related-record__badge[data-tone=success] { color:#166534; background:#f0fdf4; }
```

`packages/platform/entity/runtime/form-detail/src/styles.css:83-84, 98, 103, 372, 446, 599, 689-690`
```css
.a-comment-reply-count { color:var(--a-muted-foreground); font-size:var(--a-font-size-sm); }
.a-comment-card:target,[id^="comment-"]:focus-visible{outline:2px solid var(--a-brand);outline-offset:3px;scroll-margin-block:var(--a-space-6)}
```

**Measured.** In `list-view/src/styles.css`, 196 `a-entity-list__*` element classes are defined and
150 are referenced from `list-view/src`; after removing the two template-composed
`--status--success|warning` values, **33 are dead**:
`__chips, __choice-options, __columns-drawer, __columns-label, __context-actions, __count,
__display-settings-drawer, __drawer-selector, __field-select(+__options/__popover/__search/__trigger),
__fields-label, __filter-drawer, __filter-reset-slot, __group-drawer, __identity, __loading,
__manage-views-drawer, __mapping, __mobile-menu-heading, __mobile-menu-title, __page-title,
__refresh-button, __relative-date(+__options/__trigger), __search-icon, __settings-button, __sort-drawer,
__toolbar-reset, __view-menu`.
In the comment/attachment CSS (a surface Country *does* render), **15 of 113 are dead**:
`a-attachment-card__actions/__category/__editor/__history-controls/__icon/__select`,
`a-attachment-text-search`, `a-attachment-workspace__confirm/__folder-create/__folders`,
`a-collaboration-panel__controls`, `a-comment-card`, `a-comment-reply-count`,
`a-files-empty-state__icon`, `a-files-upload-chevron`.
Plus `a-related-record__badge`, `a-related-record__action`, `a-supporting-document-field`,
`a-bank-holder-copy`, `a-version-note`, `a-upload-help` in `foundation/ui/src/styles.css`.

I explicitly searched for the mitigating explanation before reporting: variant classes are
template-composed in this codebase (`foundation/ui/src/index.tsx:34`
`` `a-button--${variant}` ``, `:228` `` `a-badge--${tone}` ``,
`presentation.tsx:7` `` `a-action--${variant}` ``,
`list-view/src/index.tsx:1387` `` `a-entity-list--${state.density}` ``,
`:5117` `` `a-entity-list__status--${…}` ``,
`transfer-workspace.tsx:31` `` `a-transfer-workspace__status--${item.status}` ``,
`related-record.tsx:634` `` `a-related-detail--${detail.layout}` ``), which is why those are *not* in
the dead lists above. Repo-wide greps for the listed names return only CSS hits (and, for
`a-entity-list__count`/`__identity`, a pre-rename copy in `.git/lost-found/`, which is not source).

**Consequence.** The dead rules are not harmless: they are exactly where the remaining literal colours
live (`.a-related-record__badge[data-tone=…]` lines 177-179 are three of the 15 design-system
violations charged to `foundation/ui/src/styles.css`), so maintenance effort is being spent on
unreachable CSS, and the ratchet ceiling counts debt nobody can observe.

**Fix.** Delete the dead rules (a single `pnpm policy:design-system --update-ratchet` afterwards keeps
the ratchet honest). To stop the recurrence, add a policy rule in `audit-style-tokens.ts` that flags a
class defined in a stylesheet when no source file in the owning package references it and no
`` `${` ``-template prefix matches — the check I ran here is ~15 lines and would have caught all 50.

---

### F11 — `medium` — hardcoded spacing/radius/z-index/typography literals bypass the token scale

**Citations and measured counts**

`packages/platform/foundation/ui/src/styles.css:266` (global tokens declared outside the authority)
```css
:root { --a-field-action-width:2.5rem; --a-field-icon-size:1.125rem; --a-field-chevron:url(...); }
```

`packages/platform/shell/shell/src/styles.css:480-483` (layout token declared in the shell, not the theme)
```css
.athyper-shell__body{--shell-content-top:var(--shell-topbar);--a-page-sticky-top:var(--shell-content-top)}
.athyper-shell__body:has(>.athyper-shell__breadcrumbs){--shell-content-top:calc(var(--shell-topbar) + var(--shell-crumbs))}
```

`packages/platform/foundation/ui/src/styles.css:131-132` (dead override hook)
```css
.a-entity-record { --record-tabs-height:3.25rem; --record-sticky-top:var(--a-record-sticky-top,var(--a-page-sticky-top,calc(var(--shell-topbar,4.5rem) + var(--shell-crumbs,0px)))); min-width:0; }
.a-entity-record__tabs { position:sticky; top:var(--record-sticky-top,var(--a-record-sticky-top,calc(...))); z-index:15; ...
```
`--a-record-sticky-top` is referenced twice (`:131`, `:132`) and **defined nowhere** in the repository —
no host, no runtime `style.setProperty`, no metadata. It is a hook with no setter.

`packages/platform/shell/shell/src/styles.css:534, :598, :404` — literal z-index values that are exact
duplicates of three token values
```css
.a-management-navigation__overflow{position:absolute;z-index:20;right:0;min-width:12rem;...}
.athyper-shell[data-atlas-full=true]>.athyper-atlas-workspace--fullscreen{position:fixed;...;z-index:50;...}
.athyper-experience__module-more>section{position:absolute;z-index:40;...}
```

`packages/platform/foundation/ui/src/tooltip.tsx:80` — inline `zIndex:2147483647` on the portal tooltip
while its non-portal sibling class uses `z-index:var(--a-z-popover)` (`ui/src/styles.css:27`).

**Measured totals on the Country path:** 88 `z-index` declarations, of which **51 are literals**
(18 distinct values) and 37 use `var(--a-z-*)` or a relative `calc()`; 456 `border-radius`
declarations, of which **109 are literals** and 347 use `var(--a-radius-*)` — and
`record.css` alone is 7 literals to 1 token; 65 raw `font-size`/`font-weight` literals; 22 raw
`line-height`/`letter-spacing` literals; 72 `px` literals inside padding/margin/gap. `border-radius`
literals include `999px` where the token is `--a-radius-round:9999px` (`styles.css:59`) — two spellings
of the same intent — and off-scale values (`.5rem`, `.75rem`, `.3rem`, `.18rem`) that match no
`--a-radius-*` step.

**Why it is wrong.** The token scale is complete: `--a-space-1..10`, `--a-radius-sm..full`,
`--a-font-size-*`, `--a-line-height-*`, `--a-tracking-*`, `--a-font-weight-*`, `--a-z-*`,
`--a-motion-*`, `--a-easing`, `--a-shadow-*` (`theme/src/styles.css:53-66`) plus density variants
(`:73-75`). Density is the concrete cost: `--a-control-height`/`--a-space`/`--a-page-gap` change with
`data-density`, but the hardcoded `2.75rem`/`2.5rem`/`.25rem` values in `foundation/ui`,
`list-view` and `record.css` do not, so compact/spacious density only partly applies. The
`--a-space-*` positions in `theme/src/styles.css:54` skip `--a-space-7` and `--a-space-9`, which is
presumably why authors reach for literals.

**Fix.** (1) Promote the four shell/UI-level global tokens (`--a-field-*`, `--a-page-sticky-top`) into
`theme/src/styles.css` so there is one place to read the vocabulary; delete
`--a-record-sticky-top` or implement its setter. (2) Replace the three token-duplicating literal
z-index values with their tokens. (3) Add `--a-space-7`/`--a-space-9`, and extend the existing
`audit-style-tokens` rules to `border-radius` and `z-index` (today they cover colour and typography
only), ratcheted down from the current counts rather than as a hard failure.

---

### F12 — `medium` — the Tailwind token bridge is exported, budgeted, and never imported

**Citation:** `packages/platform/foundation/theme/src/tailwind.css:3-31` + `theme/package.json:15`

```css
@theme inline {
  --color-background: var(--a-background);
  ...
  --text-base: initial; --text-xl: initial; --text-2xl: initial; ...  /* Drop Tailwind's stock type scale ... */
  --font-weight-bold: initial; ...
```
```json
    "./tailwind.css": "./src/tailwind.css"
```

**Proof it is unused:** `grep -rn 'tailwind.css'` over `packages`, `apps`, `tooling` finds only the
package export and `tooling/scripts/policy/verify-foundation-phase1.mjs:82` (which lists it purely to
add its 3,721 bytes to the CSS budget). There is no `@import "tailwindcss"` anywhere
(`grep -rn 'tailwindcss'` hits only `apps/{neon,mesh,studio}/package.json` dependency entries), no
`postcss.config.*`/`tailwind.config.*` in `apps/` or `packages/`, and app layouts import
`@athyper/platform-theme/styles.css`, not the `@theme` bridge. The `direct-palette-utility` and
`stock-tailwind-typography` rules in `audit-style-tokens.ts` are also at **0** findings, consistent
with no utility classes being emitted.

**Why it is wrong.** The file exists to make an un-tokenised Tailwind class (`text-xl`, `font-bold`,
`bg-surface`) produce *nothing* instead of a silent fallback, and the design-system policy has two
rules that only have meaning if Tailwind is wired up. As shipped, the safety net described in the
file's own comment is inert: if someone adds `className="text-xl"` the class simply does not exist,
which is fine, but the two audit rules will never fire and the byte budget passes dead weight through
a gate that is already 5.3× over (F3).

**Consequence.** Dead configuration plus a false sense of coverage; also 3,721 bytes counted against a
24 KB foundation CSS budget for a stylesheet no browser loads. Not a rendering bug on the Country
route.

**Fix.** Either delete `tailwind.css` and the three `tailwindcss` dependencies and the two now-dead
audit rules, or actually import it (`@import "@athyper/platform-theme/tailwind.css"` from a Tailwind
entrypoint that also imports `tailwindcss`) so the guard rails become real. Do not leave it in the
middle state.

---

### F13 — `low` — two sort/columns controls are rendered but unconditionally hidden

**Citations:** `packages/platform/entity/runtime/list-view/src/index.tsx:1999, :2030` and
`packages/platform/entity/runtime/list-view/src/styles.css:349-353`

```tsx
className="a-entity-list__toolbar-action a-entity-list__sort-action"
...
className="a-entity-list__toolbar-action a-entity-list__columns-action"
```
```css
/* Keep one control hierarchy across desktop and mobile. Desktop retains a
   labelled trigger while mobile uses the same trigger as a compact icon. */
.a-entity-list .a-entity-list__context-actions,
.a-entity-list .a-entity-list__sort-action,
.a-entity-list .a-entity-list__columns-action{display:none}
```

The rule is outside any media query and has specificity (0,2,0) against the base
`.a-entity-list__sort-action` styling, and it appears after the `@media(max-width:48rem)` block at
`:295-347`. Nothing re-shows the two classes at any width, so the desktop Sort and Columns buttons
never paint.

**Why it is wrong.** The comment states the opposite behaviour ("Desktop retains a labelled trigger").
Two `Button` subtrees with full `aria-label`/`title`/count-badge markup are unreachable, and the
desktop sort/columns entry point is only the "Controls" menu
(`index.tsx:2044-2053`, `a-entity-list__more-trigger`).

**Consequence.** No capability is lost — the Controls menu opens the same drawers
(`LIST_DRAWERS`), so users on `/app/entity/country/` can still reach sort and column settings — but the
comment misdescribes the shipped behaviour and two dead render branches will be copy-pasted as the
pattern for new controls.

**Fix.** Decide the intent. If desktop should show labelled triggers, restrict the rule to
`@media(max-width:48rem)` and delete the duplicate instructions inside that block (lines 298 and 304
already hide them); if not, delete the two `Button` blocks at `index.tsx:1997-2027` and `:2028-2043`
and correct the comment.

---

### F14 — `low` — both violation ratchets are stale, and one is ~half phantom

**Citations:** `governance/config/governance/style-tokens-ratchet.json:9-14`,
`governance/config/governance/design-system-ratchet.json:16`,
`tooling/scripts/policy/violation-ratchet.mjs` (via the gates' own output)

```json
    "apps/neon/app/(shell)/mdg/authorization-review/review.tsx": 1,
    "apps/neon/app/(shell)/mdg/operation-review/review.tsx": 1,
    "apps/studio/app/(shell)/mdg/business-partner/workbench.css": 35,
    "packages/planes/neon/business-partner/src/styles.css": 64,
    ...
    "packages/platform/foundation/surface-kit/src/public-identity-showcase.css": 1,
```

Measured (`collectFindings` from `audit-style-tokens.ts` cross-tabulated against the ratchet):

```
DEAD  apps/neon/app/(shell)/mdg/authorization-review/review.tsx      ratchet=1   current=0
DEAD  apps/neon/app/(shell)/mdg/operation-review/review.tsx          ratchet=1   current=0
DEAD  apps/studio/app/(shell)/mdg/business-partner/workbench.css     ratchet=35  current=0
DEAD  packages/planes/neon/business-partner/src/styles.css           ratchet=64  current=0
DEAD  packages/platform/foundation/surface-kit/src/public-identity-showcase.css ratchet=1 current=0
SLACK packages/platform/entity/runtime/list-view/src/styles.css      ratchet=10  current=9
SLACK packages/platform/foundation/ui/src/styles.css                 ratchet=45  current=40
ratchet total 203   current total 95   dead entries 102   live slack 6
```

All four paths above `public-identity-showcase.css` **do not exist** (verified with `[ -e ]`); the
`business-partner` plane source directory is gone entirely. The design-system ratchet is essentially
accurate (144 vs 143, only `design-system-ratchet.json:16` stale, slack 1) and the gate says so:
`Ratchet is loose: 0 file(s) improved, 1 file(s) now clean.`

**Why it matters.** A ratchet is a ceiling, so its purpose is to make each *new* violation fail while
old ones stay visible. Here 102 of 203 entries can never be burned down (the files are gone), and the
6 live slack slots mean five new raw typography/colour violations in
`packages/platform/foundation/ui/src/styles.css` and one in `list-view/src/styles.css` would pass
silently — and F10 shows that file already carries dead rules, so the ceiling is not tracking anything
meaningful.

**Fix.** Run `pnpm policy:style-tokens:strict --update-ratchet` and
`pnpm policy:design-system --update-ratchet` to drop the phantom and clean entries; then have the
ratchet tool prune entries for inexistent files automatically (it already computes the "now clean"
set). The `capturedAtCommit` for the style-tokens ratchet is `632a992a` (2026-09-20), a week older than
the design-system one (`63fc9492`, 2026-09-29) — a good signal that it was simply not refreshed after
the plane removal.

---

### F15 — `low` — the `.next-*` exclusion that already exists in two gates has no test

**Citations:** `tooling/scripts/policy/verify-design-system.mjs:57-66`,
`tooling/scripts/policy/audit-style-tokens.ts:39-50`,
`tooling/scripts/policy/verify-design-system.test.mjs` (11 tests)

```js
function isGeneratedDirectory(name) {
  return (
    name === "node_modules" || name === "dist" || name === "coverage" ||
    name === ".turbo" || name === ".next" || name.startsWith(".next-")
  );
}
```

`grep -n 'next\|generated\|isGenerated' tooling/scripts/policy/verify-design-system.test.mjs` returns
nothing: the behaviour that F1 shows was *missed* in the third gate has no regression test in the two
gates that got it right. A future edit that reverts the predicate would reintroduce the
`.next-bp-consolidated` noise in `policy:design-system` (which currently reports 143 clean source
violations) with no test failing.

**Fix.** Add one fixture test per gate: create a temp root containing
`.next-anything/static/chunk.css` with `var(--a-totally-missing)` and assert no finding.

---

### F16 — `low` — token vocabulary partly documented only by its consumers

**Citations:** `packages/platform/foundation/theme/src/tailwind.css:29-30`,
`packages/platform/shell/shell/src/styles.css:482`, `packages/platform/foundation/theme/src/styles.css:61-70`

The authority defines a *size*-scale shadow set with a "Phase 2" comment (`--a-shadow-sm/md/card`,
line 62), a compatibility-alias block ("Phase 2", line 67-68) and a `*-soft` → `*-subtle` alias block
("Prefer `*-subtle` in new code", lines 69-70). The `*-soft` aliases (`--a-danger-soft`,
`--a-success-soft`, `--a-warning-soft`) are defined but **never referenced** anywhere in
`packages/`/`apps/` (`grep -rn 'a-danger-soft\|a-success-soft\|a-warning-soft'` outside the authority
returns nothing), so a "compatibility alias" that has no consumers is by definition dead.

Similarly, the token vocabulary is only discoverable by reading a 106-line file with very long lines;
there is no generated token reference, and `theme/src/tokens.ts` is not it (F4).

**Fix.** Delete `--a-danger-soft`/`--a-success-soft`/`--a-warning-soft` (and any other unreferenced
alias found by the same grep) once the F4 consolidation lands; generate a token reference table from
the authority so the vocabulary has one machine-readable home.

---

### F17 — `low` — `--a-surface-muted` reference resolves to `--a-surface`, producing an invisible badge fill

**Citation:** `packages/platform/foundation/ui/src/styles.css:317`

```css
.a-collection__badge{display:inline-flex;padding:.15rem .5rem;border-radius:var(--a-radius-md);background:var(--a-surface-muted,var(--a-surface));border:1px solid var(--a-border);font-size:var(--a-font-size-sm);white-space:nowrap}
```

`--a-surface-muted` is undefined; the nearest intended tokens are `--a-muted` (the muted fill,
`styles.css:3`) or `--a-selection-subtle`. The fallback therefore paints the badge with `--a-surface`,
i.e. the same colour as the card behind it, so the badge reads as an outline-only chip. Live:
`form-detail/src/collection-section.tsx:298` and `:469`. Not reachable from Country
(no collections in its definition); same shared-collection caveat as F5.

**Fix.** `background:var(--a-muted)` (or delete the indirection). Also fold into F2's burn-down list.

---

## 4. Verified healthy — do not churn

These are working as intended and were confirmed by reading the code:

1. **No un-resolvable token exists in source.** The authoritative gate, executed with the generated
   directories removed, reports `0 error` findings: every `--a-*` reference on the Country path that
   has no definition also carries a fallback. There is no "renders as nothing / to an initial value"
   token in the shipped stylesheets. (`verify-theme-token-integrity.mjs` source-only run: 8 findings,
   all `warning`.)
2. **The authority is self-consistent.** 148-token vocabulary, `0` `authority-unknown-reference`,
   `0` `authority-cycle`, and every `--a-*` referenced from TSX/TS resolves (38/38 distinct names).
3. **The theme matrix is complete and structured.** Four theme blocks (default light, dark,
   high-contrast, atlas-mono light/dark/high-contrast) plus density variants
   (`theme/src/styles.css:1-50`, `:73-75`), a documented decision to leave status hues inherited in
   atlas-mono (`:34-36`), `color-scheme` set per mode, `@media(prefers-reduced-motion:reduce)`
   globally neutralising animation (`:105`) and `@media(forced-colors:active)` focus visibility
   (`:106`). `-`-prefixed aliases are documented in-line with the reason and the "prefer" guidance
   (`:67-70`).
4. **The design-system ratchet reflects reality.** 143 measured violations against a total of 144 with
   a single stale file entry; the gate itself reports the discrepancy. Good.
5. **The generated-output exclusion already exists in two of the three gates.**
   `verify-design-system.mjs:57-66` and `audit-style-tokens.ts:50-54` both implement
   `name.startsWith(".next-")` with a correct explanatory comment. F1 is a "apply the fix you already
   have to the third script" finding, not a new design.
6. **Token misuse is ratcheted, not ignored.** `policy:design-system`, `policy:style-tokens:strict`
   and `policy:theme-token-integrity` all exist, are wired into `policy:static --profile ci`, and the
   ratchet tooling has a documented update path. The mechanism is right; the baselines and the two
   failing gates are what is wrong.
7. **`--a-page-sticky-top` is genuinely defined and the record sticky geometry is coherent.**
   `shell/shell/src/styles.css:482-483` publishes it on `.athyper-shell__body` (adding the breadcrumb
   height when breadcrumbs are a direct child), and the record rail/summary offset
   `calc(var(--record-sticky-top) + var(--record-tabs-height) + 1rem)`
   (`foundation/ui/src/styles.css:138`) lines up with the tab stop (`calc(--shell-topbar + --shell-crumbs)`,
   `record.css:369`) as long as breadcrumbs are present. The gate's `unresolved` warning for this token
   is the documented v1 limitation (`verify-theme-token-integrity.mjs:145-149`) and
   `verify-theme-token-integrity.test.mjs:54-60` asserts it deliberately.
8. **Accessibility affordances that do exist are done properly.** `.a-visually-hidden`
   (`ui/src/styles.css:77`), `.athyper-visually-hidden` (`shell/src/styles.css:91`),
   `.a-related-visually-hidden` (`ui/src/styles.css:206`), `[hidden]{display:none !important}` on the
   framework surfaces (`ui:468`, `form-detail:90,257,615,861,1062`), `@media(pointer:coarse)`
   touch-target upgrades (`ui:78`, `:207`, `:242`, `:407`), safe-area insets
   (`ui:60`, `:520`), and `text-overflow`/`overflow-wrap` on user data (`ui:325`, `list-view:357`,
   `record.css:592`).
9. **The theme is bootstrapped before paint** and that is asserted:
   `apps/*/app/layout.tsx:1` + `<head><ThemeScript` checked by
   `verify-foundation-phase1.mjs:132-139`, so there is no light/dark flash for the Country route.
10. **Entity-runtime colour usage is almost entirely token-based.** `list-view/src/styles.css`,
    `form-detail/src/styles.css` and `record.css` contain **zero** raw hex/rgb literals (measured);
    every colour comes from `var(--a-*)` or `color-mix(in srgb, var(--a-*) …)`. The literal-colour
    debt is concentrated in `foundation/ui` (11), `shell` (9), `iam/identity-gate` (9) and the two
    docs apps. That is a good place to be and should not be disturbed by refactors.

## 5. Checked but not a defect

Recorded so the same ground is not re-covered:

* **`--a-toast-bottom-offset` "undefined"** — set at runtime by
  `packages/platform/shell/app-foundation/src/toasts.tsx:153` and removed at `:184`; the CSS at
  `ui/src/styles.css:520` supplies `0px`. Intentional runtime contract, correctly fallback-guarded.
* **`--a-drawer-enter-offset` (ui:30-31), `--a-field-action-width`/`--a-field-icon-size`/`--a-field-chevron`
  (ui:266-267), `--a-panel-gutter` (ui:596), `--ws-*` (identity-gate:24-29), `--a-identity-*`
  (surface-kit), `--atlas-font-*` / `--ws-*` private scales, `--a-entity-record-pane-gap`/`-inset`
  (record-collaboration:10-11), `--a-entity-record-pane-padding`/`-scrollbar-clearance` (record:483-484)**
  — all defined in the same file that consumes them; the gate classifies them `local` correctly.
* **`a-button--*`, `a-badge--*`, `a-toast--*`, `a-notice--*`, `a-action--*`,
  `a-separator--horizontal|vertical`, `a-entity-list--compact|comfortable|spacious|embedded|loading`,
  `a-entity-list__header--loading`, `a-entity-list__state--error|empty|inline`,
  `a-entity-list__column-filter--active`, `a-entity-list__sort-indicator--active`,
  `a-entity-list__status--success|warning`, `a-transfer-workspace__status--*`,
  `a-related-detail--postal-detail`, `a-related-record--compact`** — template-composed at the call
  site; not dead. (My first pass flagged these; the template-literal search is what cleared them.)
* **`rdp-*` classes in `foundation/ui`** — supplied by `react-day-picker`, imported at
  `packages/platform/foundation/ui/src/date-picker-calendar.tsx:10`
  (`import "react-day-picker/style.css"`).
* **`.a-comment-card:target` dead but the sibling selector works** — the real element carries
  `id={`comment-${String(item.id)}`}` (`form-detail/src/comments-workspace.tsx:1777`) so
  `[id^="comment-"]:focus-visible` matches; deep-link focus styling is functional.
* **`iam/identity-gate/src/styles.css:16-22` pinning `--a-focus`/`--a-danger`/… to literals** — the
  block is scoped to `.a-public-identity__story` (not `:root`), documented at lines 7-15, and cannot
  leak into the app's global theme. It is reported only through F3 (gate conflict) and F4
  (third copy of the palette), not as an override bug.
* **`.a-entity-record__tabs` having two `top` declarations (F9)** — on the Country route both forms
  evaluate to the same `5.75rem` because `--shell-topbar`/`--shell-crumbs` are always set by
  `.athyper-shell` and breadcrumbs are present, so there is no visible misalignment today. The finding
  is about the dead declaration and the fallback-free survivor, not about current rendering.
* **`color-mix(in srgb, var(--a-*) …)` everywhere** — derived values from tokens, not literals; the
  gate's `colorLiteral` correctly ignores them.
* **`!important` on `.a-visually-hidden`/`.athyper-visually-hidden`/`[hidden]` and inside
  `prefers-reduced-motion`** — 14 of the 38 `!important` rule blocks; these are the standard
  unavoidable patterns.
* **`apps/studio/.next-bp-consolidated/...` still containing `.a-company-groups`,
  `var(--a-surface-subtle)`, `.a-record-360*`** — stale output from a removed
  `packages/planes/neon/business-partner` plane and a pre-rename `record-360` component
  (`.a-record-360` has zero hits in current source). It is build litter, and the finding is that a
  gate reads it (F1), not that the source is wrong.
* **`--a-brand:#234b84` identical in the light and dark blocks** (`theme/src/styles.css:8` and `:19`)**
  — deliberate: the dark block only changes `--a-primary` via `color-mix`, so the brand hue stays.
* **`packages/planes/{neon,mesh,studio}/shell/src/styles.css`** — each is a thin `@import` plus
  plane-local chrome (`--a-space-*`/`--a-radius-*`/`--a-z-popover` used with fallbacks such as
  `var(--a-z-popover,60)`), no literals, no duplication with each other.

## 6. Structural assessment and what to change

**Layers as they exist.** Token authority (`foundation/theme/src/styles.css`) → primitives
(`foundation/ui/src/styles.css`) → kits (`surface-kit`, `identity-gate`) → shell
(`shell/shell/src/styles.css`) → runtime (`entity/runtime/list-view`, `.../form-detail`,
`collection-controls`) → planes (`packages/planes/*/shell`). Composition is CSS `@import`
concatenation in app layout order, with no cascade layers and no scoping, so every rule is global and
the effective winner is decided by import order plus specificity (24 rule blocks use `!important` to force
it).

**Concrete problems with that structure.**

1. **The foundation layer owns runtime/business selectors.** `foundation/ui/src/styles.css` contains
   `.a-entity-record*` (lines 131-164), `.a-collection*` (313-336, 384-422), `.a-related-record*` /
   `.a-related-detail*` (167-242), `.a-data-surface*`, `.a-data-section*`, `.a-form-layout*`,
   `.a-subsection-header*`, `.a-context-selection*`. The policy that is supposed to prevent this
   (`verify-foundation-phase1.mjs:73-79`) only inspects **import specifiers**:
   ```js
   for (const file of sourceFiles(join(foundation, "ui", "src")))
     for (const specifier of importSpecifiers(readFileSync(file, "utf8")))
       if (forbiddenUiTerms.test(specifier)) violations.push(...)
   ```
   A CSS class name in the same package is invisible to it. Consequence: the entity runtime cannot
   ship without the foundation UI stylesheet, and a "foundation" change can alter entity pages.
   **Change:** move these blocks into `entity/runtime/form-detail` (which already owns
   `.a-metadata-detail*`) and extend the purity rule to selector text, not just imports.
2. **Three naming schemes for one vocabulary.** Global tokens use `--a-*` (148 names); component-local
   tokens also use `--a-*` (`--a-field-*`, `--a-page-sticky-top`, `--a-record-sticky-top`,
   `--a-identity-*`, `--a-entity-record-pane-*`) and mix with non-`a` namespaces (`--ws-*`,
   `--atlas-font-*`, `--rdp-*`, `--shell-*`, `--loader-rail`, `--form-section-top`). Because the gate
   treats any `--a-*` as global-vocabulary-or-unresolved, real component tokens generate warnings that
   have to be triaged every run (six of the eight blockers in F2 are of this kind). **Change:** reserve
   `--a-*` for the authority, use a component prefix (`--entity-record-*`, `--field-*`,
   `--identity-*`) for local tokens, and teach the gate to ignore non-`--a-` local tokens.
3. **No cascade layers.** With `@layer tokens, base, components, runtime, overrides` in the app's
   entrypoint, the 24 specificity `!important` blocks and the load-order dependency in F8 disappear.
   This is the single highest-leverage structural change available here and is contained (one file
   plus `layer()` wrappers).
4. **Two disjoint token pipelines.** `styles.css` is hand-maintained and rendered; `tokens.ts` is
   generated-from/consumed-by the IAM pipeline. Pick one (F4). If the generated pipeline wins, the app
   stylesheet becomes an artefact and the whole "is the palette consistent" question disappears.
5. **Enforcement is red, so it is decorative.** F1+F2+F3 must be fixed before any of the above can be
   defended by CI. The order should be: F1 (one-line gate fix) → F3 budgets re-baselined → F2
   burn-down with the ratchet tooling that already exists → then the structural work.
