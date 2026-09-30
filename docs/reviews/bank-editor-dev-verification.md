# Bank editor — DEV verification

Active local Meta Entity preview: revision 44, bankEditorVersion 2. Activation receipt: governance/policy/reports/bank-editor-activation.dev.json. This is DEV activation, not a production release.

The reusable form renderer consumes authored lookup filters, copy mappings, field variants, clear-on-change confirmations, format validation and reveal labels. Bank-specific configuration lives in business-partner-bank-editor.ts. Directory choices come from published shared bank tables; account identifier options come from active control rules. The UI contains no country-to-bank mapping.

Country/bank changes preserve the account number and holder. Unlisted banks have explicit manual fields. Server capture validates supplied directory coordinates against the referenced institution/branch version. Format checks and directory membership do not prove account ownership. Identifier eligibility uses the union of active country rules; payment-rail requirements remain separate.

The running DEV directory has no active banks or branches. Manual capture works; directory cascade and copied BIC were verified using synthetic browser fixtures. No reference records were published and no live business-partner cases were created.

Validation: 11 focused foundation tests, 6 request-capture tests, 2 browser tests, and the live desktop/mobile probe passed. Form-detail typecheck and master-data production TypeScript check passed. The broader records typecheck remains blocked by existing unrelated test-fixture type errors.

Live browser receipt: governance/policy/reports/bank-editor-browser.dev.json. Screenshots were relocated to `~/.athyper/instances/dev/artifacts/bank-editor/imported/`; see [local artifact storage](../runbooks/local-artifacts.md).
