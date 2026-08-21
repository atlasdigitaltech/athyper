// Runtime-only integration shim. All repository interfaces are erased by TypeScript.
export class PublicationContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicationContractError";
    this.code = code;
  }
}
