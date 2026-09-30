# Stack v2 schema registry

The active JSON schemas currently live in `../instances/schemas` for backwards
compatibility with the implemented controller. Their ownership is broader than
instance templates:

- instance and resource contracts;
- service, provider, and image-set catalogs;
- qualification and orchestration decisions;
- backup, restore, migration, and acceptance receipts.

`deploy/stackctl/src/schema.mjs` is the executable registry. New schemas must be
registered there and tested with both valid and deliberately invalid fixtures.
Schema files can move into typed subdirectories only as one atomic migration;
duplicated schema authorities are prohibited.
