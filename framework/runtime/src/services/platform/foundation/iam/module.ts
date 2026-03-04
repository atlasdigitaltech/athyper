import { createAuthAdapter } from "../../../../adapters/auth/auth.adapter.js";
import { createJoseVerifier } from "../../../../adapters/auth/jose.verifier.js";
import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";

export function registerAuthService(c: Container) {
    c.register(
        TOKENS.auth,
        createAuthAdapter(async (realmCfg) => {
            return createJoseVerifier({
                issuerUrl: realmCfg.issuerUrl,
                clientId: realmCfg.clientId,
                allowedAlgs: ["RS256"],
            });
        }),
        "singleton",
    );
}