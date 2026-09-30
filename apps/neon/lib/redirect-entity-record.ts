import { notFound, redirect } from "next/navigation";
import { entityRecordHref } from "@athyper/contract-platform-entity-runtime";
import { isEntityId } from "./route-params";

export interface LegacyEntityRecordProps {
  readonly params: Promise<{ readonly recordId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function redirectEntityRecord(entityCode: string, {params, searchParams}: LegacyEntityRecordProps): Promise<never> {
  const {recordId} = await params;
  if (!isEntityId(recordId)) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  redirect(entityRecordHref(entityCode, recordId, query));
}
