// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ContainerPicker,
  ZERO_CONTAINERS_COPY,
  type ContainerPickerRow,
} from "@/features/intake/components/container-picker";
import { admitToContainer } from "@/domain/storage/placement";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import { actionSucceeded } from "@/lib/action-result";

/**
 * `ContainerPicker` — `UX_SPEC.md` §3.9, E-2; Rules 4.16, 4.28.
 *
 * E-2's sentence verbatim with zero containers; an inadmissible row rendered
 * `aria-disabled` with `admitToContainer`'s own reason visible, never hidden;
 * a create that calls the action and then selects the new container.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

const REQUIRED = "light_category_sound" as const;

const ROWS: readonly ContainerPickerRow[] = [
  {
    id: "c-1",
    code: "C-0001",
    typeLabel: CONTAINER_TYPE_LABELS.light_category_sound,
    location: "Bay 3",
    fillText: "3 of 12",
    clockTier: null,
    status: "open",
    admission: admitToContainer(
      { status: "open", containerType: "light_category_sound" },
      REQUIRED,
    ),
  },
  {
    id: "c-2",
    code: "C-0002",
    typeLabel: CONTAINER_TYPE_LABELS.light_category_ddr,
    location: "Quarantine",
    fillText: "Empty",
    clockTier: null,
    status: "open",
    admission: admitToContainer(
      { status: "open", containerType: "light_category_ddr" },
      REQUIRED,
    ),
  },
  {
    id: "c-3",
    code: "C-0003",
    typeLabel: CONTAINER_TYPE_LABELS.light_category_sound,
    location: "Bay 4",
    fillText: "12 of 12",
    clockTier: null,
    status: "overdue",
    admission: admitToContainer(
      { status: "overdue", containerType: "light_category_sound" },
      REQUIRED,
    ),
  },
];

function renderPicker(
  overrides: Partial<Parameters<typeof ContainerPicker>[0]> = {},
) {
  const onSelect = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
  const onCreate = vi.fn(() =>
    Promise.resolve(actionSucceeded({ id: "c-new" })),
  );
  const view = render(
    <ContainerPicker
      containers={ROWS}
      selectedId={null}
      onSelect={onSelect}
      canCreate
      whoCanCreate="A Facility Manager or a Platform Admin can create one."
      onCreate={onCreate}
      requiredTypeLabel={CONTAINER_TYPE_LABELS[REQUIRED]}
      {...overrides}
    />,
  );
  return { ...view, onSelect, onCreate };
}

describe("ContainerPicker — E-2, zero containers", () => {
  it("renders the exact sentence and Create a container for a role that can", () => {
    const { container } = renderPicker({ containers: [] });
    expect(
      container.querySelector("[data-container-picker-state='empty']"),
    ).not.toBeNull();
    expect(screen.getByText(ZERO_CONTAINERS_COPY)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a container" }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-who-can-create]")).toBeNull();
  });

  it("names who can create one for a role that cannot", () => {
    const { container } = renderPicker({ containers: [], canCreate: false });
    expect(screen.getByText(ZERO_CONTAINERS_COPY)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create a container" }),
    ).toBeNull();
    expect(container.querySelector("[data-who-can-create]")?.textContent).toBe(
      "A Facility Manager or a Platform Admin can create one.",
    );
  });
});

describe("ContainerPicker — admission", () => {
  it("renders every container, and the inadmissible ones aria-disabled with the reason visible", () => {
    const { container } = renderPicker();
    expect(container.querySelectorAll("[data-container-row]")).toHaveLength(3);

    const ok = container.querySelector("[data-container-row='c-1']");
    expect(ok).toHaveAttribute("data-admission", "ok");
    // cmdk stamps `aria-disabled="false"` on every enabled item of its own.
    expect(ok).not.toHaveAttribute("aria-disabled", "true");

    const mismatch = container.querySelector("[data-container-row='c-2']");
    expect(mismatch).toHaveAttribute(
      "data-admission",
      "segregation_class_mismatch",
    );
    expect(mismatch).toHaveAttribute("aria-disabled", "true");
    expect(
      mismatch?.querySelector("[data-admission-reason]")?.textContent,
    ).toContain(`This record needs ${CONTAINER_TYPE_LABELS[REQUIRED]}`);

    const overdue = container.querySelector("[data-container-row='c-3']");
    expect(overdue).toHaveAttribute("data-admission", "container_overdue");
    expect(
      overdue?.querySelector("[data-admission-reason]")?.textContent,
    ).toContain("overdue");
  });

  it("selects an admissible row through the action and refuses an inadmissible one", async () => {
    const { container, onSelect } = renderPicker();
    fireEvent.click(
      container.querySelector("[data-container-row='c-2']") as Element,
    );
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(
      container.querySelector("[data-container-row='c-1']") as Element,
    );
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("c-1");
    });
  });

  it("marks the server's selection and offers to clear it", async () => {
    const { container, onSelect } = renderPicker({ selectedId: "c-1" });
    expect(
      container.querySelector("[data-container-row='c-1']"),
    ).toHaveAttribute("data-selected-row", "true");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });
});

describe("ContainerPicker — create", () => {
  it("opens the dialog, calls onCreate with the location, then selects the new container", async () => {
    const { onCreate, onSelect } = renderPicker({ containers: [] });
    fireEvent.click(screen.getByRole("button", { name: "Create a container" }));
    const input = await screen.findByLabelText("Storage location");
    fireEvent.change(input, { target: { value: "Bay 7, rack A" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        storageLocation: "Bay 7, rack A",
      });
    });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("c-new");
    });
  });
});

describe("ContainerPicker — Rule 1.25", () => {
  it("expresses no probability or likelihood anywhere", () => {
    const { container } = renderPicker();
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|detected chemistry/i,
    );
  });
});
