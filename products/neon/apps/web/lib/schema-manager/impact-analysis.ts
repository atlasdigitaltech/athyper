// lib/schema-manager/impact-analysis.ts
//
// Analyzes the impact of schema changes on APIs, migrations, and data.

import { diffFields, diffIndexes, diffRelations } from "./schema-diff";

import type {
  FieldDefinition,
  IndexDefinition,
  RelationDefinition,
} from "./types";

// ─── Impact Types ─────────────────────────────────────────────

export interface ImpactReport {
  migrations: MigrationImpact[];
  apiImpacts: ApiImpact[];
  dataImpacts: DataImpact[];
  riskLevel: "low" | "medium" | "high";
  summary: string;
}

export interface MigrationImpact {
  type:
    | "add_column"
    | "drop_column"
    | "alter_column"
    | "add_index"
    | "drop_index"
    | "add_fk"
    | "drop_fk";
  table: string;
  column?: string;
  target?: string;
  detail: string;
  description?: string;
  reversible: boolean;
  breaking?: boolean;
  ddlPreview?: string;
}

export interface ApiImpact {
  type: "new_field" | "removed_field" | "type_change" | "relation_change";
  detail: string;
  description?: string;
  method?: string;
  endpoint?: string;
  breaking: boolean;
}

export interface DataImpact {
  type: "backfill_required" | "data_loss_risk" | "constraint_violation";
  detail: string;
  description?: string;
  target?: string;
  affectedField: string;
  estimatedRows?: number;
}

// ─── Impact Analysis ──────────────────────────────────────────

export function analyzeImpact(
  tableName: string,
  base: {
    fields: FieldDefinition[];
    relations: RelationDefinition[];
    indexes: IndexDefinition[];
  },
  target: {
    fields: FieldDefinition[];
    relations: RelationDefinition[];
    indexes: IndexDefinition[];
  },
): ImpactReport {
  const fieldDiffs = diffFields(base.fields, target.fields);
  const relationDiffs = diffRelations(base.relations, target.relations);
  const indexDiffs = diffIndexes(base.indexes, target.indexes);

  const migrations: MigrationImpact[] = [];
  const apiImpacts: ApiImpact[] = [];
  const dataImpacts: DataImpact[] = [];

  // Field impacts
  for (const diff of fieldDiffs) {
    switch (diff.kind) {
      case "added": {
        migrations.push({
          type: "add_column",
          table: tableName,
          column: diff.fieldName,
          detail: `ALTER TABLE ${tableName} ADD COLUMN ${diff.fieldName} ...`,
          reversible: true,
        });
        apiImpacts.push({
          type: "new_field",
          detail: `New field '${diff.fieldName}' will be available in API responses`,
          breaking: false,
        });
        if (diff.breaking) {
          dataImpacts.push({
            type: "backfill_required",
            detail: `New required field '${diff.fieldName}' needs default values for existing rows`,
            affectedField: diff.fieldName,
          });
        }
        break;
      }
      case "removed": {
        migrations.push({
          type: "drop_column",
          table: tableName,
          column: diff.fieldName,
          detail: `ALTER TABLE ${tableName} DROP COLUMN ${diff.fieldName}`,
          reversible: false,
        });
        apiImpacts.push({
          type: "removed_field",
          detail: `Field '${diff.fieldName}' removed from API responses`,
          breaking: true,
        });
        dataImpacts.push({
          type: "data_loss_risk",
          detail: `All data in column '${diff.fieldName}' will be permanently lost`,
          affectedField: diff.fieldName,
        });
        break;
      }
      case "type_changed": {
        migrations.push({
          type: "alter_column",
          table: tableName,
          column: diff.fieldName,
          detail: `ALTER TABLE ${tableName} ALTER COLUMN ${diff.fieldName} TYPE ...`,
          reversible: false,
        });
        apiImpacts.push({
          type: "type_change",
          detail: `Field '${diff.fieldName}' type changed — API consumers must update`,
          breaking: true,
        });
        break;
      }
    }
  }

  // Relation impacts
  for (const diff of relationDiffs) {
    if (diff.kind === "added") {
      migrations.push({
        type: "add_fk",
        table: tableName,
        detail: `Add foreign key constraint for relation '${diff.relationName}'`,
        reversible: true,
      });
    }
    if (diff.kind === "removed") {
      migrations.push({
        type: "drop_fk",
        table: tableName,
        detail: `Drop foreign key constraint for relation '${diff.relationName}'`,
        reversible: true,
      });
      apiImpacts.push({
        type: "relation_change",
        detail: `Relation '${diff.relationName}' removed — related queries will break`,
        breaking: true,
      });
    }
  }

  // Index impacts
  for (const diff of indexDiffs) {
    if (diff.kind === "added") {
      migrations.push({
        type: "add_index",
        table: tableName,
        detail: `CREATE INDEX for '${diff.indexName}'`,
        reversible: true,
      });
    }
    if (diff.kind === "removed") {
      migrations.push({
        type: "drop_index",
        table: tableName,
        detail: `DROP INDEX '${diff.indexName}'`,
        reversible: true,
      });
    }
  }

  // Determine risk level
  const hasDataLoss = dataImpacts.some((d) => d.type === "data_loss_risk");
  const hasBreaking = apiImpacts.some((a) => a.breaking);
  const riskLevel = hasDataLoss ? "high" : hasBreaking ? "medium" : "low";

  const totalChanges =
    fieldDiffs.length + relationDiffs.length + indexDiffs.length;
  const summary =
    totalChanges === 0
      ? "No schema changes detected"
      : `${migrations.length} migration${migrations.length === 1 ? "" : "s"}, ${apiImpacts.filter((a) => a.breaking).length} breaking API change${apiImpacts.filter((a) => a.breaking).length === 1 ? "" : "s"}, risk: ${riskLevel}`;

  return { migrations, apiImpacts, dataImpacts, riskLevel, summary };
}
