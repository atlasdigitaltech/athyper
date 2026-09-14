import test from "node:test";
import assert from "node:assert/strict";
import { parseEntityIntakeFlow } from "../../packages/contracts/platform/entity-runtime/src/intake";
import {
  assertIntakeReadyToSubmit,
  completeIntakeStep,
  initialIntakeCheckpoint,
  invalidateIntakeFrom,
  navigateIntake,
} from "../../packages/platform/entity/runtime/form-detail/src/intake-state";
const flow = parseEntityIntakeFlow({
  schemaVersion: 1,
  key: "product_request",
  kind: "create",
  title: "New product request",
  navigation: "linear",
  allowDraftResume: true,
  entryOperation: "create",
  completionOperation: "submit",
  steps: [
    {
      key: "classification",
      surfaceKey: "classification",
      title: "Classification",
      optional: false,
      completionCondition: { field: "category", operator: "present" },
    },
    {
      key: "details",
      surfaceKey: "details",
      title: "Details",
      optional: false,
    },
    { key: "review", surfaceKey: "review", title: "Review", optional: false },
  ],
});
test("blocks future steps and incomplete information, preserves completed navigation", () => {
  let state = initialIntakeCheckpoint(flow, "release-1");
  assert.throws(() => navigateIntake(flow, state, "review", {}));
  assert.throws(() => completeIntakeStep(flow, state, {}));
  state = completeIntakeStep(flow, state, { category: "stock" });
  state = navigateIntake(flow, state, "details", {});
  state = completeIntakeStep(flow, state, {});
  assert.equal(navigateIntake(flow, state, "review", {}).currentStep, "review");
  assert.equal(
    navigateIntake(flow, state, "classification", {}).currentStep,
    "classification",
  );
  const invalidated = invalidateIntakeFrom(flow, state, "classification");
  assert.deepEqual(invalidated.completed, []);
  assert.throws(() => navigateIntake(flow, invalidated, "review", {}));
});
test("resumes only the same published revision and validates every saved step", () => {
  const state = initialIntakeCheckpoint(flow, "release-1");
  assert.deepEqual(initialIntakeCheckpoint(flow, "release-1", state), state);
  assert.throws(() => initialIntakeCheckpoint(flow, "release-2", state));
  assert.throws(() =>
    initialIntakeCheckpoint(flow, "release-1", {
      ...state,
      completed: ["unknown"],
    }),
  );
  assert.throws(() =>
    initialIntakeCheckpoint(
      { ...flow, allowDraftResume: false },
      "release-1",
      state,
    ),
  );
});

test("submission rechecks required completion conditions after earlier answers change", () => {
  const answers = { category: "stock" };
  let state = initialIntakeCheckpoint(flow, "release-1");
  assert.throws(() => assertIntakeReadyToSubmit(flow, state, answers));
  state = completeIntakeStep(flow, state, answers);
  state = navigateIntake(flow, state, "details", answers);
  state = completeIntakeStep(flow, state, answers);
  state = navigateIntake(flow, state, "review", answers);
  assert.doesNotThrow(() => assertIntakeReadyToSubmit(flow, state, answers));
  assert.throws(() => assertIntakeReadyToSubmit(flow, state, {}));
});
