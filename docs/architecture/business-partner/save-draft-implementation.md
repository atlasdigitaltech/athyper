# Save draft implementation status

Source implementation and development preview revision 41 are active. The runtime case contract is now published in NEON. Live creation of an incomplete draft now succeeds without an onboarding template. Live edit, reopen and clearing a saved field now pass with the authorized catl.admin account; earlier browser transport checks were explicitly intercepted.

## Delivered

- Save draft stays on the current form and displays the server request reference and saved timestamp. Later saves use the returned request ID and version through PATCH.
- Draft validation checks supplied values, shows the shared inline/linked field errors and omits submission-only mandatory-field errors. Continue to review restores full validation.
- Pending, processing, unavailable and failed attachments block saving their associations. Removing the document entry releases its blocker. Existing managed upload/protected-value paths remain in use.
- The form guards unsaved changes and saves in progress. An uncertain network/server outcome retains the exact serialized command and idempotency key; fields remain disabled until the save is reconciled by retry. Explicit rejected commands keep the entered data editable.
- Cleared visible canonical fields are sent as explicit removals and omitted from the resulting snapshot payload. Saved request-only fields and repeatable collections are updated through their typed paths.
- The repository recognizes an exact PATCH replay only when its recorded actor, command key, resulting snapshot and version still match the current draft. The service avoids duplicate update effects for that replay. Other stale saves fail with the existing version-conflict response; the request-reference action opens the saved request through the unsaved-change guard; this API does not expose the database command's three-way merge facility.
- Reopening refuses a different active form hash/version instead of silently interpreting saved fields under a different definition. Historical-form loading and an automatic upgrade flow remain unavailable.
- The registered initial runtime case schema now permits omitted name/ownership values while retaining supplied-value constraints. Draft creation no longer invents a registered name from the request number. Submission still uses complete Meta Entity validation.

## Validation evidence

- Focused frontend suites: 17 tests passed for attachment admission/readiness, serialization, relationships and submission.
- Master-data suites: 67 tests passed in total, including replay effects and incomplete-capture submission rejection.
- Publication case-contract suite: 24 tests passed.
- Metadata authoring suite: 5 tests passed; shared validation suite: 3 tests passed.
- Product, shared form-detail and master-data source typechecks passed.
- Browser probe: same-form saving, exact retry after a lost response, subsequent PATCH versions, clearing saved fields and requiredness switching passed using intercepted mutations. Zero live cases were created. Receipt: `governance/policy/reports/business-partner-save-draft-browser.dev.json`.
- PostgreSQL draft-command regression passed with rollback. The additional incomplete-draft regression verified omitted names, revisions, history preservation, clearing, replay, merge/conflict and atomic evidence counts, then rolled back all fixtures. Test: `server/db/scripts/tests/integration/business-partner-incomplete-draft.sql`. These synthetic contract fixtures are test data, not a published runtime contract.

## Runtime activation and remaining blocker

Following explicit user approval, additional exact-tenant Studio grants were assigned: catl.admin author, and catl.owner read/publish. The earlier catl.admin read grant remains. Permission flags for MFA and separation of duties are unchanged. Receipt: `governance/policy/reports/business-partner-definition-publication-grants.dev.json`.

Admin staged the current registered initial case contract with 201, revision `fec7fec0-76e1-4096-8dd2-3511f212d6e4`. Owner independently read the staged hash and published it with 202, release `3be0304e-58f1-44dc-9cf3-0f89efcc2c0a`. Normal compilation and consumer delivery completed: NEON now contains the published `master.business_partner` contract. Receipt: `governance/policy/reports/business-partner-save-draft-runtime-activation.dev.json`.

The existing Studio first-publication migration was applied earlier; no predecessor or historical approval was invented. The proposal's approval flags describe its preparation state; the staging/publication/activation receipts establish the subsequent live results.

Live Save reached the server and exposed an omitted route allowlist entry for `bankAccounts` and `supportingDocuments`. This was fixed and a route regression passed. The next live create attempt returned `503 BUSINESS_PARTNER_ONBOARDING_TEMPLATE_UNAVAILABLE`: the existing request-created event adapter requires a published `BP_SUPPLIER_ONBOARDING` cycle template. This was the earlier blocker, resolved by the cycle separation below. Receipt: `governance/policy/reports/business-partner-save-draft-live.dev.json`.

