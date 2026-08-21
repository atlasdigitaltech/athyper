export class MasterDataError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "MasterDataError";
  }
}
