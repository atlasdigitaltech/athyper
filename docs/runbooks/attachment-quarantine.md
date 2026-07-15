# Attachment quarantine

New uploads remain unavailable until scan/quarantine state is acceptable. On scanner outage, follow the configured fail-closed policy, retain the object for retry, and do not expose a download URL. Replay scan work using the attachment ID and checksum; verify authorization before every download.
