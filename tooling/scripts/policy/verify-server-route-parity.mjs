import { writeOrCheck } from "./generate-server-route-manifest.mjs";
import {
  reconcileRouteDispositions,
  readRouteDispositionDecisions,
} from "./server-route-dispositions.mjs";
try {
  const manifest = writeOrCheck();
  const result = reconcileRouteDispositions(
    manifest,
    readRouteDispositionDecisions(process.cwd()),
  );
  if (result.unresolved)
    throw Error(
      `${result.unresolved} legacy route identities need reviewed replacement or retirement evidence. Structural matches still require behavioral qualification.`,
    );
  console.log(
    "Legacy route dispositions are complete; qualify response contracts and authorization separately.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
