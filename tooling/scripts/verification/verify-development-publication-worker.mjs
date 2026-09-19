// Run through stdin in the rebuilt worker so imports use its installed adapters.
import { readFileSync } from 'node:fs';
import { createInfisicalSecretStore } from '@athyper/server-adapter-secretstore-infisical';
import { CachedPublicationKeyResolver, Ed25519PublicationSigner, Ed25519PublicationVerifier } from '@athyper/server-adapter-publication-signing';
const e=process.env;
if(e.INFISICAL_ENVIRONMENT!=='dev' || e.INFISICAL_URL!=='https://secrets.dev.athyper.test:8443') throw new Error('Development signing coordinates required');
const secrets=createInfisicalSecretStore({endpoint:e.INFISICAL_URL,token:readFileSync(e.INFISICAL_TOKEN_FILE,'utf8').trim(),workspaceId:e.INFISICAL_WORKSPACE_ID,environment:e.INFISICAL_ENVIRONMENT,secretPath:e.INFISICAL_SECRET_PATH});
const resolver=new CachedPublicationKeyResolver(secrets,[{keyId:e.PUBLICATION_SIGNING_KEY_ID,privateKeyReference:e.PUBLICATION_PRIVATE_KEY_REFERENCE,publicKeyReferences:[e.PUBLICATION_PUBLIC_KEY_REFERENCE]}]);
const health=await resolver.health(e.PUBLICATION_SIGNING_KEY_ID,true);
if(!health.healthy)throw new Error('Publication key resolution failed');
const input={keyId:e.PUBLICATION_SIGNING_KEY_ID,algorithm:'Ed25519',bytes:new TextEncoder().encode('development worker adapter health probe; not release approval')};
const signed=await new Ed25519PublicationSigner(resolver).sign(input);
if(!await new Ed25519PublicationVerifier(resolver).verify({...input,...signed}))throw new Error('Signature verification failed');
console.log(JSON.stringify({schema:'athyper.publication-worker-signing-health/1',observedAt:new Date().toISOString(),environment:'dev',sanitized:true,tlsVerified:true,nativeAdapterKeyHealth:true,nativeAdapterSignVerify:true,keyId:input.keyId,nativeRelease:false}));
