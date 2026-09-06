/** Expected rejection of caller-supplied Jobs API input. */
export class JobValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "JobValidationError";
  }
}

export class JobScheduleNotFoundError extends Error {
  constructor() { super("Job schedule was not found"); this.name = "JobScheduleNotFoundError"; }
}

export class JobScheduleConflictError extends Error {
  constructor() { super("A job schedule with this code already exists"); this.name = "JobScheduleConflictError"; }
}
