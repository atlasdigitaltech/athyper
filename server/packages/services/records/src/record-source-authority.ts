import type { VerifiedRequestContext } from '@athyper/server-contract-auth';
import { RecordServiceError } from './errors.js';

export interface RecordSourceAuthorityResolution {
  readonly state: 'local' | 'linked' | 'unavailable';
  readonly tenantId: string;
  readonly principalId: string;
  readonly revision: string;
  /** Internal verified ownership coordinate; never itself a read grant. */
  readonly source?: { readonly plane: string; readonly tenantId: string; readonly entityCode: string; readonly recordId: string };
}
/** Implementations must resolve current verified linkage and serialize against
 * concurrent link changes using the caller's transaction. Absence of a visible
 * workforce row is not evidence of an unlinked principal. */
export type RecordSourceAuthorityResolver<Transaction> = (
  input: { readonly context: VerifiedRequestContext; readonly ownerPrincipalId: string },
  transaction: Transaction,
) => Promise<RecordSourceAuthorityResolution>;

/** This restricts local writes; it grants no permission to read/edit the source. */
export async function assertLocalRecordSource<Transaction>(
  resolver: RecordSourceAuthorityResolver<Transaction> | undefined,
  input: { readonly context: VerifiedRequestContext; readonly ownerPrincipalId: string },
  transaction: Transaction,
): Promise<void> {
  if (!resolver) throw new RecordServiceError(503, 'ENTITY_SOURCE_UNAVAILABLE', 'The authoritative profile source is unavailable.');
  const result = await resolver(input, transaction);
  if (!result || result.tenantId !== input.context.tenantId || result.principalId !== input.ownerPrincipalId || (typeof result.revision !== 'string' || !result.revision.trim()) || !['local', 'linked'].includes(result.state))
    throw new RecordServiceError(503, 'ENTITY_SOURCE_UNAVAILABLE', 'The authoritative profile source is unavailable.');
  if (result.state === 'linked') throw new RecordServiceError(409, 'ENTITY_SOURCE_MANAGED', 'This profile must be updated through its authoritative source.');
}
