export class HttpError extends Error {
  readonly type: string;
  readonly title: string;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "HttpError";
    this.type = `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`;
    this.title = titleForStatus(statusCode);
  }
}

function titleForStatus(status: number): string {
  const titles: Readonly<Record<number, string>> = {
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    409: "Conflict", 422: "Unprocessable Content", 423: "Locked",
    428: "Precondition Required", 429: "Too Many Requests", 500: "Internal Server Error",
    503: "Service Unavailable",
  };
  return titles[status] ?? "Request Failed";
}
