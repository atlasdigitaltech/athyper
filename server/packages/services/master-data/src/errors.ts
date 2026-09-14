export class MasterDataError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fieldErrors?: readonly unknown[]) {
    super(message);
    this.name = "MasterDataError";
  }
}
