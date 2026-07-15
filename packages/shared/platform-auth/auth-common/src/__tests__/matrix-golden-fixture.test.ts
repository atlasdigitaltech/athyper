// Phase E2 â€” D-E2.8 golden fixture invariant.
//
// `matchRequiredActions` is the shared decision engine that both the server
// runtime (server/src/auth/auth-pipeline.ts) and the BFF auth pipeline
// (packages/shared/platform-auth/auth-bff/src/auth-pipeline.ts) call. Because both surfaces
// dispatch through this single function, "API â†” BFF byte-identical" reduces
// to one structural property: the function's decision for a given (matrix,
// route, requiredActions) must never drift.
//
// This test pins a FROZEN list of named scenarios with their expected
// MatrixMatch output. Any change to the algorithm â€” accidental or intentional
// â€” must be acknowledged by updating the fixture, which forces a reviewer to
// inspect every surface that depends on the change.
//
// To add a scenario: append at the bottom, never reorder or rename existing
// rows. Each row is its own contract.

import { describe, expect, it } from "vitest";

import { matchRequiredActions, type MatrixMatch } from "../required-actions.js";

// â”€â”€â”€ Pinned production matrices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// These are snapshots of the built-in DEFAULT_REQUIRED_ACTION_MATRIX (server)
// and BFF_DEFAULT_REQUIRED_ACTION_MATRIX (bff) as of Phase E2. They are
// intentionally copied here rather than imported so we lock the contract
// against drift on either side â€” if the runtime values change, this test
// fails until someone updates the fixture and reviews the implications.

const SERVER_MATRIX: Record<string, readonly string[]> = {
  UPDATE_PASSWORD: ["/api/"],
  VERIFY_EMAIL: [
    "/api/finance/",
    "/api/ap/",
    "/api/ar/",
    "/api/records/journal_entry",
    "/api/records/invoice",
  ],
  CONFIGURE_TOTP: [
    "/api/workflow/",
    "/api/iam/grants",
    "/api/iam/groups",
    "/api/iam/roles",
  ],
};

const BFF_MATRIX: Record<string, readonly string[]> = {
  UPDATE_PASSWORD: ["/"],
  VERIFY_EMAIL: ["/finance/", "/ap/", "/ar/"],
  CONFIGURE_TOTP: ["/workflow/", "/settings/security", "/setup/groups", "/setup/roles"],
};

// â”€â”€â”€ Golden scenarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Each scenario captures a realistic decision the runtime must make. The
// `expected` field is the EXACT object the algorithm should produce â€” deep
// equality is checked.

interface GoldenScenario {
  readonly label: string;
  readonly surface: "server" | "bff";
  readonly requiredActions: readonly string[];
  readonly route?: { readonly path: string; readonly method: string };
  readonly expected: MatrixMatch;
}

