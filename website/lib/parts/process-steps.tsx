// Numbered steps in a row (defuss-shadcn process-step), as the overview and the library guide open their examples.
import type { Props } from "defuss";

export function ProcessSteps({ steps }: Props & { steps: { title: string; description: string }[] }) {
  return (
    <ol class="mk-process-steps usage-steps" data-variant="horizontal">
      {steps.map((step, index) => (
        <li class="mk-process-step" key={step.title}>
          <span class="mk-process-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div class="mk-process-step-body">
            <h3 class="mk-process-step-title">{step.title}</h3>
            <p class="mk-process-step-desc">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
