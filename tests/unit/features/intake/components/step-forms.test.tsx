// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { formatWallClockTime } from "@/components/offline/offline-banner";
import {
  logAnotherHref,
  LoggedToast,
} from "@/features/intake/components/logged-toast";
import { ResumeNotice } from "@/features/intake/components/resume-notice";
import {
  SOURCE_DEVICE_HELPER,
  SourceDeviceForm,
} from "@/features/intake/components/source-device-form";
import { StateOfChargeForm } from "@/features/intake/components/state-of-charge-form";
import { INTAKE_STEP_LABELS } from "@/domain/taxonomy/intake-step";
import { actionSucceeded } from "@/lib/action-result";

/**
 * The smaller step-3 forms and the two notices — `UX_SPEC.md` §3.9, §2.12,
 * §6.2.
 *
 * The state-of-charge form records a band and never a health figure; the
 * source-device form says verification is a later phase; the resume notice
 * states the start as HH:MM; the logged toast fires once and strips its
 * parameter.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const push = vi.fn();
const replace = vi.fn();
let search = "logged=1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/batteries/br-1",
  useSearchParams: () => new URLSearchParams(search),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

describe("StateOfChargeForm", () => {
  it("renders the band, the reading with its helper, and the jurisdiction note", () => {
    const { container } = render(
      <StateOfChargeForm
        value={null}
        onChange={() => Promise.resolve(actionSucceeded(undefined))}
      />,
    );
    expect(
      screen.getByText("As read. Never a health figure."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The storage limit itself is jurisdiction data; the band is what is recorded.",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-soc-reading]")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    // No band yet: the reading cannot be recorded against nothing.
    expect(container.querySelector("[data-soc-reading]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("sends the reading on blur as a decimal string, and refuses a malformed one", async () => {
    const onChange = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
    const { container } = render(
      <StateOfChargeForm
        value={{
          band: "at_or_below_storage_limit",
          percent: null,
          source: null,
        }}
        onChange={onChange}
      />,
    );
    const reading = container.querySelector(
      "[data-soc-reading]",
    ) as HTMLInputElement;
    fireEvent.change(reading, { target: { value: "27.5" } });
    fireEvent.blur(reading);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        band: "at_or_below_storage_limit",
        percent: "27.5",
        source: null,
      });
    });

    fireEvent.change(reading, { target: { value: "twenty" } });
    fireEvent.blur(reading);
    expect(reading).toHaveAttribute("aria-invalid", "true");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("expresses no health, probability or likelihood wording", () => {
    const { container } = render(
      <StateOfChargeForm
        value={null}
        onChange={() => Promise.resolve(actionSucceeded(undefined))}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|health score/i,
    );
  });
});

describe("SourceDeviceForm", () => {
  it("states that verification is a later phase and sends the fields on blur", async () => {
    const onChange = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
    const { container } = render(
      <SourceDeviceForm value={null} onChange={onChange} />,
    );
    expect(screen.getByText(SOURCE_DEVICE_HELPER)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/verified/i);

    const identifier = container.querySelector(
      "[data-source-device-field='identifier']",
    ) as HTMLInputElement;
    fireEvent.change(identifier, { target: { value: "1HGCM82633A004352" } });
    fireEvent.blur(identifier);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        type: null,
        identifier: "1HGCM82633A004352",
        make: null,
        model: null,
        modelYear: null,
        provenanceSourceType: "unknown_provenance",
      });
    });
  });

  it("refuses a model year that is not four digits, and never sends it", async () => {
    const onChange = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
    const { container } = render(
      <SourceDeviceForm value={null} onChange={onChange} />,
    );
    const year = container.querySelector(
      "[data-source-device-field='modelYear']",
    ) as HTMLInputElement;
    fireEvent.change(year, { target: { value: "19" } });
    fireEvent.blur(year);
    await act(async () => {});
    expect(year).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ResumeNotice", () => {
  const STARTED = "2026-08-21T14:22:00.000Z";

  it("renders nothing with no sessions", () => {
    const { container } = render(<ResumeNotice sessions={[]} />);
    expect(container.querySelector("[data-resume-notice]")).toBeNull();
  });

  it("says where the reader left off, with the start as HH:MM, for one session", () => {
    const { container } = render(
      <ResumeNotice
        sessions={[
          {
            id: "s-1",
            startedAt: STARTED,
            stepLabel: INTAKE_STEP_LABELS.extraction_review,
            href: "/batteries/new?session=s-1&step=2",
          },
        ]}
      />,
    );
    const title = container.querySelector(
      "[data-slot='alert-title']",
    )?.textContent;
    expect(title).toBe(
      `Picking up where you left off — started ${formatWallClockTime(STARTED)}.`,
    );
    expect(title).toMatch(/\d{2}:\d{2}\.$/);
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/batteries/new?session=s-1&step=2",
    );
  });

  it("lists several sessions, each with its step and a Resume link", () => {
    const { container } = render(
      <ResumeNotice
        sessions={[
          {
            id: "s-1",
            startedAt: STARTED,
            stepLabel: INTAKE_STEP_LABELS.capture,
            href: "/a",
          },
          {
            id: "s-2",
            startedAt: STARTED,
            stepLabel: INTAKE_STEP_LABELS.confirm_and_place,
            href: "/b",
          },
        ]}
      />,
    );
    expect(container.querySelector("[data-resume-notice]")).toHaveAttribute(
      "data-resume-count",
      "2",
    );
    expect(screen.getAllByRole("link", { name: "Resume" })).toHaveLength(2);
    expect(container.textContent).toContain(
      INTAKE_STEP_LABELS.confirm_and_place,
    );
  });
});

describe("LoggedToast", () => {
  it("fires Battery logged once, offers Log another into the same container, and strips the parameter", () => {
    search = "logged=1&tab=photos";
    const { rerender } = render(<LoggedToast containerId="c-1" />);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [headline, options] = toastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(headline).toBe("Battery logged");
    expect(options.action.label).toBe("Log another");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith("/batteries/new?container=c-1");
    expect(replace).toHaveBeenCalledWith("/batteries/br-1?tab=photos", {
      scroll: false,
    });

    rerender(<LoggedToast containerId="c-1" />);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("returns to a fresh intake when the record was not placed", () => {
    expect(logAnotherHref(null)).toBe("/batteries/new");
    expect(logAnotherHref("c 1")).toBe("/batteries/new?container=c%201");
  });
});
