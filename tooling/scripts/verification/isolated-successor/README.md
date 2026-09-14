# Historical release-19 verification harness

This harness retains the single-bucket `S3_BUCKET` contract for the release-19
pinned/approved images. It does not bootstrap or qualify the v6 storage layout.
See [the v6 cutover runbook](../../../../docs/operations/object-storage-v6.md#historical-isolated-verification-harnesses).

Do not reuse these runtime environment files with a current v6 platform host.
Candidate image commands must stay compatible with this historical contract;
a v6 candidate needs a separate three-bucket sandbox and new acceptance evidence.