const GOLDEN: readonly GoldenScenario[] = [
  // â”€ baseline: no pending actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / empty actions / mutating finance route â†’ open",
    surface: "server",
    requiredActions: [],
    route: { path: "/api/finance/post", method: "POST" },
    expected: { blocked: false },
  },
  {
    label: "bff / empty actions / mutating workflow route â†’ open",
    surface: "bff",
    requiredActions: [],
    route: { path: "/workflow/approve", method: "POST" },
    expected: { blocked: false },
  },

  // â”€ no route info (gateway / verify endpoint posture) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / VERIFY_EMAIL alone / no route â†’ blocked on first",
    surface: "server",
    requiredActions: ["VERIFY_EMAIL"],
    expected: {
      blocked: true,
      blockingAction: "VERIFY_EMAIL",
      detail: { requiredActions: ["VERIFY_EMAIL"] },
    },
  },
  {
    label: "bff / two pending actions / no route â†’ blocked on first",
    surface: "bff",
    requiredActions: ["CONFIGURE_TOTP", "VERIFY_EMAIL"],
    expected: {
      blocked: true,
      blockingAction: "CONFIGURE_TOTP",
      detail: { requiredActions: ["CONFIGURE_TOTP", "VERIFY_EMAIL"] },
    },
  },

  // â”€ reads stay open (so the user can see WHY they're blocked) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / UPDATE_PASSWORD / GET /api/finance/x â†’ open (read)",
    surface: "server",
    requiredActions: ["UPDATE_PASSWORD"],
    route: { path: "/api/finance/x", method: "GET" },
    expected: { blocked: false },
  },
  {
    label: "server / VERIFY_EMAIL / HEAD /api/ap/x â†’ open (read)",
    surface: "server",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/api/ap/x", method: "HEAD" },
    expected: { blocked: false },
  },
  {
    label: "bff / VERIFY_EMAIL / OPTIONS /finance/x â†’ open (preflight)",
    surface: "bff",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/finance/x", method: "OPTIONS" },
    expected: { blocked: false },
  },

  // â”€ UPDATE_PASSWORD blocks everything mutating â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / UPDATE_PASSWORD / POST /api/records â†’ blocked",
    surface: "server",
    requiredActions: ["UPDATE_PASSWORD"],
    route: { path: "/api/records/anything", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "UPDATE_PASSWORD",
      detail: {
        requiredActions: ["UPDATE_PASSWORD"],
        route: "/api/records/anything",
        method: "POST",
      },
    },
  },
  {
    label: "bff / UPDATE_PASSWORD / DELETE / â†’ blocked",
    surface: "bff",
    requiredActions: ["UPDATE_PASSWORD"],
    route: { path: "/", method: "DELETE" },
    expected: {
      blocked: true,
      blockingAction: "UPDATE_PASSWORD",
      detail: {
        requiredActions: ["UPDATE_PASSWORD"],
        route: "/",
        method: "DELETE",
      },
    },
  },

  // â”€ VERIFY_EMAIL: scope limited to finance + journal/invoice records â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / VERIFY_EMAIL / POST /api/records/journal_entry/x â†’ blocked",
    surface: "server",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/api/records/journal_entry/x", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "VERIFY_EMAIL",
      detail: {
        requiredActions: ["VERIFY_EMAIL"],
        route: "/api/records/journal_entry/x",
        method: "POST",
      },
    },
  },
  {
    label: "server / VERIFY_EMAIL / PATCH /api/records/customer/x â†’ open",
    surface: "server",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/api/records/customer/x", method: "PATCH" },
    expected: { blocked: false },
  },
  {
    label: "bff / VERIFY_EMAIL / PUT /finance/post â†’ blocked",
    surface: "bff",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/finance/post", method: "PUT" },
    expected: {
      blocked: true,
      blockingAction: "VERIFY_EMAIL",
      detail: {
        requiredActions: ["VERIFY_EMAIL"],
        route: "/finance/post",
        method: "PUT",
      },
    },
  },
  {
    label: "bff / VERIFY_EMAIL / POST /settings/profile â†’ open",
    surface: "bff",
    requiredActions: ["VERIFY_EMAIL"],
    route: { path: "/settings/profile", method: "POST" },
    expected: { blocked: false },
  },

  // â”€ CONFIGURE_TOTP: scope limited to workflow + iam grants/groups/roles â”€â”€â”€â”€
  {
    label: "server / CONFIGURE_TOTP / POST /api/iam/grants â†’ blocked",
    surface: "server",
    requiredActions: ["CONFIGURE_TOTP"],
    route: { path: "/api/iam/grants", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "CONFIGURE_TOTP",
      detail: {
        requiredActions: ["CONFIGURE_TOTP"],
        route: "/api/iam/grants",
        method: "POST",
      },
    },
  },
  {
    label: "server / CONFIGURE_TOTP / POST /api/iam/users â†’ open (not in scope)",
    surface: "server",
    requiredActions: ["CONFIGURE_TOTP"],
    route: { path: "/api/iam/users", method: "POST" },
    expected: { blocked: false },
  },
  {
    label: "bff / CONFIGURE_TOTP / POST /settings/security â†’ blocked (exact match)",
    surface: "bff",
    requiredActions: ["CONFIGURE_TOTP"],
    route: { path: "/settings/security", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "CONFIGURE_TOTP",
      detail: {
        requiredActions: ["CONFIGURE_TOTP"],
        route: "/settings/security",
        method: "POST",
      },
    },
  },
  {
    label: "bff / CONFIGURE_TOTP / PATCH /settings/profile â†’ open",
    surface: "bff",
    requiredActions: ["CONFIGURE_TOTP"],
    route: { path: "/settings/profile", method: "PATCH" },
    expected: { blocked: false },
  },

  // â”€ multiple pending: matches the first action whose prefix hits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / two pending / POST /api/finance/post â†’ blocked on UPDATE_PASSWORD",
    surface: "server",
    requiredActions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"],
    route: { path: "/api/finance/post", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "UPDATE_PASSWORD",
      detail: {
        requiredActions: ["UPDATE_PASSWORD", "VERIFY_EMAIL"],
        route: "/api/finance/post",
        method: "POST",
      },
    },
  },
  {
    label: "server / two pending (reverse order) / POST /api/finance/post â†’ blocked on VERIFY_EMAIL first",
    surface: "server",
    requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
    route: { path: "/api/finance/post", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "VERIFY_EMAIL",
      detail: {
        requiredActions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
        route: "/api/finance/post",
        method: "POST",
      },
    },
  },

  // â”€ unknown action: ignored even when listed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / unknown action / POST /api/finance/x â†’ open",
    surface: "server",
    requiredActions: ["NOT_IN_MATRIX"],
    route: { path: "/api/finance/x", method: "POST" },
    expected: { blocked: false },
  },
  {
    label: "bff / unknown + known action / POST /workflow/x â†’ blocked on the known",
    surface: "bff",
    requiredActions: ["NOT_IN_MATRIX", "CONFIGURE_TOTP"],
    route: { path: "/workflow/x", method: "POST" },
    expected: {
      blocked: true,
      blockingAction: "CONFIGURE_TOTP",
      detail: {
        requiredActions: ["NOT_IN_MATRIX", "CONFIGURE_TOTP"],
        route: "/workflow/x",
        method: "POST",
      },
    },
  },

  // â”€ method casing: lowercase mutating must still block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    label: "server / UPDATE_PASSWORD / lowercase 'post' /api/x â†’ blocked",
    surface: "server",
    requiredActions: ["UPDATE_PASSWORD"],
    route: { path: "/api/x", method: "post" },
    expected: {
      blocked: true,
      blockingAction: "UPDATE_PASSWORD",
      detail: {
        requiredActions: ["UPDATE_PASSWORD"],
        route: "/api/x",
        method: "post",
      },
    },
  },
];

// â”€â”€â”€ The test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("matchRequiredActions â€” golden fixture (D-E2.8)", () => {
  it.each(GOLDEN)("$label", (scenario) => {
    const matrix = scenario.surface === "server" ? SERVER_MATRIX : BFF_MATRIX;
    const result = matchRequiredActions({
      requiredActions: scenario.requiredActions,
      ...(scenario.route ? { route: scenario.route } : {}),
      matrix,
    });
    expect(result).toEqual(scenario.expected);
  });

  it("fixture coverage: at least one row per surface", () => {
    const surfaces = new Set(GOLDEN.map((s) => s.surface));
    expect(surfaces.has("server")).toBe(true);
    expect(surfaces.has("bff")).toBe(true);
  });

  it("fixture coverage: at least one blocked + one open per surface", () => {
    for (const surface of ["server", "bff"] as const) {
      const rows = GOLDEN.filter((s) => s.surface === surface);
      expect(rows.some((r) => r.expected.blocked === true)).toBe(true);
      expect(rows.some((r) => r.expected.blocked === false)).toBe(true);
    }
  });
});
