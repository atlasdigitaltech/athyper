"use client";
import { useMemo, useState } from "react";
import { useEntityApplication } from "@athyper/platform-entity-list-view";
import { useRegisterEntityTaskHeader } from "@athyper/platform-shell";
import {
  EntityIntakeClassification,
  type IntakeClassificationHandoff,
} from "@athyper/platform-entity-form-detail";
/** Classification-only pilot. No financial records or approval requests are created. */
export function InvoiceClassificationPilot() {
  const app = useEntityApplication();
  const surface = app?.descriptor.intakeSurfaces?.find(
    (s) => s.key === "intake_classification",
  );
  const [review, setReview] = useState<IntakeClassificationHandoff>();
  const header = useMemo(
    () => ({
      title: "Invoice classification",
      description: "Choose the invoice type, basis, and supplier relationship.",
      actions: (
        <a
          className="a-button a-button--secondary"
          href="/supply-chain/procurement/invoices"
        >
          Cancel
        </a>
      ),
      navigation: (
        <nav
          className="athyper-section-nav a-management-navigation"
          aria-label="Request progress"
        >
          <span className="a-management-navigation__step" aria-current="step">
            Classification
          </span>
        </nav>
      ),
    }),
    [],
  );
  useRegisterEntityTaskHeader(header);
  if (!surface || !app)
    return (
      <p role="status">
        Invoice classification metadata has not been published.
      </p>
    );
  const hash = app.descriptor.revision.descriptorHash;
  return (
    <>
      <EntityIntakeClassification
        key={hash}
        surface={surface}
        descriptorHash={hash}
        continueLabel="Review classification"
        onAnswersChange={() => setReview(undefined)}
        onContinue={async (handoff) => {
          setReview(handoff);
        }}
      />
      {review?.descriptorHash === hash ? (
        <section
          className="a-intake-review"
          aria-label="Classification handoff"
        >
          <h2>Classification review</h2>
          <dl>
            {surface.sections
              .flatMap((s) => s.fields)
              .map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>
                    {(field.control === "choiceCards" ? field.options : []).find(
                      (o) => o.value === review.answers[field.key],
                    )?.label ?? "—"}
                  </dd>
                </div>
              ))}
          </dl>
          <p>
            This pilot reviews classification only. No invoice has been created
            or submitted.
          </p>
        </section>
      ) : null}
    </>
  );
}
