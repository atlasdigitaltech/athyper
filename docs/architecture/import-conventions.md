# Import conventions

Use package names for package-to-package imports:

```ts
import { MetadataClient } from "@athyper/metadata-client";
import { RuntimeDescriptor } from "@athyper/runtime-contracts";
import { ... } from "@athyper/neon-runtime";
```

Relative imports are allowed only within the same package. Do not import another package through
`../../packages/...`, `../../apps/...`, or an absolute filesystem path. Export a public symbol
from the owning package and add the package as a workspace dependency instead.

Application composition packages (`@athyper/app-neon`, `@athyper/app-admin`, and
`@athyper/app-mesh`) are distinct from product packages. Do not replace an app-composition import
with a product import unless the implementation has actually moved.
