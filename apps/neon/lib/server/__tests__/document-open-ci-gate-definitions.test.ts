import { describe, expect, it } from "vitest";
import { DOCUMENT_OPEN_CI_GATE_DEFINITIONS } from "../document-open-rollout-ci-definitions";
import {
  DOCUMENT_OPEN_PROGRESS_METRIC_NAMES,
  DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS,
  type DocumentOpenRolloutGateTargetName,
} from "../document-open-rollout-gates";

describe("document-open CI gate definitions", () => {
  it("contains every explicit progress metric used by rollout acceptance gates", () => {
    const definitionMetrics = new Set(DOCUMENT_OPEN_CI_GATE_DEFINITIONS.map((entry) => entry.metricName));

    for (const targetName of Object.keys(DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS) as DocumentOpenRolloutGateTargetName[]) {
      const metricName = DOCUMENT_OPEN_PROGRESS_METRIC_NAMES[targetName];
      expect(definitionMetrics.has(metricName)).toBe(true);
    }
  });

  it("keeps CI definitions machine-readable for automation", () => {
    for (const gate of DOCUMENT_OPEN_CI_GATE_DEFINITIONS) {
      expect(typeof gate.name).toBe("string");
      expect(typeof gate.metricName).toBe("string");
      expect(typeof gate.target).toBe("number");
      expect(typeof gate.higherIsBetter).toBe("boolean");
    }
    expect(new Set(DOCUMENT_OPEN_CI_GATE_DEFINITIONS.map((entry) => entry.name)).size)
      .toBe(DOCUMENT_OPEN_CI_GATE_DEFINITIONS.length);
  });
});
