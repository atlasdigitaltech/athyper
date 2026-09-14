// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { parseEntityIntakeFlow } from "@athyper/contract-platform-entity-runtime";
import {
  EntityIntake,
  EntityIntakeForm,
  useEntityIntake,
} from "@athyper/platform-entity-form-detail";
import {
  EntityTaskHeaderProvider,
  useEntityTaskHeader,
} from "@athyper/platform-shell";
const flow = parseEntityIntakeFlow({
  schemaVersion: 1,
  key: "product_request",
  kind: "create",
  title: "New product request",
  navigation: "linear",
  allowDraftResume: false,
  entryOperation: "create",
  completionOperation: "submit",
  steps: [
    {
      key: "classification",
      surfaceKey: "classification",
      title: "Classification",
      optional: false,
    },
    {
      key: "product_details",
      surfaceKey: "product_details",
      title: "Product details",
      optional: false,
    },
    { key: "check", surfaceKey: "check", title: "Review", optional: false },
  ],
});
function Header() {
  const header = useEntityTaskHeader();
  return (
    <header>
      <h1>{header?.title ?? "Products"}</h1>
      {header?.actions}
      {header?.navigation ?? <nav>Overview · Manage</nav>}
    </header>
  );
}
function Product({ submit }: { submit: () => Promise<void> }) {
  const intake = useEntityIntake()!;
  const [category, setCategory] = useState("");
  return (
    <>
      <div hidden={intake.state.currentStep !== "classification"}>
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value)}
        >
          <option value="">Choose</option>
          <option value="stock">Stock</option>
        </select>
        <button disabled={!category} onClick={intake.next}>
          Continue
        </button>
      </div>
      <div hidden={intake.state.currentStep === "classification"}>
        <EntityIntakeForm
          detailsStep="product_details"
          reviewStep="check"
          onSubmit={async (e) => {
            e.preventDefault();
            await submit();
          }}
        >
          <label htmlFor="product-name">Product name</label>
          <input id="product-name" name="name" required />
          <button type="submit">Review product</button>
        </EntityIntakeForm>
      </div>
    </>
  );
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (n) => n.textContent === text,
  )!;
async function render(submit = vi.fn(async () => {})) {
  await act(async () =>
    root.render(
      <EntityTaskHeaderProvider>
        <Header />
        <EntityIntake
          flow={flow}
          descriptorHash="product-v1"
          cancelHref="/products"
        >
          <Product submit={submit} />
        </EntityIntake>
      </EntityTaskHeaderProvider>,
    ),
  );
  return submit;
}
it("reuses the application header and replaces tabs for a second entity", async () => {
  await render();
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelector("h1")?.textContent).toBe(
    "New product request",
  );
  expect(container.textContent).not.toContain("Overview · Manage");
  expect(
    container.querySelector('[aria-current="step"]')?.textContent,
  ).toContain("Classification");
});
it("reviews without mutating, retains input on Back, and sends only one final submission", async () => {
  let resolve!: () => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  await render(submit);
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = "stock";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => button("Continue").click());
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Widget");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Review product").click());
  expect(submit).not.toHaveBeenCalled();
  expect(container.querySelector("dd")?.textContent).toBe("Widget");
  await act(async () => button("Back").click());
  expect(input.value).toBe("Widget");
  await act(async () => button("Review product").click());
  await act(async () => {
    button("Submit for approval").click();
    button("Submit for approval").click();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
});
it("restores ordinary navigation when the intake unmounts", async () => {
  await render();
  await act(async () =>
    root.render(
      <EntityTaskHeaderProvider>
        <Header />
      </EntityTaskHeaderProvider>,
    ),
  );
  expect(container.querySelector("h1")?.textContent).toBe("Products");
  expect(container.textContent).toContain("Overview · Manage");
});

it("resumes a saved draft at Details with one edit header and an unsaved-close guard", async () => {
  function DraftPresentation() {
    const intake = useEntityIntake()!;
    React.useEffect(() => { intake.setPresentation({title:"Edit product request",exitLabel:"Close",context:"Draft · PR-123",lockedSteps:["classification"]}); }, [intake.setPresentation]);
    return <button onClick={intake.markDirty}>Change draft</button>;
  }
  await act(async () => root.render(<EntityTaskHeaderProvider><Header/><EntityIntake flow={{...flow,allowDraftResume:true}} descriptorHash="product-v1" initialCheckpoint={{flowKey:flow.key,descriptorHash:"product-v1",currentStep:"product_details",completed:["classification"]}} cancelHref="/products"><DraftPresentation/></EntityIntake></EntityTaskHeaderProvider>));
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelector("h1")?.textContent).toBe("Edit product request");
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Product details");
  expect(container.textContent).not.toContain("Overview · Manage");
  expect(container.querySelector("a")?.textContent).toBe("Close");
  await act(async () => button("Change draft").click());
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
  const event=new MouseEvent("click",{bubbles:true,cancelable:true});
  await act(async () => { container.querySelector("a")!.dispatchEvent(event); });
  expect(confirm).toHaveBeenCalledOnce();
  expect(event.defaultPrevented).toBe(true);
  confirm.mockRestore();
});
