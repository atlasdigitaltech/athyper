import type { JobsOptions } from "bullmq";

export const COMPLETED_JOB_RETENTION = Object.freeze({
  age: 24 * 60 * 60,
  count: 1000,
});
export const FAILED_JOB_RETENTION = Object.freeze({
  age: 7 * 24 * 60 * 60,
  count: 5000,
});

/** BullMQ ages are seconds; counts apply to the queue, not individual job names. */
export function jobRetention(
  options: Pick<JobsOptions, "removeOnComplete" | "removeOnFail"> = {},
) {
  return {
    removeOnComplete: retention(
      options.removeOnComplete,
      COMPLETED_JOB_RETENTION,
    ),
    removeOnFail: retention(options.removeOnFail, FAILED_JOB_RETENTION),
  };
}
function retention(
  value: JobsOptions["removeOnComplete"],
  fallback: { readonly age: number; readonly count: number },
) {
  if (value === true) return true;
  // Legacy false means keep forever; enforce the operational retention window.
  if (value === false) value = undefined;
  const policy =
    value === undefined
      ? fallback
      : typeof value === "number"
        ? { age: fallback.age, count: value }
        : { ...fallback, ...value };
  if (
    !Number.isInteger(policy.count) ||
    policy.count < 0 ||
    !Number.isFinite(policy.age) ||
    policy.age <= 0
  )
    throw new Error(
      "Job retention requires non-negative integer count and positive age in seconds",
    );
  if (policy.age > fallback.age)
    throw new Error(
      "Job retention age exceeds the operational history window; archive durable history outside Redis",
    );
  return { ...policy };
}
