# Business Partner UI/UX polish

Scope: all Business Partner screens, delivered one area at a time. Preserve the owning APIs, permissions, workflow semantics and document gates. Use the existing NEON visual system across every area.

## Shared standards

- Put the record's identity, current status and next available action first.
- Use consistent typography, spacing, borders, status labels and button hierarchy.
- Separate case outcomes from individual task outcomes and document readiness.
- Keep technical coordinates and raw evidence in accessible disclosures; retain history and exact links.
- Use readable cards and timelines on narrow screens; avoid page-level horizontal overflow.
- Show only actions supplied by the owning APIs. Disabled or blocked actions must explain the prerequisite.
- Verify desktop and mobile layout, keyboard focus, empty/error states and role-specific action visibility.

## Delivery sequence

| Pass | Screens and work | Observable exit |
| --- | --- | --- |
| 1 | Request detail, task presentation, clarification, documents, review actions and submission history | Consistent summary, cards and sections; unchanged commands and evidence access; typecheck, existing tests, production build and deployed browser checks |
| 2 | New request and returned-request forms | Consistent section structure, field help, required/error states, save/validate/submit hierarchy and correction guidance |
| 3 | Overview, Manage, Review & Approval lists | Aligned filters, row density, statuses, empty states and links into request/partner detail |
| 4 | Business Partner 360 and activity | Consistent identity header, role/scope context, section cards, readable activity and responsive tabs |
| 5 | Supplier readiness, organization/company setup and customer controls | Clear prerequisites and permission-owned actions; consistent readiness and closure presentation |
| 6 | Cross-screen review | Uniform labels, action placement, responsive behavior, accessibility and loading/error states across all preceding screens |

## Pass 1

Implemented: four-part journey summary; section links; task cards with textual status badges; separate review/decision panel; consistent document, information and readiness panels; submission history expanded by default. Shared styling also improves table readability and confines raw evidence to scrolling disclosures.

Business behavior is unchanged. The historical approver display still relies on the existing API projection; adding resolved approver names, decision timestamps and reason columns needs a separately reviewed projection/presentation change. This pass does not claim that enhancement.

Validation: Business Partner typecheck, 225 existing tests and NEON production build passed. Deployed browser layout evidence is recorded in `governance/policy/reports/business-partner-ui-pass1.dev.json` when available. Later passes remain scheduled; they are not marked complete by this first pass.
