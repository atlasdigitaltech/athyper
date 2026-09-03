import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AtlasPromptComposer } from "../../packages/platform/shell/shell/src/home";

function AtlasComposerFixture() {
  const [value, setValue] = useState("");
  return <main className="athyper-experience" data-surface="neon.home">
    <div className="athyper-home">
      <AtlasPromptComposer
        draftKey="atlas-composer-browser-test"
        value={value}
        onChange={setValue}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        busy={false}
        onAgentChange={() => undefined}
      />
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<AtlasComposerFixture />);
