/**
 * Shared utilities for Athyper k6 performance tests.
 */

export function safeParseJson(body) {
  try { return JSON.parse(body); } catch { return null; }
}
