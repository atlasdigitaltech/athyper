# Phase C — Country localization vertical slice

## Status and rollout boundary

The source/compiler/reader/UI slice is implemented and exercised with English,
Malay and Arabic. Country release 7 (`3a3d4961-0103-45c9-b2b0-eef85d950fc3`)
was subsequently published and activated on Studio, Neon and Mesh through the
governed successor workflow. Collaboration settings match release 6, including
Private default. No immutable signed payload was rewritten, no BP metadata was
restored, and no database schema or profile registry was added.

Publication evidence is recorded in `measured-entity-performance-20260928.md` and
the adjacent `localized-successor-*-20260928.json` receipts. Compatible readers,
changed-compiler qualification, independent OTP-backed policy approval, signing
and all target activation checks completed. Authenticated Neon reads confirmed
localized descriptors and release 7 collaboration. The user's manual Studio/Mesh
signed-in acceptance and native-language terminology review remain outstanding
before treating the full mass-onboarding acceptance gate as closed.

## One label contract, compatible strings

Authoring accepts existing strings or the existing runtime localized-text shape:

```json
{
  "labelKey": "entity.country.fields.name",
  "defaultText": "Name"
}
```

Country supplies references for its entity/title, 22 fields, four sections, and
Overview navigation label. Stable field/section/entity codes do not change.
Country names, comment bodies, filenames, identifiers and other record values are
not translated by looking them up in message catalogs.

The shared-reference parser normalizes labels into legacy fallback strings plus
validated references. Contradictory object/reference input or mismatched fallback
text is rejected. Existing historical source-hash tests reconstruct historical
string input; their approved expected hashes were not changed.

## Where references travel and are stored

```text
definition.json
  → validated shared-reference definition
  → authoring graph surface layout JSON
  → listPresentation.localizedLabels / recordPresentation.localizedLabels
      + section.localizedLabel / navigation tab.localizedLabel
  → native runtime projection and descriptor parser
  → authorized list/application/detail browser descriptor
  → locale-specific rendering of labels
```

References are carried in existing JSON authoring/compiler structures, not new
columns. Once governed publication occurs, the compiled metadata remains inside
the existing `runtime_meta.applied_release_payload.payload_json` publication
package. Existing activation-head/release lookup and signature verification remain
the authority. The browser catalog contains text, not grants or mutable capability
policy. Catalog deployment must precede or accompany metadata referencing it;
`defaultText` gives older/missing catalogs a readable fallback.

The qualification fixture serializes the authoring graph, recompiles it, checks
the same compiled identity, then runs the real native projection, descriptor
parser and authorized detail service. It does not insert or activate database rows.

## Locale and fallback ownership

- Reuse the shell's existing `EffectiveLocalization` and `IntlProvider`; do not
  independently choose browser language or introduce plane-specific cookies.
- Catalog selection follows the governed locale; dates/numbers use the governed
  formatting locale, time zone and numbering system. Calendar dates retain UTC
  date-only semantics.
- Label fallback is selected catalog → English catalog → authored `defaultText`.
  Legacy strings remain literal. Label text is not evaluated as ICU or HTML.
- Shared messages use ICU templates, including plural counts. English fallback
  templates use English plural rules, not Arabic/French rules applied to English.
- Keep raw descriptors in state/cache. Localize a render projection, so switching
  locale cannot replace stored metadata or translate user-authored record data.
- Components share a formatter cache per immutable localization object. Locale
  switching does not remount the comment composer or discard its draft.

## Generic folder ownership

| Location | Responsibility |
| --- | --- |
| `packages/platform/foundation/i18n/src/catalogs/collaboration.ts` | Shared Comments, Files and record-navigation copy in en/ms/ar |
| `packages/platform/foundation/i18n/src/catalogs/country.ts` | Country-owned label messages, not Country-specific runtime logic |
| `entity-catalogs.ts`, `entity-react.ts`, `entity-labels.ts`, `entity-errors.ts` in that i18n folder | Catalog composition, shell-localization adapter, authorized-label projection, safe error mapping |
| `packages/contracts/platform/entity-runtime/src/presentation-localization.ts` | Validated references and readable-field filtering |
| Existing Studio authoring, metadata, records and entity-runtime folders | Carry and consume references through existing generic paths |

The pilot explicitly composes shared and Country catalogs. Do not turn this into
one enormous catalog copied into every app for 1,000 entities: keep entity-owned
namespaces and introduce route/locale-specific catalog loading as the catalog set
grows. Runtime entity behavior remains generic; no `if Country` branch was added
to descriptor rendering or server projection. No live database registry is needed
for this slice.

## Errors, formatting and accessibility

List-filter service errors retain stable codes and English fallback details.
Safe parameters such as `{max}` or `{field, operator}` pass through both record and
entity-list HTTP adapters as `errors.params`. Submitted malformed filter values
are not echoed into those parameters. UI translation selects allowlisted codes;
arbitrary server messages cannot become ICU templates. Unknown/unmapped diagnostic
messages continue using fallback copy rather than disappearing.

Shared counts use whole-message plural templates; comment dates, attachment dates,
file-size numbers and numeric detail values use the formatting runtime. Visible
and accessible action labels use the same shared catalogs. Arabic sets RTL through
the existing provider. The collaboration resize handle now mirrors both pointer
and arrow-key calculations in RTL; English behavior and focus/tooltip regressions
remain covered.

## Verification

- 208 Studio authoring tests passed, including unchanged historical Country hashes.
- 83 metadata tests passed; two environment-dependent tests skipped.
- 309 records tests passed; three environment-dependent tests skipped. New HTTP
  tests verify stable code, parameters and fallback detail through both routes.
- 367 publication tests passed; signing/admission was not bypassed.
- 18 localization/foundation checks passed: all three planes' compiled references,
  actual authorized list/detail projection and en/ms/ar labels, legacy strings, permission
  filtering, unchanged non-localization behavior, invalid references, fallback,
  plural categories, dates/numbers, catalog formatting and error parameters.
- 108 collaboration browser tests passed, including Country en/ms/ar rendering
  and locale changes preserving drafts. Focus, tooltip, navigation, version-history,
  upload and side/full-view regressions are retained.
- Subsequent targeted preview/visibility/locale/RTL-resize checks passed (12 tests).
- Affected i18n, collaboration UI, entity detail/list, authoring, metadata and records
  packages passed typechecking during implementation.

Arabic rendering was visually inspected in the browser fixture. Malay/Arabic
translations still need native-language/product terminology review. This is not a
claim that every application screen or every possible server diagnostic is now
translated. Studio/Mesh manual signed-in checks remain with the user, as requested.

## Successor checklist

1. Deploy compatible contracts/readers and the catalog-bearing UI in target planes.
2. Qualify the changed compiler under the existing fingerprint/approval workflow.
3. Compile a Country successor with the active collaboration settings preserved;
   do not implicitly adopt the separate Public-default source proposal.
4. Review the semantic diff: only approved localization references should change
   behavior. Publish/sign using the normal workflow and explicit target list.
5. Verify every target receipt and active release, then manually check list/manage/
   detail labels, Comments/Files, RTL, date formatting and draft preservation.
6. Close the gate only after those checks pass; then reuse this convention for new
   entities rather than copying English-only authoring definitions.
