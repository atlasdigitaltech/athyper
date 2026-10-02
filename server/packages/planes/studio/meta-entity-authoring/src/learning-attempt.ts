import { AuthoringConflictError, AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";

/** Content-minimized evidence: never persist prompts, results, SQL or exception messages. */
export interface LearningAttemptEvidence {
  fixtureSetId?: string;
  fixtureContentHash?: string;
  evaluatorFixtureHash?: string;
  evaluatedDescriptorHash?: string;
  fixtureCount?: number;
  passedCount?: number;
  resultHash?: string;
}
const failureCodes = new Set([
  "LEARNING_FIXTURE_SET_UNAVAILABLE", "LEARNING_FIXTURE_PROVENANCE_INVALID",
  "LEARNING_SOURCE_UNAVAILABLE", "LEARNING_TARGET_UNSUPPORTED",
  "LEARNING_EVALUATOR_CHANGED", "LEARNING_EVALUATION_FAILED",
  "LEARNING_EVALUATION_RECEIPT_INVALID", "LEARNING_CONTROLLED_FIXTURES_REQUIRED",
  "REVIEWER_SEPARATION_REQUIRED",
]);
export function learningAttemptFailureCode(error: unknown): string {
  if (error instanceof AuthoringPolicyError && failureCodes.has(error.code)) return error.code;
  if (error instanceof AuthoringConflictError) return "LEARNING_CONFLICT";
  if (error instanceof TypeError) return "LEARNING_INVALID_INPUT";
  return "LEARNING_ATTEMPT_FAILED";
}
/** Start commits before work. Failure is recorded only after work's transaction has rolled back.
 * A process crash or unavailable ledger leaves an honest started attempt, never a fabricated result.
 */
export async function runLearningAttempt<T>(callbacks: {
  start(): Promise<void>;
  work(): Promise<T>;
  failed(code: string): Promise<void>;
}): Promise<T> {
  await callbacks.start();
  try {
    return await callbacks.work();
  } catch (error) {
    try {
      await callbacks.failed(learningAttemptFailureCode(error));
    } catch {
      // Do not disguise an unrecorded terminal state as an ordinary evaluation failure.
      throw new AuthoringPolicyError("LEARNING_ATTEMPT_RECORDING_FAILED", "Evaluation did not complete and its terminal evidence could not be recorded; inspect the started attempt before retrying");
    }
    throw error;
  }
}
