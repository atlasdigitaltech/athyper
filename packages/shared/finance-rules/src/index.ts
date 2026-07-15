/**
 * @athyper/finance-rules — shared business rules called by BOTH client and server.
 *
 * The point of this package is parity: the UI's period-disabled checks and the
 * server's posting trigger run the same predicate. A nightly parity test
 * (server/scripts/verify-period-gate-parity.ts) feeds the full period table
 * through both this function and the SQL trigger predicate and asserts they
 * agree on every row.
 *
 * If you find yourself writing similar logic elsewhere, move it here instead —
 * silent drift between client and server is the bug class this package exists
 * to eliminate.
 */

export * from "./period-gate";
export * from "./presets";
