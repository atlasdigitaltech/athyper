#!/usr/bin/env python3
"""
fix-prisma-relations.py
=======================
Re-applies manual Prisma schema relation fixes that `prisma db pull` always
overwrites. Run this immediately after every `prisma db pull`.

Fixes applied (12 total):
  1-3. acct_profile_config back-refs -> []
  4.   commitment.commitment_procurement back-ref -> []
  5.   payment_term_discount_result self-ref back-ref -> []
  6.   brand_profile.tenant_profile back-ref -> []
  7.   letterhead.tenant_profile back-ref -> []
  8.   atlas_thread.atlas_run back-ref -> [] (partial-unique on atlas_run is
       WHERE status='started' only -> semantically one-to-many)
  9.   bank_account_link.owner_type relation -> owner_type_rel (scalar col clash)
  10.  snapshot_bom back-refs -> snapshot_bom (duplicate with master_bom back-refs)
  11.  snapshot_bom_component back-refs -> snapshot_bom_component (same root cause)
  12.  control_webhook_subscription back-refs -> control_webhook_subscription
       (duplicate with event.webhook_subscription back-refs)

Phase D.4 — fixes 5+6 (invoice_{bank,party}_snapshot @@unique inject) were
removed alongside the dropped tables.

Usage:
    python3 scripts/fix-prisma-relations.py

Processes all three plane schemas (neon, mesh, admin). Fixes are no-ops
(print WARN) if a pattern doesn't apply to a given schema — safe to run
after any single-plane pull.

Or add to package.json:
    "prisma:pull": "prisma db pull && python3 scripts/fix-prisma-relations.py"
"""

import re
import sys
from pathlib import Path

SCHEMA_DIR = Path(__file__).parent.parent / "src" / "prisma"
SCHEMAS = [
    SCHEMA_DIR / "schema.prisma",
    SCHEMA_DIR / "schema.mesh.prisma",
    SCHEMA_DIR / "schema.admin.prisma",
]


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        print(f"  WARN [{label}] pattern not found — already fixed or schema changed")
        return content
    if content.count(old) > 1:
        print(f"  WARN [{label}] pattern found {content.count(old)} times — using replace_once anyway")
    result = content.replace(old, new, 1)
    print(f"  OK   [{label}]")
    return result


