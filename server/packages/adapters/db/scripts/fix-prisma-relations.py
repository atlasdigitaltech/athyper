#!/usr/bin/env python3
"""
fix-prisma-relations.py
=======================
Re-applies manual Prisma schema relation fixes that `prisma db pull` always
overwrites. Run this immediately after every `prisma db pull`.

Fixes applied (7 total):
  1-3. acct_profile_config back-refs → []
  4.   commitment.commitment_procurement back-ref → []
  5.   payment_term_discount_result self-ref back-ref → []
  6.   brand_profile.tenant_profile back-ref → []
  7.   letterhead.tenant_profile back-ref → []

Phase D.4 — fixes 5+6 (invoice_{bank,party}_snapshot @@unique inject) were
removed alongside the dropped tables.

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

    # ── Fix 5: payment_term_discount_result self-ref back-ref → [] ───────────
    text = replace_once(
        text,
        '  other_payment_term_discount_result payment_term_discount_result? @relation("payment_term_discount_resultTopayment_term_discount_result")',
        '  other_payment_term_discount_result payment_term_discount_result[] @relation("payment_term_discount_resultTopayment_term_discount_result")',
        "payment_term_discount_result self-ref []",
    )

    # ── Fix 6: brand_profile.tenant_profile back-ref → [] ────────────────────
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

    # ── Fix 7: letterhead.tenant_profile back-ref → [] ───────────────────────
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

    SCHEMA.write_text(text, encoding="utf-8")
    print(f"\nWrote {SCHEMA}")


if __name__ == "__main__":
    main()
