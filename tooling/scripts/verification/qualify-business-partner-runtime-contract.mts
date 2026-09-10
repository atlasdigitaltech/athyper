import {createBusinessPartnerQualificationRuntimeRegistrations} from "../../../server/apps/platform-host/src/composition/business-partner-qualification-runtime.js";
import {createBusinessPartnerRevealRuntimeRegistrations} from "../../../server/apps/platform-host/src/composition/business-partner-reveal-runtime.js";
/** Contract fixture only. Never supplies these test doubles to publication or deployment. */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createEntityAuthorizationRuntimeRegistry} from '../../../server/packages/contracts/metadata/src/entity-authorization-registry.js';
import {createBusinessPartnerCaseRuntimeRegistrations} from '../../../server/apps/platform-host/src/composition/business-partner-case-runtime.js';
import {createBusinessPartnerReadRuntimeRegistrations} from '../../../server/apps/platform-host/src/composition/business-partner-read-runtime.js';
import {createBusinessPartnerActionRuntimeRegistrations} from '../../../server/apps/platform-host/src/composition/business-partner-action-runtime.js';
import {createBusinessPartnerImportRegistration} from '../../../server/apps/platform-host/src/composition/business-partner-bound-import.js';
import {createBusinessPartnerExportRegistration} from '../../../server/apps/platform-host/src/composition/business-partner-export-runtime.js';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const selectedPath = 'governance/policy/reports/business-partner-import-release.dev.json';
const selected = read(selectedPath);
const notLive = () => {throw Error('CONTRACT_FIXTURE_CANNOT_EXECUTE_A_SERVICE');};
const cases = Object.fromEntries(['create','list','patch','validate','submit','decide','apply'].map(key => [key, notLive])) as never;
const scopes = {resolve: notLive, preflight: notLive};
const entries = [
 ...createBusinessPartnerQualificationRuntimeRegistrations({preflightQualification: notLive, createQualification: notLive} as never, scopes),
 ...createBusinessPartnerRevealRuntimeRegistrations({preflightReveal: notLive, revealBankAccount: notLive, revealTaxRegistration: notLive} as never, scopes),
 ...createBusinessPartnerCaseRuntimeRegistrations(cases, scopes),
 ...createBusinessPartnerReadRuntimeRegistrations({list: notLive, record: notLive, applicationDescriptor: notLive}, {section: notLive} as never, scopes),
 ...createBusinessPartnerActionRuntimeRegistrations(cases, {get: notLive, list: notLive}, scopes),
 createBusinessPartnerImportRegistration({execute: notLive, preflight: notLive}, scopes),
 createBusinessPartnerExportRegistration({requestExport: notLive, preflightExport: notLive} as never, scopes),
];
const profile = selected.descriptor.authorization;
const keys = new Set(entries.map(e => e.operation.key));
const runtime = selected.descriptor.authorizationRuntime;
const registry = createEntityAuthorizationRuntimeRegistry(entries);
registry.qualify({...profile, operations: profile.operations.filter((o: {key: string}) => keys.has(o.key))}, {...runtime, bindings: runtime.bindings.filter((b: {operation: string}) => keys.has(b.operation))});
let error: string | null = null;
try {registry.qualify(profile, runtime);} catch (failure) {error = failure instanceof Error ? failure.message : 'Unqualified runtime';}
const unregistered = profile.operations.filter((o: {key: string}) => !keys.has(o.key)).map((o: {key: string}) => o.key);
if (error || unregistered.length) throw Error(`Unexpected full-profile qualification result: ${error}`);
const sourcePaths = [
 'server/apps/platform-host/src/composition/business-partner-qualification-runtime.ts',
 'server/packages/services/master-data/src/business-partner-eligibility-service.ts',
 'server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts',
 'server/packages/contracts/master-data/src/business-partner-eligibility.ts',
 'server/packages/contracts/master-data/src/business-partner-eligibility-ports.ts',
 'server/apps/platform-host/src/composition/business-partner-reveal-runtime.ts',
 'server/apps/platform-host/src/composition/business-partner-permission-transitions.ts',
 'server/apps/platform-host/src/composition/business-partner-backend-mapping.ts',
 'server/packages/services/records/src/entity-backend-authorizer.ts',
 'server/packages/services/master-data/src/business-partner-360-service.ts',
 'server/apps/platform-host/src/composition/business-partner-case-runtime.ts',
 'server/apps/platform-host/src/composition/business-partner-read-runtime.ts',
 'server/apps/platform-host/src/composition/business-partner-action-runtime.ts',
 'server/apps/platform-host/src/composition/business-partner-import-runtime.ts',
 'server/apps/platform-host/src/composition/business-partner-bound-import.ts',
 'server/apps/platform-host/src/composition/business-partner-export-runtime.ts',
 'server/packages/services/records/src/transfer/transfer-service.ts',
 'server/packages/services/master-data/src/business-partner-governed-import-routes.ts',
 'server/apps/platform-host/src/processes/api/index.ts',
 'server/packages/runtime/http/src/http-runtime.ts',
 'packages/platform/gateway/bff-relay/src/index.ts',
 'server/apps/platform-host/src/composition/register-services.ts',
 'server/packages/contracts/metadata/src/entity-authorization-registry.ts',
];
const report = {schemaVersion: 1, kind: 'bp_runtime_contract_fixture', selectedPath, selectionSha256: selected.selectionSha256,
 registeredOperations: [...keys].sort(), unregisteredOperations: unregistered,
 registeredContractSemantics: 'passed', fullProfileRuntimeQualification: 'contract_passed', nativeRegistryDiagnostic: error,
 sourceEvidence: sourcePaths.map(path => ({path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex')})),
 fixtureOnly: true, authenticatedQualification: false, deploymentQualified: false, signedArtifact: null,
 grantsChanged: false, activationAuthorized: false, publicationEligible: false};
const path = 'governance/policy/reports/business-partner-runtime-contract.dev.json';
writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
console.log({path, registered: keys.size, unregistered, fixtureOnly: true, publicationEligible: false});
