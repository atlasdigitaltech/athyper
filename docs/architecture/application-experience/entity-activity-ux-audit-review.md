# Activity UX: audit response and companion interaction specification

Status: revised design proposal, 2026-09-28. Read with [Meta Entity requirements](entity-activity-ux-requirements.md).

Prototype: [interactive HTML](../../prototypes/entity-activity-comparison-v2.html). All values, actors and event outcomes are illustrative fixtures. This is not a live application, a Business Partner enrollment, or evidence of captured production history.

## 1. Review conclusion

Accept the audit's central finding: preserve the contract separation, but make it invisible as an application navigation structure. Users should understand three things: what changed, who/when, and the limits of this comparison.

The two highest-priority decisions before Delivery A are now explicit:

1. Changes only filters business differences. A separate compact Comparison notes area preserves discoverable coverage/compatibility limitations without counting them as changes.
2. Notes are quiet by default. A prominent result-level explanation is required when a no-differences result would otherwise suggest completeness that the comparison cannot establish.

Do not implement Coverage, Authorization or Compatibility as additional business-user tabs.

## 2. Contract-to-screen mapping

| User question | Visible surface | Supporting contracts |
|---|---|---|
| What changed? | Section summaries, collection items and field comparisons | Presentation, comparison definition and captured values |
| Who and when? | Capture time/actor/type; separately sourced event or item attribution | Snapshot manifest, Activity profile and event providers |
| How should I interpret this result? | Capture indicator, local comparison notes and scoped no-differences explanation | Coverage, current authorization, schema compatibility and publication qualification |

Published bindings are infrastructure, not a seventh visible screen. Timeline is another way to read recorded activity within these questions, not a new user-facing contract concept.

## 3. Audit disposition

| Audit point | Decision | Visible behavior |
|---|---|---|
| Contract complexity leaks into UX | Accepted | Three user questions; no contract-specific navigation |
| Coverage warning fatigue | Accepted | Compact capture indicator and local notes; no repeated warning banners |
| Schema-change scenario missing | Accepted | Added historical-layout scenario with both a mapped section move and an unmapped field |
| Changes-only versus coverage contradiction | Resolved | Differences in the main area; persistent Comparison notes outside the differences count |
| Same snapshot selected twice | Explicitly blocked in v1 | Two distinct snapshot identities; selecting one twice does not check live state |
| Snapshot rows too dense | Accepted | Time, actor and type; one accessible coverage button rather than a coverage paragraph |
| Zero-count categories | Accepted | Omit categories with zero items; separate record and field counts |
| Expand/collapse all missing | Accepted | Both controls operate on visible comparison sections/items, including notes; not the record-information panel |
| Added/removed micro-attribution | Accepted with provenance requirement | Show a source-backed change actor/time; otherwise state that change attribution is not recorded |
| Standalone versus grouped events | Accepted | Group has a disclosure and event count; standalone event has neither |
| Group outcomes hidden when collapsed | Accepted with density limit | Each outcome stays visible in the three-event example; large groups require explicit outcome counts and disclosure of all individual results |
| Reduced-motion missing | Accepted | No essential animation; disable optional transitions under reduced motion |
| Side/full triggering unclear | Resolved | Explicit user toggle; narrow viewport independently changes column layout without resetting state |

A comparison of snapshot X with itself can only confirm that an immutable object equals itself. It cannot confirm that nothing changed since X. A future “compare with current record” feature would require its own authorized read and consistency contract and is not included here.

For groups too large to show every event badge comfortably, do not claim the collapsed representation lists every outcome. Show accurate failed/succeeded/pending counts and the total event count; expanding exposes each event with its own badge. Never substitute a single green aggregate badge for a mixed history.

## 4. Comparison-note hierarchy

| Situation | Default presentation | On expansion |
|---|---|---|
| Complete declared capture | Neutral capture-info indicator in snapshot row | Accessible explanation of included scope; no “verified” implication |
| Changes exist and an unrelated discoverable section has a limitation | Small Comparison notes row below changed sections | Local explanation and authorized captured values/states |
| A changed section contains a field with missing coverage | Quiet note in that section | Explain the limit beside the affected field |
| No comparable differences, but some required comparison scope is unavailable | One prominent result-level explanation | Detail the affected discoverable sections; do not repeat the banner per section |
| Section is not discoverable under current access | Omit the section and all identifying counts | Nothing to expand |

A complete capture can still have values a current viewer cannot access. The capture-info indicator describes stored coverage; comparison notes describe what this viewer can compare. Neither is an integrity badge.

“Empty · captured”, “Not captured”, “Unavailable with your access”, and “Not comparable · schema mapping unavailable” remain distinct states. Do not merge them into one dash or one generic unavailable value. Only expose restricted-field labels when discoverability is allowed.

## 5. Changes-only wireframe

```text
Snapshot comparison
Earlier date/time → Later date/time
4 changed addresses · 1 affected section

[✓ Changes only]                    [Expand all] [Collapse all]

⌄ Addresses                  1 added · 1 updated · 1 removed · 1 replaced
  › Registered office        Updated
  › Billing address          Removed
  › Correspondence address   Linked address replaced
  › Delivery address         Added

COMPARISON NOTES · NOT COUNTED AS CHANGES
› Banking                    Some values cannot be compared

1 unchanged section hidden. Turn off Changes only to view it.
```

