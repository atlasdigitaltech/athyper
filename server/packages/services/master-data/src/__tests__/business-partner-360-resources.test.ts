import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction,
} from "kysely";
import { readBusinessPartner360CommonSection } from "../kysely-business-partner-360-sections.js";
import { createBusinessPartner360Service, type BusinessPartner360Repository } from "../business-partner-360-service.js";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";

async function read(
  sectionCode: "comments" | "attachments",
  certificateVisible = false,
) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const rows: Record<string, unknown>[][] = [
    [{ id: "owner", code: "business_partner" }],
    sectionCode === "comments"
      ? [
          {
            id: "c2",
            comment_text: "Newer",
            visibility: "internal",
            status: "open",
            created_at: "2026-09-08T02:00:00Z",
          },
          {
            id: "c1",
            comment_text: "Older",
            visibility: "internal",
            status: "open",
            created_at: "2026-09-08T01:00:00Z",
          },
        ]
      : [
          {
            id: "document",
            file_name: "certificate.pdf",
            content_type: "application/pdf",
            size_bytes: 500,
            created_at: "2026-09-08T01:00:00Z",
          },
        ],
  ];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      if (event.level === "query") queries.push(event.query);
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => ({
          ...args.result,
          rows: rows.shift() ?? [],
        }),
      },
    ],
  });
  try {
    const result = await readBusinessPartner360CommonSection(
      {
        tenantId: "tenant",
        businessPartnerId: "partner",
        principalId: "reader",
        category: "organization",
        sectionCode,
        certificateVisible,
        asOf: "2026-09-08",
        limit: 2,
        cursor: {
          snapshotAt: "2026-09-08T12:00:00Z",
          afterAt: "2026-09-08T03:00:00Z",
          afterId: "cursor",
        },
      },
      db as unknown as Transaction<Record<string, never>>,
    );
    return { result, query: queries.at(-1)! };
  } finally {
    await db.destroy();
  }
}

describe("Business Partner resource reads", () => {
  it("binds discussion to tenant, partner, reader visibility, date and pagination", async () => {
    const { result, query } = await read("comments");
    expect(query.sql).toContain("comment.tenant_id=");
    expect(query.sql).toContain("comment.entity_id=");
    expect(query.sql).toContain(
      "comment.visibility<>'private' OR comment.commenter_id=",
    );
    expect(query.sql).toContain("comment.status<>'deleted'");
    expect(query.parameters).toEqual(
      expect.arrayContaining(["tenant", "partner", "reader", "2026-09-08"]),
    );
    expect(result.items).toHaveLength(1);
    expect(result.next).toMatchObject({ id: "c2" });
  });
  it("lists scanned current documents without exposing storage keys or bypassing certificate permission", async () => {
    const { result, query } = await read("attachments");
    expect(query.sql).toContain("series.current_attachment_id=attachment.id");
    expect(query.sql).toContain("attachment.is_virus_scanned");
    expect(query.sql).toContain("link.entity_id=");
    expect(query.sql).toContain(
      "certification.company_code_id IS NULL OR certification.company_code_id=",
    );
    expect(query.parameters).toContain(false);
    expect(JSON.stringify(result)).not.toMatch(
      /storage_key|storage_bucket|signedUrl/,
    );
    expect(result.items[0]).toMatchObject({
      attachmentId: "document",
      fileName: "certificate.pdf",
    });
  });
});

it("redacts qualification controls and document links for a certificate-only reader", async () => {
  const repository = {
    resolveCore: async () => ({id:"partner",code:"BP1",category:"organization",displayName:"Partner",status:"active",version:1,changedAt:"2026-09-08T00:00:00Z",businessDate:"2026-09-08",roles:[],scopeValid:true,scopeResolved:false}),
    readCommercialControlSection: async () => ({state:"ready",provenance:[],data:{qualifications:[{id:"decision"}],preferences:[{id:"preference"}],blocks:[{id:"block"}],commodityCapabilities:[{id:"capability"}],certifications:[{id:"certificate",name:"ISO 9001",attachment:{attachmentId:"document"}}]}}),
  } as unknown as BusinessPartner360Repository<object>;
  const service=createBusinessPartner360Service({repository,transactions:{async run(_plane,_actor,work){return work({});}},definitions:{async resolve(){throw new Error("No definition");}},authorizer:{async authorize(query){return [P.record,P.certificate].includes(query.permissionCode as never)?{allowed:true}:{allowed:false,reason:"denied_by_grant"};}}});
  const result=await service.section({context:{planeKey:"neon",tenantId:"tenant",principalId:"reader"} as never,businessPartnerId:"partner",sectionCode:"qualifications-certificates"});
  expect(result.data).toMatchObject({qualifications:[],preferences:[],blocks:[],commodityCapabilities:[],certifications:[{id:"certificate",name:"ISO 9001"}]});
  expect(JSON.stringify(result.data)).not.toContain("attachmentId");
});
