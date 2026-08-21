import type { Request, Response } from "express";
import { tryGetRequestContext } from "@athyper/server-foundation/context";

import { HttpError } from "./http-error.js";

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly requestId?: string;
  readonly errors?: Readonly<Record<string, unknown>>;
}

export function sendProblem(
  response: Response,
  request: Pick<Request, "originalUrl">,
  error: HttpError,
): void {
  const requestId = tryGetRequestContext()?.requestId;
  const problem: ProblemDetails = {
    type: error.type,
    title: error.title,
    status: error.statusCode,
    detail: error.message,
    instance: request.originalUrl,
    code: error.code,
    ...(requestId ? { requestId } : {}),
    ...(error.details ? { errors: error.details } : {}),
  };
  response.status(error.statusCode).type("application/problem+json").json(problem);
}
