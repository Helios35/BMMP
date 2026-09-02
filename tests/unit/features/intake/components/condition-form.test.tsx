// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { ConditionForm } from "@/features/intake/components/condition-form";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import { actionSucceeded, type ActionResult } from "@/lib/action-result";

/**
 * `ConditionForm` — `UX_SPEC.md` §3.9; Rules 6.2–6.6.
 *
 * `none_observed` is exclusive; the derived badge follows the findings through
 * `assessDamage`; confirming waits for the server; a damaged-or-defective
 * finding shows the damage-photo prompt and the sentence that no judgement
 * step sits between the finding and the flag.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function renderForm(
  overrides: Partial<Parameters<typeof ConditionForm>[0]> = {},
) {
  const onChange = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
  const onConfirm = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
  const view = render(
    <ConditionForm
      findings={[]}
      isDefective={false}
      confirmed={null}
      onChange={onChange}
      onConfirm={onConfirm}
      damagePhoto={{ sessionId: "s-1", uploadUrl: "/api/intake/photos" }}
      {...overrides}
    />,
  );
  return { ...view, onChange, onConfirm };
}

function checkbox(
  container: HTMLElement,
  finding: DamageFindingType | "defective",
) {
  const selector =
    finding === "defective"
      ? "[data-defective]"
      : `[data-finding='${finding}']`;
  return container.querySelector(selector) as HTMLElement;
}

describe("ConditionForm — none_observed is exclusive", () => {
  it("checking None observed clears every other finding", async () => {
    const { container, onChange } = renderForm({
      findings: ["dent", "corrosion"],
    });
    fireEvent.click(checkbox(container, "none_observed"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["none_observed"], false);
    });
  });

  it("checking any other finding clears None observed", async () => {
    const { container, onChange } = renderForm({ findings: ["none_observed"] });
    fireEvent.click(checkbox(container, "swelling"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["swelling"], false);
    });
  });
});

describe("ConditionForm — the derived condition", () => {
  it("reads not assessed with nothing selected, and gates the confirm with that reason", () => {
    const { container } = renderForm();
    expect(container.querySelector("[data-derived-condition]")).toHaveAttribute(
      "data-derived-condition",
      "not_assessed",
    );
    const confirm = screen.getByRole("button", {
      name: "Confirm assessed condition",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(container.querySelector("[data-gated-reason]")?.textContent).toBe(
      "Select what you observed, or None observed.",
    );
    expect(container.querySelector("[data-ddr-sentence]")).toBeNull();
    expect(container.querySelector("[data-damage-photo-prompt]")).toBeNull();
  });

  it("reads sound for None observed and cosmetic wear only for corrosion", () => {
    const sound = renderForm({ findings: ["none_observed"] });
    expect(
      sound.container.querySelector("[data-derived-condition]"),
    ).toHaveAttribute("data-derived-condition", "sound");
    expect(
      sound.container.querySelector("[data-status-state='default']")
        ?.textContent,
    ).toContain("Sound");
    sound.unmount();

    const cosmetic = renderForm({ findings: ["corrosion"] });
    expect(
      cosmetic.container.querySelector("[data-derived-condition]"),
    ).toHaveAttribute("data-derived-condition", "cosmetic_wear_only");
  });

  it("reads damaged or defective for swelling, states the rule, and prompts for a damage photo", () => {
    const { container } = renderForm({ findings: ["swelling"] });
    expect(container.querySelector("[data-derived-condition]")).toHaveAttribute(
      "data-derived-condition",
      "damaged_or_defective",
    );
    expect(container.querySelector("[data-ddr-sentence]")?.textContent).toBe(
      "A damaged-or-defective finding sets the damaged flag automatically — no judgement step sits between the two.",
    );
    expect(
      container.querySelector("[data-damage-photo-prompt]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-damage-photo-prompt] input[type='file']"),
    ).toHaveAttribute("data-photo-type", "damage");
  });

  it("reads damaged or defective for the functional flag alone", async () => {
    const { container, onChange } = renderForm({ findings: ["none_observed"] });
    fireEvent.click(checkbox(container, "defective"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["none_observed"], true);
    });
    const flagged = renderForm({
      findings: ["none_observed"],
      isDefective: true,
    });
    expect(
      flagged.container.querySelector("[data-derived-condition]"),
    ).toHaveAttribute("data-derived-condition", "damaged_or_defective");
  });
});

describe("ConditionForm — confirming is never optimistic", () => {
  it("shows Confirming… and nothing as confirmed until the server returns", async () => {
    let settle: (result: ActionResult<unknown>) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<ActionResult<unknown>>((resolve) => {
          settle = resolve;
        }),
    );
    const { container } = renderForm({
      findings: ["none_observed"],
      onConfirm,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm assessed condition" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirming…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelector("[data-condition-state]")).toHaveAttribute(
      "data-condition-state",
      "editing",
    );
    expect(container.querySelector("[data-condition-confirmed-by]")).toBeNull();

    await act(async () => {
      settle(actionSucceeded(undefined));
    });
    // Still nothing confirmed: the confirmed line renders from the server's
    // re-render (the `confirmed` prop), never from the click.
    expect(container.querySelector("[data-condition-confirmed-by]")).toBeNull();
  });

  it("renders the confirmed line from server state, collapsed, with Change", () => {
    const { container } = renderForm({
      findings: ["none_observed"],
      confirmed: { byName: "Dana Reyes", at: "14:22" },
    });
    expect(container.querySelector("[data-condition-state]")).toHaveAttribute(
      "data-condition-state",
      "confirmed",
    );
    expect(
      container.querySelector("[data-condition-confirmed-by]")?.textContent,
    ).toBe("Confirmed by Dana Reyes at 14:22");
    expect(container.querySelector("input")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(container.querySelector("[data-condition-state]")).toHaveAttribute(
      "data-condition-state",
      "editing",
    );
  });

  it("surfaces a refused confirmation and stays editable", async () => {
    const onConfirm = vi.fn(() =>
      Promise.resolve<ActionResult<unknown>>({
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Reconnect to confirm the assessed condition.",
          correlationId: "c-1",
        },
      }),
    );
    const { container } = renderForm({
      findings: ["none_observed"],
      onConfirm,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm assessed condition" }),
    );
    await waitFor(() => {
      expect(container.querySelector("[data-condition-error]")).not.toBeNull();
    });
    expect(
      screen.getByText("Reconnect to confirm the assessed condition."),
    ).toBeInTheDocument();
  });
});

describe("ConditionForm — disabled with a reason", () => {
  it("states the reason and makes every control inert", async () => {
    const { container, onChange } = renderForm({
      findings: ["none_observed"],
      disabledReason: "Your role reads this record and does not assess it.",
    });
    expect(
      container.querySelector("[data-condition-disabled]")?.textContent,
    ).toBe("Your role reads this record and does not assess it.");
    fireEvent.click(checkbox(container, "swelling"));
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm assessed condition" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ConditionForm — Rule 1.25 and chemistry", () => {
  it("expresses no probability, likelihood or detected chemistry in any state", () => {
    for (const findings of [[], ["none_observed"], ["swelling"]] as const) {
      const { container, unmount } = renderForm({ findings: [...findings] });
      expect(container.textContent ?? "").not.toMatch(
        /probabilit|likelihood|risk of|detected chemistry/i,
      );
      unmount();
    }
  });
});
