import { TOKENS } from "../../kernel/tokens.js";

import { createExpressHttpServer } from "./express.httpServer.js";

import type { Container } from "../../kernel/container.js";

export function registerHttpServer(container: Container) {
    container.register(
        TOKENS.httpServer,
        async (c) => {
            return createExpressHttpServer(c);
        },
        "singleton",
    );
}