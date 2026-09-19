import { JobValidationError } from "@athyper/server-contract-jobs";
import parser from "cron-parser";
import type { CronPreview } from "@athyper/server-contract-jobs";

const MAX_PREVIEW = 20;

export function previewCron(input: {
  readonly expression: string;
  readonly timezone: string;
  readonly count?: number;
  readonly from?: string;
}): CronPreview {
  const expression = input.expression.trim();
  const timezone = input.timezone.trim();
  if (!expression) throw new JobValidationError("cron expression is required");
  if (!timezone || timezone.length > 64) throw new JobValidationError("timezone is invalid");
  if (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 1)) {
    throw new JobValidationError("count must be a positive integer");
  }
  const count = Math.min(MAX_PREVIEW, input.count ?? 5);
  const currentDate = input.from !== undefined ? validDate(input.from) : new Date();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    const interval = parser.parseExpression(expression, { currentDate, tz: timezone });
    return {
      expression,
      timezone,
      nextRuns: Array.from({ length: count }, () => interval.next().toDate().toISOString()),
    };
  } catch (error) {
    throw new JobValidationError(`Invalid cron schedule: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validDate(value: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) throw new JobValidationError("from must be an ISO date-time");
  return result;
}
