#!/usr/bin/env python3
"""
fix-prisma-relations.py
=======================
Re-applies manual Prisma schema relation fixes that `prisma db pull` always
overwrites. Run this immediately after every `prisma db pull`.

Usage:
    python3 scripts/fix-prisma-relations.py

Or add to package.json:
    "prisma:pull": "prisma db pull && python3 scripts/fix-prisma-relations.py"
"""

import sys
from pathlib import Path

SCHEMA = Path(__file__).parent.parent / "src" / "prisma" / "schema.prisma"


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        print(f"  WARN [{label}] pattern not found — already fixed or schema changed")
        return content
    if content.count(old) > 1:
        print(f"  WARN [{label}] pattern found {content.count(old)} times — using replace_once anyway")
    result = content.replace(old, new, 1)
    print(f"  OK   [{label}]")
    return result


def main():
    text = SCHEMA.read_text(encoding="utf-8")

    # ── Fix 1-3: acct_profile_config back-refs → one-to-many ─────────────────
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

    # ── Fix 4: commitment.commitment_procurement back-ref → one-to-many ───────
    text = replace_once(
        text,
        'commitment_procurement?         @relation("commitment_procurement_tenant_id_commitment_idTocommitment")',
        'commitment_procurement[]        @relation("commitment_procurement_tenant_id_commitment_idTocommitment")',
        "commitment.commitment_procurement []",
    )

    # ── Fix 5: invoice_bank_snapshot — add composite unique ───────────────────
    text = replace_once(
        text,
        '  @@unique([tenant_id, id], map: "ibs_tenant_id_uq")\n'
        '  @@schema("document")\n'
        '}\n'
        '\n'
        '/// This table contains check constraints and requires additional setup for migrations. Visit https://pris.ly/d/check-constraints for more info.\n'
        'model invoice_match_case {',
        '  @@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")\n'
        '  @@unique([tenant_id, id], map: "ibs_tenant_id_uq")\n'
        '  @@schema("document")\n'
        '}\n'
        '\n'
        '/// This table contains check constraints and requires additional setup for migrations. Visit https://pris.ly/d/check-constraints for more info.\n'
        'model invoice_match_case {',
        "invoice_bank_snapshot @@unique tenant_invoice",
    )

    # ── Fix 6: invoice_party_snapshot — add composite unique ──────────────────
    text = replace_once(
        text,
        '  @@unique([tenant_id, id], map: "ips_tenant_id_uq")\n'
        '  @@index([tenant_id, supplier_id], map: "ips_supplier_idx"',
        '  @@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")\n'
        '  @@unique([tenant_id, id], map: "ips_tenant_id_uq")\n'
        '  @@index([tenant_id, supplier_id], map: "ips_supplier_idx"',
        "invoice_party_snapshot @@unique tenant_invoice",
    )

    # ── Fix 7: payment_term_discount_result self-ref back-ref → [] ───────────
    text = replace_once(
        text,
        '  other_payment_term_discount_result payment_term_discount_result? @relation("payment_term_discount_resultTopayment_term_discount_result")',
        '  other_payment_term_discount_result payment_term_discount_result[] @relation("payment_term_discount_resultTopayment_term_discount_result")',
        "payment_term_discount_result self-ref []",
    )

    # ── Fix 8: brand_profile.tenant_profile back-ref → [] ────────────────────
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

    # ── Fix 9: letterhead.tenant_profile back-ref → [] ───────────────────────
    text = replace_once(
        text,
        '  company_code      company_code?   @relation(fields: [company_code_id], references: [id], onUpdate: NoAction, map: "letterhead_cc_fk")\n'
        '  principal         principal       @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction, map: "letterhead_created_by_fk")\n'
        '  tenant            tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "letterhead_tenant_fk")\n'
        '  tenant_profile    tenant_profile?',
        '  company_code      company_code?   @relation(fields: [company_code_id], references: [id], onUpdate: NoAction, map: "letterhead_cc_fk")\n'
        '  principal         principal       @relation(fields: [created_by], references: [id], onDelete: NoAction, onUpdate: NoAction, map: "letterhead_created_by_fk")\n'
        '  tenant            tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "letterhead_tenant_fk")\n'
        '  tenant_profile    tenant_profile[]',
        "letterhead.tenant_profile []",
    )

    SCHEMA.write_text(text, encoding="utf-8")
    print(f"\nWrote {SCHEMA}")


if __name__ == "__main__":
    main()
