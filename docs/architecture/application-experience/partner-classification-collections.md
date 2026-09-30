# Partner Industries and Commodities — DEV acceptance

2026-09-24. **Implemented and active in signed DEV release 25.**

- Industries is a first-class section beside Commodities. Identity no longer publishes crosswalk cards.
- Industries shows actual partner assignments: classification system, code, readable business activity, primary flag, declaration source, lifecycle/verification status, effective dates and provenance.
- Commodities shows declared UNSPSC codes/descriptions, classification verification, effective dates/source and optional tenant-category matches. Existing legacy category assignments remain explicitly labeled; no UNSPSC declaration is fabricated from them.
- Both collections keep reference crosswalks under a closed-by-default **Related classification mappings** disclosure. Mapping confidence/source/verification are labeled as mapping properties, with an explicit warning that mapped codes are not declarations and mapping verification does not verify the partner.
- Existing tenant and classification/identity permissions remain authoritative. No role, company, qualification, grant or partner-fact changes were made. Cross-tenant requests return safe denial, not an internal-error response.

## Evidence

- Release 24 introduced the presentation; release **25** corrects caption keys to the browser's accepted lowercase format.
- Release ID: `bc6cc765-4ccf-55ea-95ad-155deef86112`; applied ID: `01a0cf02-adba-7304-97c0-aac59c216157`.
- Artifact hash: `6b2334393845724c870c60a51067c57f3f498162d14baf7a9426e7409e399e02`.
- Compiled hash: `sha256:29bb36b0ff01d5364f1464b54145043a5e3175f962d12a8fa5b28e1b2a2f8b95`; 110 artifacts, Ed25519.
- Isolated publication changed only the scoped classification cores/sections and detail navigation, retaining unrelated frozen release artifacts.
- CATL Aster API/browser acceptance passes: two actual ISIC assignments, readable descriptions/provenance/primary flag, UNSPSC `41101502` mapped and `41101503` unmapped, collapsed mappings with working expansion, no browser errors, no old crosswalk heading, cross-tenant denial for both collections.
- Re-run read-only acceptance with `node tooling/scripts/verification/verify-partner-collections.live.mjs` using a normal saved CATL admin session.

## Scope boundary

This increment fixes partner collection presentation and authorized projections, not the pending industry/UNSPSC capture forms or category-administration screens. Existing governed writers remain unchanged. Qualification is still a separate commercial decision; reference mappings never create partner classifications.
