/** Public, capability-neutral attachment lifecycle vocabulary. */
export type AttachmentStatus="pending"|"uploading"|"uploaded"|"processing"|"active"|"quarantined"|"rejected"|"orphaned"|"archived"|"expired"|"deleted"|"failed";
export interface AttachmentIdentity { readonly planeKey:"studio"|"neon"|"mesh"; readonly tenantId:string; readonly attachmentId:string; readonly principalId:string; }
export interface AttachmentProvenance { readonly source:"user_upload"|"system_generated"|"import"|"external"; readonly sourceId?:string; readonly sourceVersion?:string; readonly acquiredAt?:string; }
export interface AttachmentUploadIntent extends AttachmentIdentity { readonly fileName:string; readonly contentType:string; readonly sizeBytes?:number; readonly entityType?:string; readonly entityId?:string; readonly parentAttachmentId?:string; readonly seriesId?:string; readonly provenance?:AttachmentProvenance; }
export interface StagedUpload { readonly attachmentId:string; readonly storageKey:string; readonly uploadUrl:string; readonly expiresAt:string; }
export type DerivativeRebuildMode="missing"|"failed"|"all";
export interface DerivativeRebuildControl { readonly mode:DerivativeRebuildMode; readonly reason:string; readonly requestId:string; }
export interface AttachmentLifecycleScheduler { scheduleExtraction(identity:AttachmentIdentity,options?:{readonly jobId:string}):Promise<void>; scheduleDerivatives(identity:AttachmentIdentity&{readonly sourceSha256:string},options?:{readonly jobId:string;readonly rebuild?:DerivativeRebuildControl}):Promise<void>; schedulePurge(identity:AttachmentIdentity,options?:{readonly jobId:string}):Promise<void>; scheduleSearchRemoval?(identity:AttachmentIdentity,reason:string,options?:{readonly jobId:string}):Promise<void>; }
export interface AttachmentSearchRemoval { remove(identity:Pick<AttachmentIdentity,"planeKey"|"tenantId"|"attachmentId">):Promise<void>; }
/** Lifecycle status of an attachment series. */
export type AttachmentSeriesStatus="active"|"expired"|"deleted"|"purge_requested"|"purge_processing"|"purged";

export interface AttachmentSeriesRecord { readonly id:string; readonly tenantId:string; readonly currentAttachmentId:string|null; readonly status:AttachmentSeriesStatus; readonly retentionUntil:string|null; readonly expiresAt:string|null; readonly isAutoDeleteOnExpiry:boolean; readonly createdAt:string; readonly updatedAt:string|null; }

/** A placed legal hold. Active when releasedAt is null. */
export interface LegalHoldRecord { readonly id:string; readonly tenantId:string; readonly attachmentSeriesId:string; readonly holdCode:string|null; readonly reason:string; readonly externalReference:string|null; readonly placedAt:string; readonly placedBy:string; readonly releasedAt:string|null; readonly releasedBy:string|null; readonly releaseReason:string|null; readonly createdAt:string; }

export interface PlaceLegalHoldInput { readonly tenantId:string; readonly attachmentSeriesId:string; readonly reason:string; readonly placedBy:string; readonly holdCode?:string; readonly externalReference?:string; readonly correlationId?:string; }

export interface ReleaseLegalHoldInput { readonly id:string; readonly tenantId:string; readonly releasedBy:string; readonly releaseReason:string; readonly correlationId?:string; }

export interface LegalHoldRepository<Transaction> { place(input:PlaceLegalHoldInput,tx:Transaction):Promise<LegalHoldRecord>; release(input:ReleaseLegalHoldInput,tx:Transaction):Promise<LegalHoldRecord>; listActive(tenantId:string,attachmentSeriesId:string,tx:Transaction):Promise<readonly LegalHoldRecord[]>; hasActiveHold(tenantId:string,attachmentSeriesId:string,tx:Transaction):Promise<boolean>; }

export interface SeriesRepository<Transaction> { create(input:{tenantId:string;principalId:string},tx:Transaction):Promise<AttachmentSeriesRecord>; load(tenantId:string,seriesId:string,tx:Transaction):Promise<AttachmentSeriesRecord|null>; setCurrent(tenantId:string,seriesId:string,attachmentId:string,principalId:string,tx:Transaction):Promise<void>; markStatus(tenantId:string,seriesId:string,status:AttachmentSeriesStatus,principalId:string,tx:Transaction):Promise<void>; hasActiveEntityLinks(tenantId:string,seriesId:string,tx:Transaction):Promise<boolean>; }

export interface AttachmentDerivativeScheduler { scheduleDerivatives(request:{planeKey:"studio"|"neon"|"mesh";tenantId:string;attachmentId:string;principalId:string;sourceSha256:string;}):Promise<void>; }
