
import { getRealmIamConfig } from "../../kernel/tenantContext";
import { TOKENS } from "../../kernel/tokens";

import type { AuthAdapter, AuthVerifier } from "./auth.types";
import type { RuntimeConfig } from "../../kernel/config.schema";
import type { Container } from "../../kernel/container";

type VerifierFactory = (cfg: { issuerUrl: string; clientId: string; clientSecret?: string }) => Promise<AuthVerifier>;

export function createAuthAdapter(factory: VerifierFactory) {
    return async (c: Container): Promise<AuthAdapter> => {
        const cfg = await c.resolve<RuntimeConfig>(TOKENS.config);

        const cache = new Map<string, Promise<AuthVerifier>>();

        return {
            async getVerifier(realmKey: string) {
                if (!cache.has(realmKey)) {
                    cache.set(
                        realmKey,
                        (async () => {
                            const realmCfg = getRealmIamConfig(cfg, realmKey);
                            return factory(realmCfg);
                        })(),
                    );
                }
                return cache.get(realmKey)!;
            },
        };
    };
}