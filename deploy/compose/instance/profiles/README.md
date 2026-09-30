# Optional profile ownership

New optional capability definitions belong in a profile-specific fragment in
this directory (`observability`, `search`, `render`, `scanner`, `secretstore`,
`analytics`, `admin-db`, or `admin-queue`). `../compose.optional.yaml` remains
the compatibility overlay while those definitions are extracted incrementally.

Profiles are selected by the controller and must remain absent from normal
instance plans unless explicitly requested.