With Changes only off, unchanged and limited sections return to their ordinary authorized presentation order. Do not duplicate a limited section in both the main area and the notes area.

In the prototype, a section with changed fields opens by default. An item within a multi-record section starts collapsed. A single collection item may open automatically. Expand all is scoped to what is currently displayed; it does not fetch or expose every page of a large collection.

## 6. Historical-layout scenario

Include a third acceptance entity/scenario beyond the initial Country and Address examples:

- Earlier section: Contact details. Later section: Communications.
- Primary email retains the same stable field identity and value. A published compatibility mapping permits comparison. Explain the section rename/move without counting a data change.
- A legacy delivery-instruction field has no approved mapping. Preserve its earlier captured value in Earlier layout / Additional fields; display the later side as not comparable, not empty or removed.
- If both snapshots have no comparable value changes, show the scoped no-differences message with a prominent explanation of the unmatched field.

A flat fallback is an inspection surface, not a license to compare incompatible values. Section movement, localization and label changes alone never determine identity or business change counts.

## 7. Attribution and event grouping

Snapshot rows identify who captured the copy. They do not identify who made every change between the selected snapshots.

An expanded added/removed/updated item may show “Recorded link addition: Address import service · 13:52” only when a provider supplies attributable evidence for that item and operation. Keep “Captured later by Maya Chen” separate. If evidence is unavailable, show “Change actor not recorded in these captures” without guessing.

The prototype's Timeline includes:

- A standalone snapshot-capture event without a grouping disclosure.
- An explicit three-event processing group with Failed, Successful and Successful outcomes visible while collapsed.
- A standalone record-view event that does not claim field changes.

Grouping requires scoped source identities, never timestamp proximity. No automatic association between an event fixture and a snapshot comparison is implied beyond the explicitly described fixture.

## 8. View switching and accessibility

Side/full is a user action available in the Activity header. Preserve selected snapshots, comparison direction, Changes only, expanded items and focus on this transition. Use one logical comparison state; do not run independent side/full comparisons.

For this prototype, viewports at or below 800px stack Earlier/Later values, hide the underlying record preview, and use the available width. This responsive presentation does not clear the user's chosen Activity mode. Production must map this behavior to the shared layout breakpoint/token system rather than add entity-specific CSS.

Capture indicators must open on click/tap, Enter or Space, not hover alone. Use accessible names describing the captured scope information. Timeline disclosures use native keyboard-operable controls. Tabs support keyboard navigation, including RTL direction. Reduced motion removes optional animation without affecting information or actions.

## 9. Prototype walkthrough and limits

Open the HTML file in a browser; it requires no server, installation or network access.

1. Business Partner: expand the updated, added, removed and replaced address items; inspect the quiet Banking note.
2. Switch side/full while an item is expanded. Try dark theme and RTL.
3. Turn off Changes only to inspect unchanged and captured-empty fields.
4. Select Country to see field formatting and section-based summaries. Compare snapshots 2 and 3 for equal captured values.
5. Select Layout/schema change to inspect the moved section and unmapped historical field.
6. Select Incomplete capture to see the prominent qualification of a no-differences result.
7. Open Timeline and expand the processing group; its failed attempt remains visible.

This is a design artifact using local fixture data and a shared renderer. It does not implement metadata publication, live permissions, database capture, large-collection pagination, retention or authoritative Timeline APIs. Versions are omitted from this focused preview; the existing capability-gated Versions design is unchanged. Audit log uses static fixtures, not working server filters.

Prototype colors are centralized local preview variables. Production must use the existing application theme tokens and components, not copy these palette values or demo controls into the application.

Run `node docs/prototypes/entity-activity-comparison-v2.checks.mjs` for interaction checks and regenerated screenshots. Those checks validate prototype behavior, not production authorization or WCAG conformance.

## 11. Follow-up audit closure

The follow-up review identified three valid demonstration/test gaps, with no change required to the core comparison design. All three are closed in the standalone prototype:

| Gap | Added evidence |
|---|---|
| Large groups were specified but not demonstrated | A second Timeline group contains 12 events: 2 failed, 2 pending and 8 successful. Counts derive from the fixture events, remain visible while collapsed, and reconcile with the individual results on expansion. There is no single aggregate success badge. |
| Capture-information keyboard behavior was untested | Browser checks focus the native disclosure and verify opening with Enter, opening with Space, and closing with Space. |
| Zero-count omission was untested | Country checks verify the absent collection category after both Collapse all and Expand all. Equal snapshots verify that all zero-count summary categories are omitted. |

Validation: 34 browser checks passed with no browser runtime errors. These checks cover the prototype only; they do not establish production accessibility conformance, provider completeness or authorization enforcement.

One correction to the review's evidence description: disabling the third checkbox establishes the maximum of two selections. Distinctness also follows from the unique snapshot controls and selected-identity set; that assertion alone does not prove a production API rejects duplicate identities. Production validation must enforce two distinct snapshot identities independently of the UI.

Design readiness: ready to proceed with Delivery A implementation. The large-group interaction is now demonstrated for Delivery C; production pagination, permission filtering and authoritative outcome totals still require implementation-level verification. Counts must describe the authorized event set and disclose whether they cover the full group or only a loaded page.