The user subsequently approved separating draft persistence from cycle startup. Internal manual supplier request create/update/validation events now skip the cycle coordinator's template lookup and cycle writes. Submission still requires the template and creates the cycle in the submission transaction. Internal invitation prerequisites complete at submission so the remaining task dependencies can progress. Existing external invitation paths retain their behaviour; later internal events cannot create a missing cycle independently.

Live POST now returns 201 for request `740e21e1-39f2-42a3-af55-3998b5a154b5`. Database verification confirms status draft, version 1, an actual saved snapshot with no invented name, zero cycles for the request and zero published supplier templates. Receipt: `governance/policy/reports/business-partner-draft-without-cycle.dev.json`.

The initial PATCH returned 403 for `neon.relationship.entity_case.update`. Following explicit user authorization, catl.admin received that permission scoped to catl.operations. A second authorization defect was corrected: unchanged ownership is authorized against the stored case, while actual organization/company changes still require the proposed-scope check. The 54 service regression tests and service typecheck pass. Live PATCH saves now return 200 at versions 2, 3 and 4; reopening restores the saved name and clearing it persists successfully. Receipt: `governance/policy/reports/business-partner-save-draft-live.dev.json`. The template remains a prerequisite for submission, rather than for Save. Live attachment tests remain outstanding.

## Limits

This phase covers the internal supplier intake. File content is not copied between request and master data; only request links are created here. No Business Partner, operational bank account, approval or payment setup is created by Save draft. Live upload and saved-document reopening tests remain outstanding. Live draft creation, authorized editing, reopening and field clearing have passed.

Lifecycle follow-up validation: six coordinator tests cover draft events without a database, missing-template rejection on submission, a single cycle across repeated submission events, internal prerequisite completion and unchanged external entry behaviour.

## New and Edit request headers

The manual supplier draft editor now uses the same metadata intake shell as New. Reopening starts at Details; only the persisted Partner selection is marked complete. The saved role/target step is locked so returning to it cannot discard or reinterpret an existing draft. Required Details validation still precedes Review.

The first successful draft save replaces browser history with the request edit URL without remounting the form. The header switches to Edit, displays draft/role/request-number/save context, and uses Close. The existing unsaved-change guard remains, and navigation is blocked during saving. The record breadcrumb substitutes the request number for the UUID while preserving the final Edit segment. Ordinary entity tabs and the New request action are replaced by the intake header and progress navigation.

Edit labels are supplied by the Details surface formLabels; the New title and step descriptions remain supplied by the intake flow. Development preview revision 43 is active (see `business-partner-request-header-activation.dev.json`). No database migration is required.

Validation: product typecheck, eight intake tests and two breadcrumb tests pass. Live read-only New/Edit checks pass (`business-partner-request-header-live.dev.json`). The intercepted-mutation Save probe uses the active metadata and confirms same-form URL/header transition, exact retry, subsequent PATCH and clearing values; it creates no live cases.

### Compact header refinement

The request header now uses two rows: title/actions, followed by request identity at the left and persistence status at the right. This replaces the instructional subtitle and the separate context paragraph. The second row shows the role, Draft badge, abbreviated reference and Copy action; the full reference remains in the breadcrumb and clipboard. Saving/unsaved feedback updates in place. Older saves include the date; the full localized timestamp includes the timezone in its tooltip. Before role selection the second row displays the metadata-authored role hint. Small screens allow the context/status row to wrap.

Header label metadata is active in development preview revision 46. Live checks cover both headers, reference copying, desktop row alignment and mobile overflow. The product typecheck and eight intake tests pass.

### Header and navigation visual polish

The context row uses muted 13px text, separators and an icon-only copy action with an accessible label, tooltip and copied confirmation. Unsaved status includes an amber dot alongside text. The title/context gap is 6px and entity header/navigation/content spacing is 16px. Overview, Manage and intake navigation use a flat bottom divider with an active underline rather than a raised card. Request detail now registers a single shared header using the proposed registered name (or request title/reference fallback) and a readable request breadcrumb.

Development metadata revision 47 is active. Typecheck and eight intake tests pass. Live read-only browser checks verify New, Edit, request detail, Overview and Manage, including copy, responsive wrapping and header/navigation spacing.
