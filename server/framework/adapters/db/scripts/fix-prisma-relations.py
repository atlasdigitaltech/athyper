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

    # ── Fix 5: invoice_bank_snapshot — inject missing composite unique ────────
    # DB only has @unique on purchase_invoice_id alone; Prisma needs the composite
    # @@unique([tenant_id, purchase_invoice_id]) to accept the one-to-one relation.
    # Deduplicate if db pull ever adds it again.
    text = text.replace(
        '  @@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")\n'
        '  @@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")\n',
        '  @@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")\n',
        1,
    )
    if '@@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")' not in text:
        text = text.replace(
            '  @@unique([tenant_id, id], map: "ibs_tenant_id_uq")',
            '  @@unique([tenant_id, purchase_invoice_id], map: "ibs_tenant_invoice_uq")\n'
            '  @@unique([tenant_id, id], map: "ibs_tenant_id_uq")',
            1,
        )
        print("  OK   [invoice_bank_snapshot @@unique inject]")

    # ── Fix 6: invoice_party_snapshot — inject missing composite unique ────────
    text = text.replace(
        '  @@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")\n'
        '  @@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")\n',
        '  @@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")\n',
        1,
    )
    if '@@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")' not in text:
        text = text.replace(
            '  @@unique([tenant_id, id], map: "ips_tenant_id_uq")\n'
            '  @@index([tenant_id, supplier_id], map: "ips_supplier_idx"',
            '  @@unique([tenant_id, purchase_invoice_id], map: "ips_tenant_invoice_uq")\n'
            '  @@unique([tenant_id, id], map: "ips_tenant_id_uq")\n'
            '  @@index([tenant_id, supplier_id], map: "ips_supplier_idx"',
            1,
        )
        print("  OK   [invoice_party_snapshot @@unique inject]")

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

    # ── Fix 10: company_code_supplier_profile.payment_method name collision ──────
    # The model has a String column named `payment_method` AND a relation to the
    # `payment_method` table. Prisma generates both with the same name → rename
    # the relation to `payment_method_ref` to avoid the duplicate field error.
    text = replace_once(
        text,
        '  payment_method                                                                        payment_method?    @relation(fields: [tenant_id, payment_method_id], references: [tenant_id, id], onDelete: SetNull, onUpdate: NoAction, map: "scp_payment_method_id_fk")',
        '  payment_method_ref                                                                    payment_method?    @relation(fields: [tenant_id, payment_method_id], references: [tenant_id, id], onDelete: SetNull, onUpdate: NoAction, map: "scp_payment_method_id_fk")',
        "company_code_supplier_profile.payment_method_ref rename",
    )

    SCHEMA.write_text(text, encoding="utf-8")
    print(f"\nWrote {SCHEMA}")


if __name__ == "__main__":
    main()
