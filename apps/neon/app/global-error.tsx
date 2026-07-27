"use client";

import { GlobalApplicationError } from "@athyper/app-foundation/client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <GlobalApplicationError error={error} reset={reset} />
      </body>
    </html>
  );
}
