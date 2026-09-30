#!/usr/bin/env node
/**
 * Backward-compatible wrapper.
 *
 * The importable Neon realm now lives at:
 *   deploy/config/iam/realm-neon.json
 *
 * Use update-realm-neon.cjs for new automation.
 */

require('./update-realm-neon.cjs');
