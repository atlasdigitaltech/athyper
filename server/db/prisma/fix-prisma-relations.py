#!/usr/bin/env python3
"""Repair introspected back-references within their owning Prisma model.

Absent fields are allowed across planes and retired models. Present fields must
match their expected relation type and direction; unexpected drift fails before
any schema is written. Run immediately after the three plane introspections.
"""
import re
import sys
from pathlib import Path

SCHEMA_DIR = Path(__file__).parent
SCHEMAS = [SCHEMA_DIR / f"schema.{plane}.prisma" for plane in ("neon", "mesh", "studio")]
MODELS = re.compile(r"^(model\s+(\w+)\s*\{\n)(.*?)(^\})", re.MULTILINE | re.DOTALL)
FIELDS = re.compile(r"^([ \t]+)(\w+)([ \t]+)(\w+)(\[\]|\?)?([^\n]*)$", re.MULTILINE)
SCOPED_LISTS = {
    "acct_profile_config": {
        "acct_profile_commitment_config": "acct_profile_commitment_config",
        "acct_profile_revenue_config": "acct_profile_revenue_config",
        "acct_profile_settlement_config": "acct_profile_settlement_config",
    },
    "commitment": {"commitment_procurement": "commitment_procurement"},
    "payment_term_discount_result": {"other_payment_term_discount_result": "payment_term_discount_result"},
    "brand_profile": {"tenant_profile": "tenant_profile"},
    "letterhead": {"tenant_profile": "tenant_profile"},
}
LONE_LISTS = {
    "atlas_run", "brand_profile", "contact_email", "contact_phone", "letterhead",
    "print_profile", "commodity_code_classification_policy", "template", "ledger_book",
}
RENAMES = {
    ("bom", "snapshot_bom"): "snapshot_bom",
    ("bom_component", "snapshot_bom_component"): "snapshot_bom_component",
    ("webhook_subscription", "control_webhook_subscription"): "control_webhook_subscription",
}


def fix_text(text: str) -> str:
    if not MODELS.search(text):
        raise ValueError("Prisma schema contains no model blocks")

    def repair_model(model):
        prefix, model_name, body, suffix = model.groups()
        fields = list(FIELDS.finditer(body))
        scalar_owner = any(f[2] == "owner_type" and f[4] == "String" for f in fields)

        for expected_name, expected_target in SCOPED_LISTS.get(model_name, {}).items():
            unexpected = [f for f in fields if f[4] == expected_target and f[2] != expected_name
                          and not re.search(r"\bfields\s*:", f[6])]
            if unexpected:
                raise ValueError(f"{model_name}.{expected_name}: unexpected back-reference field name")
        repaired_names = set()

        def repair_field(field):
            indent, name, spacing, target, cardinality, attributes = field.groups()
            cardinality = cardinality or ""
            scoped = SCOPED_LISTS.get(model_name, {}).get(name)
            if scoped:
                if target != scoped or re.search(r"\bfields\s*:", attributes) or cardinality not in ("?", "[]"):
                    raise ValueError(f"{model_name}.{name}: unexpected back-reference shape")
                cardinality = "[]"
            elif name in LONE_LISTS and target == name and not attributes.strip():
                if cardinality not in ("?", "[]"):
                    raise ValueError(f"{model_name}.{name}: unexpected back-reference cardinality")
                cardinality = "[]"
            replacement = RENAMES.get((name, target))
            if replacement and not re.search(r"\bfields\s*:", attributes):
                if cardinality != "[]" or attributes.strip():
                    raise ValueError(f"{model_name}.{name}: unexpected duplicate relation shape")
                name = replacement
            if scalar_owner and name == "owner_type" and target == "owner_type":
                if not re.search(r"fields:\s*\[owner_type_id\]", attributes):
                    raise ValueError(f"{model_name}.owner_type: unexpected relation coordinate")
                name = "owner_type_rel"
            repaired = f"{indent}{name}{spacing}{target}{cardinality}{attributes}"
            if repaired != field[0]:
                repaired_names.add(name)
            return repaired

        fixed = FIELDS.sub(repair_field, body)
        names = [f[2] for f in FIELDS.finditer(fixed)]
        if any(names.count(name) > 1 for name in repaired_names):
            raise ValueError(f"{model_name}: duplicate field remains after relation repair")
        return prefix + fixed + suffix

    return MODELS.sub(repair_model, text)


def main():
    # Qualify every plane before writing any output.
    changes = []
    for path in SCHEMAS:
        if not path.exists():
            raise FileNotFoundError(f"Required plane schema is missing: {path.name}")
        source = path.read_text(encoding="utf-8")
        fixed = fix_text(source)
        if fixed != source:
            changes.append((path, fixed))
        print(f"{path.name}: {'corrections required' if fixed != source else 'qualified'}")
    if "--check" in sys.argv:
        if changes:
            raise ValueError("Run fix-prisma-relations.py to repair introspected relations")
        return
    for path, fixed in changes:
        path.write_text(fixed, encoding="utf-8")
        print(f"Repaired {path.name}")


if __name__ == "__main__":
    main()
