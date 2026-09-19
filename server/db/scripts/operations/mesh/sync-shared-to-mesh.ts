#!/usr/bin/env node
throw new Error(
  "The legacy Neon-to-Mesh shared-reference sync is retired. "
  + "All three foundations install ddl/common/shared/12_reference_seed.sql. "
  + "Deliver reference changes through reviewed forward migrations for each plane; "
  + "verify the common pack with pnpm --dir server/db run db:verify:shared-reference.",
);
