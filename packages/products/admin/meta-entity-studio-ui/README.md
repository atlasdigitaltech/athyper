# Meta Entity Studio UI

Accessible React workspace for the canonical Meta Entity authoring model.

## Styling policy

- Use Athyper semantic theme utilities and shared UI primitives.
- Do not use inline styles, hard-coded colors, arbitrary Tailwind values, or a
  package-local stylesheet.
- Do not import the legacy Admin metadata Studio.

Run `pnpm verify:theme` to enforce the utility/theme boundary.
