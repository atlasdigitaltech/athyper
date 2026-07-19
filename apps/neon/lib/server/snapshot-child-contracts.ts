import "server-only";

import {
  resolveSnapshotChildEntityCodes,
  type SnapshotChildContracts,
} from "@athyper/runtime-canvas";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";

/**
 * Resolves descriptor rules used only by snapshot graph drawers. Kept out of
 * the record bootstrap so Details and other process surfaces never pay for
 * child metadata they do not render.
 */
export async function loadSnapshotChildContracts(
  parent: MetaEntityRuntimeDescriptor,
): Promise<SnapshotChildContracts> {
  const initial = resolveSnapshotChildEntityCodes(parent);
  const [linesContract, componentsContract, schedulesContract] = await Promise.all([
    initial.lines ? getMetaEntityRuntimeDescriptor(initial.lines) : Promise.resolve(undefined),
    initial.components ? getMetaEntityRuntimeDescriptor(initial.components) : Promise.resolve(undefined),
    initial.schedules ? getMetaEntityRuntimeDescriptor(initial.schedules) : Promise.resolve(undefined),
  ]);

  const result: SnapshotChildContracts = {};
  if (linesContract) result.lines = linesContract;
  if (componentsContract) result.components = componentsContract;
  if (schedulesContract) result.schedules = schedulesContract;

  if (linesContract) {
    const second = resolveSnapshotChildEntityCodes(parent, linesContract);
    if (second.distributions && second.distributions !== initial.distributions) {
      const distributionContract = await getMetaEntityRuntimeDescriptor(second.distributions);
      if (distributionContract) result.distributions = distributionContract;
    }
  }
  return result;
}
