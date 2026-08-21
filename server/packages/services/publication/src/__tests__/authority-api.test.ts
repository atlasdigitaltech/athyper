import { expectTypeOf, it } from "vitest";
import type { PublicationAuthorityRepository } from "@athyper/server-contract-publication";
import { KyselyPublicationAuthorityRepository } from "../kysely-authority-repository.js";

it("implements the complete Publication authority repository contract", () => {
  expectTypeOf<KyselyPublicationAuthorityRepository>().toMatchTypeOf<PublicationAuthorityRepository>();
});
