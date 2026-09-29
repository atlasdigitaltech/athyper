import type { EntityCapabilityRequest } from "./entity-capability-policy.js";
export interface RecordParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly username?: string;
}
/** Candidates never imply membership. Every returned/selected ID is readmitted. */
export function createRecordParticipantResolver(options: {
  candidates(
    input: EntityCapabilityRequest,
    query: string,
    limit: number,
  ): Promise<readonly RecordParticipant[]>;
  admit(input: EntityCapabilityRequest, principalId: string): Promise<boolean>;
}) {
  return {
    async search(input: EntityCapabilityRequest, query: string) {
      const candidates = await options.candidates(
        input,
        query.trim().slice(0, 100),
        50,
      );
      const result: RecordParticipant[] = [];
      for (const candidate of candidates) {
        if (
          input.input?.visibility === "private" &&
          candidate.id !== input.context.principalId
        )
          continue;
        if (await options.admit(input, candidate.id)) result.push(candidate);
        if (result.length === 20) break;
      }
      return result;
    },
    async validate(input: EntityCapabilityRequest, ids: readonly string[]) {
      if (ids.length > 20) return false;
      for (const id of new Set(ids)) {
        if (
          input.input?.visibility === "private" &&
          id !== input.context.principalId
        )
          return false;
        if (!(await options.admit(input, id))) return false;
      }
      return true;
    },
  };
}