def apply_fixes(schema_path: Path) -> None:
    if not schema_path.exists():
        print(f"\nSkip {schema_path.name} — file not present")
        return
    print(f"\n-- {schema_path.name} --")
    text = schema_path.read_text(encoding="utf-8")

    # ── Fix 1-3: acct_profile_config back-refs -> one-to-many ─────────────────
    text = replace_once(
        text,
        "  acct_profile_commitment_config    acct_profile_commitment_config?",
        "  acct_profile_commitment_config    acct_profile_commitment_config[]",
        "acct_profile_config.commitment_config []",
    )
    text = replace_once(
        text,
        "  acct_profile_revenue_config       acct_profile_revenue_config?",
        "  acct_profile_revenue_config       acct_profile_revenue_config[]",
        "acct_profile_config.revenue_config []",
    )
    text = replace_once(
        text,
        "  acct_profile_settlement_config    acct_profile_settlement_config?",
        "  acct_profile_settlement_config    acct_profile_settlement_config[]",
        "acct_profile_config.settlement_config []",
    )

    # ── Fix 4: commitment.commitment_procurement back-ref -> one-to-many ───────
    # Prisma introspects this back-ref with variable formatting depending on
    # whether the relation has an explicit @relation("…") name. Try both.
    fix4_variants = [
        'commitment_procurement?         @relation("commitment_procurement_tenant_id_commitment_idTocommitment")',
        '  commitment_procurement                                                commitment_procurement?\n',
    ]
    fix4_replacements = [
        'commitment_procurement[]        @relation("commitment_procurement_tenant_id_commitment_idTocommitment")',
        '  commitment_procurement                                                commitment_procurement[]\n',
    ]
    applied = False
    for old, new in zip(fix4_variants, fix4_replacements):
        if old in text:
            text = text.replace(old, new, 1)
            print("  OK   [commitment.commitment_procurement []]")
            applied = True
            break
    if not applied:
        print("  WARN [commitment.commitment_procurement []] pattern not found — already fixed or schema changed")

    # (Phase D.4 — fixes 5+6 for invoice_{bank,party}_snapshot removed
    # alongside the dropped tables.)

    # ── Fix 5: payment_term_discount_result self-ref back-ref -> [] ───────────
    text = replace_once(
        text,
        '  other_payment_term_discount_result payment_term_discount_result? @relation("payment_term_discount_resultTopayment_term_discount_result")',
        '  other_payment_term_discount_result payment_term_discount_result[] @relation("payment_term_discount_resultTopayment_term_discount_result")',
        "payment_term_discount_result self-ref []",
    )

    # ── Fix 6: brand_profile.tenant_profile back-ref -> [] ────────────────────
    text = replace_once(
        text,
        '  principal         principal       @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction, map: "brand_profile_created_by_fk")\n'
        '  tenant            tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "brand_profile_tenant_fk")\n'
        '  tenant_profile    tenant_profile?',
        '  principal         principal       @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction, map: "brand_profile_created_by_fk")\n'
        '  tenant            tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "brand_profile_tenant_fk")\n'
        '  tenant_profile    tenant_profile[]',
        "brand_profile.tenant_profile []",
    )

    # ── Fix 7: letterhead.tenant_profile back-ref -> [] ───────────────────────
    # The "one" side (tenant_profile.letterhead) keeps fields/references.
    # The "many" side (letterhead.tenant_profile) must be a plain back-reference [].
    # Two spacing variants — prisma db pull spacing varies between runs.
    if '  tenant_profile    tenant_profile?' in text and 'letterhead_tenant_fk' in text:
        text = text.replace(
            '  tenant_profile    tenant_profile?',
            '  tenant_profile    tenant_profile[]',
            1,  # only the letterhead model occurrence
        )
        print("  OK   [letterhead.tenant_profile []]")
    else:
        print("  WARN [letterhead.tenant_profile []] pattern not found — already fixed or schema changed")

    # -- Fix 8: atlas_run? back-refs -> [] --
    # Both ai_agent_run and atlas_thread carry `atlas_run atlas_run?` back-refs
    # whose FK on the atlas_run side is not unique (partial-unique WHERE
    # status='started') -> semantically one-to-many. Whitespace varies per pull.
    pattern = re.compile(r"^(  atlas_run\s+)atlas_run\?\s*$", re.MULTILINE)
    matches = pattern.findall(text)
    if matches:
        text = pattern.sub(lambda m: f"{m.group(1)}atlas_run[]", text)
        print(f"  OK   [atlas_run? back-refs -> [] ({len(matches)} occurrences)]")
    else:
        print("  WARN [atlas_run? back-refs] pattern not found -- already fixed or schema changed")

    # -- Fix 9: owner_type relation -> owner_type_rel (scalar col clash) ----------
    # Some models (address_link, bank_account_link, contact_link, external_reference)
    # have BOTH a scalar `owner_type String` column and a relation to the
    # `owner_type` lookup table via `owner_type_id`. Prisma names both `owner_type`,
    # causing a conflict. Rename the relation field to `owner_type_rel`.
    # Exclude models where the conflict doesn't exist (owner_type_purpose,
    # contact_person) by requiring the FK map name NOT to start with those prefixes.
    p9 = re.compile(
        r"^(  )owner_type(\s+)owner_type(\s+@relation\(fields: \[owner_type_id\]"
        r"[^)]*map: \"(?!owner_type_purpose|contact_person)[^\"]+\")",
        re.MULTILINE,
    )
    c9 = len(p9.findall(text))
    if c9:
        text = p9.sub(lambda m: f"{m.group(1)}owner_type_rel{m.group(2)}owner_type{m.group(3)}", text)
        print(f"  OK   [owner_type -> owner_type_rel ({c9} occurrences)]")
    else:
        print("  WARN [owner_type -> owner_type_rel] pattern not found")

    # -- Fix 10: snapshot_bom back-refs — rename duplicate 'bom' field ----------
    # company_code, item, and uom each hold back-refs to BOTH master_bom and
    # snapshot_bom. Prisma names both `bom`, creating a conflict. Rename the
    # snapshot_bom back-ref to `snapshot_bom`.
    p10 = re.compile(r"^  bom(\s+)snapshot_bom\[\]\s*$", re.MULTILINE)
    c10 = len(p10.findall(text))
    if c10:
        text = p10.sub(lambda m: f"  snapshot_bom{m.group(1)}snapshot_bom[]", text)
        print(f"  OK   [bom -> snapshot_bom back-refs ({c10} occurrences)]")
    else:
        print("  WARN [bom -> snapshot_bom back-refs] pattern not found")

    # -- Fix 11: snapshot_bom_component back-refs — rename duplicate field ------
    # Same root cause as Fix 10: master_bom_component and snapshot_bom_component
    # both generate back-refs named `bom_component` on item, uom, and principal.
    p11 = re.compile(r"^  bom_component(\s+)snapshot_bom_component\[\]\s*$", re.MULTILINE)
    c11 = len(p11.findall(text))
    if c11:
        text = p11.sub(lambda m: f"  snapshot_bom_component{m.group(1)}snapshot_bom_component[]", text)
        print(f"  OK   [bom_component -> snapshot_bom_component back-refs ({c11} occurrences)]")
    else:
        print("  WARN [bom_component -> snapshot_bom_component back-refs] pattern not found")

    # -- Fix 12: control_webhook_subscription back-ref rename -------------------
    # `control.webhook_subscription` and `event.webhook_subscription` both
    # generate a `webhook_subscription  <model>[]` back-ref on tenant (and
    # integration_endpoint). After Prisma renames the control model to
    # `control_webhook_subscription`, the back-ref field keeps the old name
    # `webhook_subscription`, clashing with the event model's back-ref.
    # Rename to `control_webhook_subscription`.
    p12 = re.compile(
        r"^  webhook_subscription(\s+)control_webhook_subscription\[\]\s*$",
        re.MULTILINE,
    )
    c12 = len(p12.findall(text))
    if c12:
        text = p12.sub(
            lambda m: f"  control_webhook_subscription{m.group(1)}control_webhook_subscription[]",
            text,
        )
        print(f"  OK   [webhook_subscription -> control_webhook_subscription back-refs ({c12} occurrences)]")
    else:
        print("  WARN [webhook_subscription -> control_webhook_subscription back-refs] pattern not found")

    # -- Fix 13: lone model-typed back-refs inferred as ? instead of [] ----------
    # When authz/ops/runtime_meta schemas were added to the neon datasource,
    # Prisma re-introspected and inferred some back-refs as ? (one-to-one) even
    # though the FK columns have no unique constraint. These are all plain
    # back-reference fields (no @relation attribute on the same line).
    # Affected fields and the models they appear in:
    #   brand_profile           : principal, tenant
    #   contact_email           : contact_link, tenant
    #   contact_phone           : contact_link, tenant
    #   letterhead              : principal, tenant
    #   print_profile           : principal, tenant
    #   template                : template_version (current_version_id back-ref)
    #   commodity_code_classification_policy : tenant
    # Pattern: line has exactly "  FIELD_NAME  MODEL_NAME?" with no @relation.
    lone_backref_fixes = [
        "brand_profile",
        "contact_email",
        "contact_phone",
        "letterhead",
        "print_profile",
        "commodity_code_classification_policy",
    ]
    for field in lone_backref_fixes:
        p = re.compile(
            rf"^(  {re.escape(field)})(\s+){re.escape(field)}\?\s*$",
            re.MULTILINE,
        )
        count = len(p.findall(text))
        if count:
            text = p.sub(lambda m: f"{m.group(1)}{m.group(2)}{field}[]", text)
            print(f"  OK   [{field}? -> [] ({count} occurrences)]")
        else:
            print(f"  WARN [{field}? -> []] pattern not found -- already fixed or schema changed")

    # -- Fix 14: template? back-ref in template_version (current_version_id) ----
    # template_version holds a FK to template via current_version_id. Prisma
    # generates a back-ref `template  template?` in the model that DOES NOT hold
    # the FK (template), but infers it as one-to-one. Fix to [].
    p14 = re.compile(r"^(  template)(\s+)template\?\s*$", re.MULTILINE)
    c14 = len(p14.findall(text))
    if c14:
        text = p14.sub(lambda m: f"{m.group(1)}{m.group(2)}template[]", text)
        print(f"  OK   [template? -> [] ({c14} occurrences)]")
    else:
        print("  WARN [template? -> []] pattern not found -- already fixed or schema changed")

    # -- Fix 15: ledger_book? back-refs in principal (named relations) -----------
    # principal holds ledger_book FKs for created_by/updated_by/status_changed_by.
    # Prisma generates named back-refs on ledger_book with `principal?`. Fix to [].
    p15 = re.compile(r"^(  ledger_book)(\s+)ledger_book\?\s*$", re.MULTILINE)
    c15 = len(p15.findall(text))
    if c15:
        text = p15.sub(lambda m: f"{m.group(1)}{m.group(2)}ledger_book[]", text)
        print(f"  OK   [ledger_book? -> [] ({c15} occurrences)]")
    else:
        print("  WARN [ledger_book? -> []] pattern not found -- already fixed or schema changed")

    schema_path.write_text(text, encoding="utf-8")
    print(f"Wrote {schema_path}")


def main():
    for schema_path in SCHEMAS:
        apply_fixes(schema_path)


if __name__ == "__main__":
    main()
