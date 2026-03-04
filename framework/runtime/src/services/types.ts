// framework/runtime/src/services/types.ts

import type { Container } from "../kernel/container";

export type RuntimeModule = {
    name: string;
    register?: (c: Container) => void | Promise<void>;
    contribute?: (c: Container) => void | Promise<void>;
};
