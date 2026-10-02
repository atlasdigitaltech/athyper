import { sql } from "kysely";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { TransactionalRecordActionHandler } from "@athyper/server-service-records";
import type { RecordTransaction } from "@athyper/server-service-records";
import { RecordServiceError } from "@athyper/server-service-records";
import type { RecordMutationResult } from "@athyper/server-contract-records";

/** Governed workforce action inside the normal Entity transaction/receipt/audit
 * pipeline. It links an existing login; it never creates IAM roles or copies
 * Person fields. External engagements require their own qualified scope port. */
export function createPrincipalPersonLinkAction(authorizer: Authorizer): TransactionalRecordActionHandler<RecordTransaction> {
  type Arguments = Parameters<TransactionalRecordActionHandler<RecordTransaction>['execute']>;
  async function prepare(command:Arguments[0],descriptor:Arguments[1],transaction:Arguments[2],checkAuthorization=true):Promise<RecordMutationResult | {kind:'Ready';companyCodeId:string;input:{personId:string;employmentId:string;sourceRevision:string}}> {
      if (command.context.planeKey !== "neon" || descriptor.entityCode !== "principal" ||
          descriptor.storage.schema !== "master" || descriptor.storage.object !== "principal")
        return {kind:"CapabilityUnavailable",entityCode:command.entityCode};
      const registration=descriptor.actions?.find(action=>action.code===command.actionCode);
      if(registration?.handlerKey!=='identity.principal.link_person.v1' || registration.permissionCode!=='neon.workforce.profile.write')
        return {kind:'CapabilityUnavailable',entityCode:command.entityCode};
      const input=command.input;
      if (!input || Object.keys(input).some(k=>!['personId','employmentId','sourceRevision'].includes(k)) ||
          typeof input['personId']!=="string" || !uuid(input['personId']) ||
          typeof input['employmentId']!=="string" || !uuid(input['employmentId']) ||
          typeof input['sourceRevision']!=="string" || !/^source-sha256:[a-f0-9]{64}$/.test(input['sourceRevision']))
        return {kind:"ValidationFailed",code:"ENTITY_LINK_INPUT_INVALID",message:"Select an existing Person and employment, then reload the current profile source."};
      await sql`SELECT set_config('app.entity_person_link_authority','',true)`.execute(transaction);
      const scope=(await sql<{company_code_id:string}>`SELECT company_code_id FROM master.employment
        WHERE tenant_id=${command.context.tenantId}::uuid AND id=${input['employmentId']}::uuid
          AND person_id=${input['personId']}::uuid AND status='active' AND employment_status='active'
        FOR SHARE`.execute(transaction)).rows[0];
      if (!scope || (checkAuthorization && !(await authorizer.authorize({context:command.context,
        permissionCode:"neon.workforce.profile.write",resource:{tenantId:command.context.tenantId,
          companyCodeId:scope.company_code_id,personId:input['personId'],employmentId:input['employmentId'],
          entityCode:command.entityCode,recordId:command.recordId,operationKey:command.actionCode,
          actionCode:command.actionCode,registeredActionCheck:true,actionHandlerKey:registration.handlerKey,
          authorizationDescriptorHash:descriptor.compiledHash}})).allowed))
        return {kind:"Forbidden",permissionCode:"neon.workforce.profile.write"};
      return {kind:'Ready',companyCodeId:scope.company_code_id,input:{personId:input['personId'],employmentId:input['employmentId'],sourceRevision:input['sourceRevision']}};
  }
  return {
    async readTarget(command,descriptor,transaction) {
      if(descriptor.storage.versionField)throw Error('ENTITY_LINK_TARGET_VERSION_UNSUPPORTED');
      try {
        const target=(await sql<{id:string|null}>`SELECT master.entity_person_link_target_v1(${command.context.tenantId}::uuid,${command.recordId}::uuid) AS id`.execute(transaction)).rows[0]?.id;
        return target ? {recordId:target} : null;
      }catch(error){
        if(error&&typeof error==='object'&&Reflect.get(error,'code')==='42501')throw new RecordServiceError(403,'ENTITY_LINK_FORBIDDEN','The identity link is not permitted in the current scope.');
        throw error;
      }
    },
    async resolveAuthorizationResource(command,descriptor,transaction) {
      const registration=descriptor.actions?.find(action=>action.code===command.actionCode);
      if(registration?.handlerKey!=="identity.principal.link_person.v1" || registration.permissionCode!=="neon.workforce.profile.write")
        return {kind:"CapabilityUnavailable",entityCode:command.entityCode};
      const prepared=await prepare(command,descriptor,transaction,false);
      if(prepared.kind!=="Ready")return prepared;
      return {kind:"Resolved",resource:{companyCodeId:prepared.companyCodeId,
        personId:prepared.input.personId,employmentId:prepared.input.employmentId}};
    },
    async authorize(command,descriptor,transaction) {
      const prepared=await prepare(command,descriptor,transaction);
      if(prepared.kind!=='Ready')return prepared;
      await sql`SELECT set_config('app.entity_person_link_authority',${JSON.stringify({
        actorId:command.context.principalId,tenantId:command.context.tenantId,principalId:command.recordId,
        personId:prepared.input.personId,employmentId:prepared.input.employmentId,companyCodeId:prepared.companyCodeId,
        sourceRevision:prepared.input.sourceRevision,permissionCode:'neon.workforce.profile.write',handlerKey:'identity.principal.link_person.v1',
      })},true)`.execute(transaction);
      return undefined;
    },
    async execute(command,descriptor,transaction) {
      const prepared=await prepare(command,descriptor,transaction);
      if(prepared.kind!=='Ready')return prepared;
      const {input}=prepared;
      try {
        await sql`SELECT set_config('app.entity_person_link_authority',${JSON.stringify({
          actorId:command.context.principalId,tenantId:command.context.tenantId,principalId:command.recordId,
          personId:input['personId'],employmentId:input['employmentId'],companyCodeId:prepared.companyCodeId,
          sourceRevision:input['sourceRevision'],permissionCode:"neon.workforce.profile.write",
          handlerKey:"identity.principal.link_person.v1",
        })},true)`.execute(transaction);
        await sql`SELECT master.entity_link_person_v1(${command.context.tenantId}::uuid,
          ${command.recordId}::uuid,${input['personId']}::uuid,${input['sourceRevision']})`.execute(transaction);
      } catch(error) {
        const code=error&&typeof error==="object"?Reflect.get(error,"code"):undefined;
        if(code==='40001'||code==='23505') throw new RecordServiceError(409,"ENTITY_LINK_CONFLICT","The identity source changed or is already linked. Reload and review the source.");
        if(code==='23503') throw new RecordServiceError(422,"ENTITY_LINK_SOURCE_INVALID","The selected Person is unavailable.");
        if(code==='42501') throw new RecordServiceError(403,"ENTITY_LINK_FORBIDDEN","The identity link is not permitted in the current scope.");
        throw error;
      }
      return {kind:"Committed",action:"domain",entityCode:command.entityCode,recordId:command.recordId,record:{id:command.recordId},replayed:false};
    },
  };
}
function uuid(value:string) {return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
