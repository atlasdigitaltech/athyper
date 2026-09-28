export class RecordServiceError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string,
    readonly params?: Readonly<Record<string, string | number | boolean>>) { super(message); this.name = "RecordServiceError"; }
}
