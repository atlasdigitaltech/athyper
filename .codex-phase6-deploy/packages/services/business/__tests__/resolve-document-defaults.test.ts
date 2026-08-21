/**
 * resolve-document-defaults — unit tests for the pure policy functions.
 *
 * The DB-touching surfaces (resolveCompanyAndBaseCurrency, resolveFiscalPeriod,
 * allocateDocumentNumber) are integration-tested in this package's
 * .integration.test.ts files. Here we cover the pure logic that is the
 * actual policy anchor:
 *   - applyFiscalPeriodPolicy: strict vs permissive, fallback math, warn log
 *   - buildFallbackDocumentNumber: stable prefix-YYYYMM-XXXXXX shape
 */

import { describe, it, expect, vi } from "vitest";
import {
  applyFiscalPeriodPolicy,
  buildFallbackDocumentNumber,
} from "../p2p/resolve-document-defaults.js";

const TENANT = "00000000-0000-0000-0000-000000000001";
const COMPANY = "00000000-0000-0000-0000-000000000002";

describe("applyFiscalPeriodPolicy", () => {
  it("returns ok:true with source='fiscal_period' when a row matched", () => {
    const result = applyFiscalPeriodPolicy(
      { fiscal_year: 2026, period_number: 6 },
      { tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20" },
    );
    expect(result).toEqual({
      ok:           true,
      fiscalYear:   2026,
      periodNumber: 6,
      source:       "fiscal_period",
    });
  });

  it("returns ok:false with reason='fiscal_period_missing' when no row matched and mode is default (strict)", () => {
    const result = applyFiscalPeriodPolicy(null, {
      tenantId:     TENANT,
      companyCodeId: COMPANY,
      documentDate: "2026-06-20",
    });
    expect(result).toEqual({
      ok:            false,
      reason:        "fiscal_period_missing",
      tenantId:      TENANT,
      companyCodeId: COMPANY,
      documentDate:  "2026-06-20",
    });
  });

  it("explicit strict mode behaves identically to default", () => {
    const result = applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
      mode: "strict",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("fiscal_period_missing");
  });

  it("permissive mode falls back to Gregorian UTC year+month", () => {
    const result = applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
      mode: "permissive",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("gregorian_fallback");
    expect(result.fiscalYear).toBe(2026);
    expect(result.periodNumber).toBe(6);
  });

  it("permissive Gregorian fallback handles January boundary (UTC)", () => {
    const result = applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-01-01",
      mode: "permissive",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fiscalYear).toBe(2026);
    expect(result.periodNumber).toBe(1);
  });

  it("permissive Gregorian fallback handles December boundary (UTC)", () => {
    const result = applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-12-31",
      mode: "permissive",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fiscalYear).toBe(2026);
    expect(result.periodNumber).toBe(12);
  });

  it("emits a warn log on Gregorian fallback with caller-supplied tag + fields", () => {
    const logger = { warn: vi.fn() };
    applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
      mode: "permissive",
      logger,
      fallbackLogTag:    "receipt_test_fallback",
      fallbackLogFields: { entity: "receipt" },
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("receipt_test_fallback", {
      tenantId:             TENANT,
      companyCodeId:        COMPANY,
      documentDate:         "2026-06-20",
      fallbackFiscalYear:   2026,
      fallbackPeriodNumber: 6,
      entity:               "receipt",
    });
  });

  it("does NOT emit a warn log when strict mode returns the missing reason", () => {
    const logger = { warn: vi.fn() };
    applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
      mode: "strict",
      logger,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does NOT emit a warn log when a fiscal_period row matched", () => {
    const logger = { warn: vi.fn() };
    applyFiscalPeriodPolicy(
      { fiscal_year: 2026, period_number: 6 },
      {
        tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
        mode: "permissive",
        logger,
      },
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("default Gregorian-fallback log tag is greppable", () => {
    const logger = { warn: vi.fn() };
    applyFiscalPeriodPolicy(null, {
      tenantId: TENANT, companyCodeId: COMPANY, documentDate: "2026-06-20",
      mode: "permissive",
      logger,
    });
    expect(logger.warn.mock.calls[0]?.[0]).toBe("fiscal_period_gregorian_fallback");
  });
});

describe("buildFallbackDocumentNumber", () => {
  it("produces prefix-YYYYMM-XXXXXX shape", () => {
    const out = buildFallbackDocumentNumber("RCP", new Date("2026-06-20T00:00:00Z"), () => "ABC123");
    expect(out).toBe("RCP-202606-ABC123");
  });

  it("zero-pads single-digit months", () => {
    const out = buildFallbackDocumentNumber("SES", new Date("2026-01-15T00:00:00Z"), () => "ZZZZZZ");
    expect(out).toBe("SES-202601-ZZZZZZ");
  });

  it("uses provided prefix verbatim (no case change)", () => {
    const out = buildFallbackDocumentNumber("DN", new Date("2026-06-20T00:00:00Z"), () => "xyz");
    expect(out).toBe("DN-202606-xyz");
  });

  it("default rand returns 6-char base36 upper-case suffix", () => {
    const out = buildFallbackDocumentNumber("PR", new Date("2026-06-20T00:00:00Z"));
    expect(out).toMatch(/^PR-202606-[A-Z0-9]{1,6}$/);
  });
});
