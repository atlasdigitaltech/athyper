import type { AtlasCredentialCipher, AtlasCredentialInvalidation, AtlasDriftAlertPublisher, AtlasKnowledgeIndex, AtlasKnowledgeAdmission, AtlasPolicyInvalidation, AtlasProviderCredentialResolver } from "@athyper/server-contract-ai";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { Transaction } from "kysely";
import { AtlasCredentialService, KyselyAtlasCredentialRepository } from "./credentials.js";
import { AtlasKnowledgeService, KyselyAtlasKnowledgeRepository } from "./knowledge.js";
import { KyselyAtlasDriftMonitor, KyselyAtlasMonitoringDashboard, KyselyAtlasMonitoringLedger } from "./monitoring.js";
import { KyselyAtlasPolicyAdministration } from "./policy-administration.js";
type Tx=Transaction<Record<string,never>>;
export function createAtlasA2Services(options:{transactions:PlaneTransactionCoordinator<Tx>;platformCredentials:AtlasProviderCredentialResolver;credentialCipher:AtlasCredentialCipher;credentialInvalidation:AtlasCredentialInvalidation;knowledgeIndex:AtlasKnowledgeIndex;knowledgeAdmission?:AtlasKnowledgeAdmission;policyInvalidation:AtlasPolicyInvalidation;driftAlerts:AtlasDriftAlertPublisher}){
  const credentialRepository=new KyselyAtlasCredentialRepository(options.transactions);const credentials=new AtlasCredentialService({repository:credentialRepository,cipher:options.credentialCipher,invalidation:options.credentialInvalidation});const knowledgeRepository=new KyselyAtlasKnowledgeRepository(options.transactions);const knowledge=new AtlasKnowledgeService({repository:knowledgeRepository,index:options.knowledgeIndex,admission:options.knowledgeAdmission});const policies=new KyselyAtlasPolicyAdministration({transactions:options.transactions,invalidation:options.policyInvalidation});const monitoring=new KyselyAtlasMonitoringLedger(options.transactions);const dashboards=new KyselyAtlasMonitoringDashboard(options.transactions);const drift=new KyselyAtlasDriftMonitor({transactions:options.transactions,alerts:options.driftAlerts});
  const resolver:AtlasProviderCredentialResolver={resolve:input=>input.binding.credentialPolicy==="tenant_required"?credentials.resolve(input):options.platformCredentials.resolve(input)};
  return Object.freeze({credentials,credentialRepository,knowledge,knowledgeRepository,policies,monitoring,dashboards,drift,resolver,knowledgeIndex:options.knowledgeIndex});
}
export type AtlasA2Services=ReturnType<typeof createAtlasA2Services>;
