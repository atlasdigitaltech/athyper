import type { Kysely } from "kysely";
import type { DB } from "../../generated/kysely/types.js";

export type EndpointRow = {
  id: string;
  service: string;
  path: string;
  method: string;
  is_active: boolean;
};

export async function findActiveEndpoints(
  db: Kysely<DB>,
  service?: string,
): Promise<EndpointRow[]> {
  let q = db
    .selectFrom("int.endpoint as e" as never)
    .select(["e.id", "e.service", "e.path", "e.method", "e.is_active"] as never[])
    .where("e.is_active" as never, "=", true as never);

  if (service) {
    q = q.where("e.service" as never, "=", service as never);
  }

  return q.execute() as Promise<EndpointRow[]>;
}
