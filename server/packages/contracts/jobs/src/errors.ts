/** Expected rejection of caller-supplied Jobs API input. */
export class JobValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "JobValidationError";
  }
}
