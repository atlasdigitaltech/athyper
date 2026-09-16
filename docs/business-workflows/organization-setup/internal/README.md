# Workbook generation

Run `python3 docs/business-workflows/organization-setup/internal/generate-workbook.py` from the repository root to regenerate the blank Excel workbook and matching CSV headers using Python's standard library.

Generation overwrites the workbook and CSV templates. Keep completed business collection workbooks separately. Update field definitions in the script when revising the collection pack, and update the business guide/proposal consistently. The generator creates blank entry sheets, source guidance and fictional examples; it does not validate business inputs or import data.
