export class DocumentError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); this.name = "DocumentError"; }
}
