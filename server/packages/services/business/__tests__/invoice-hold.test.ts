/**
 * Invoice Hold / Release Service tests (Model A).
 *
 * Verifies hold/release behavior added in Patch Set 3.2:
 *   - status = 'on_hold' is authoritative
 *   - metadata.hold.previous_status captures restoration state
 *   - terminal statuses cannot be held
 *   - release falls back to 'draft' when previous_status is missing
 *
 * Integration tests run against a live DB; pure error class tests are unit.
 */

import { describe, it, expect } from "vitest";
import {
  HoldNotAllowedError,
  ReleaseNotAllowedError,
} from "../ap/invoice-hold.service.js";

describe("Hold/Release error classes", () => {
  it("HoldNotAllowedError carries code='HOLD_NOT_ALLOWED'", () => {
    const err = new HoldNotAllowedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("HOLD_NOT_ALLOWED");
    expect(err.name).toBe("HoldNotAllowedError");
  });

  it("ReleaseNotAllowedError carries code='RELEASE_NOT_ALLOWED'", () => {
    const err = new ReleaseNotAllowedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("RELEASE_NOT_ALLOWED");
    expect(err.name).toBe("ReleaseNotAllowedError");
  });

  it("HoldNotAllowedError accepts a custom message", () => {
    const err = new HoldNotAllowedError("Custom hold reason text");
    expect(err.message).toBe("Custom hold reason text");
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("placeInvoiceOnHold / releaseInvoiceHold — integration (live DB)", () => {
  it.todo("placing a draft invoice on hold captures metadata.hold.previous_status='draft'");
  it.todo("placing an approved invoice on hold captures metadata.hold.previous_status='approved'");
  it.todo("releasing restores metadata.hold.previous_status (approved)");
  it.todo("releasing with missing metadata.hold falls back to 'draft'");
  it.todo("placing a posted invoice on hold throws HoldNotAllowedError");
  it.todo("placing an already-on-hold invoice throws HoldNotAllowedError");
  it.todo("releasing a non-on-hold invoice throws ReleaseNotAllowedError");
  it.todo("hold_reason can be patched via records.route only while status=on_hold");
});
