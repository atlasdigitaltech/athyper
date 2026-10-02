/** Retain a key for an unchanged retry after an uncertain response. A changed
 * payload, owner scope, record or version starts a different submission. */
export function createFormSubmissionIdentity(uuid: () => string = () => crypto.randomUUID()) {
  let previous: string | undefined;
  let current: string | undefined;
  return {
    key(submission: unknown): string {
      const fingerprint = JSON.stringify(submission);
      if (fingerprint !== previous || !current) {
        previous = fingerprint;
        current = `entity-${uuid()}`;
      }
      return current;
    },
    clear() { previous = undefined; current = undefined; },
  };
}
