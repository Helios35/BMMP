// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  ACCEPTED_IMAGE_TYPES,
  PhotoCaptureInput,
} from "@/components/capture/photo-capture-input";

/**
 * `PhotoCaptureInput` — `UX_SPEC.md` §2.2.
 *
 * The camera is a file input: `capture="environment"` and the three accepted
 * encodings, behind a 72px shutter, a 44px button, or a drop zone. The control
 * emits the file and a preview URL and uploads nothing.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const createObjectURL = vi.fn(() => "blob:preview-1");

beforeEach(() => {
  createObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
});

function fileFixture(name = "label-clean.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

describe("PhotoCaptureInput — the input", () => {
  it("renders a file input with capture and the accepted encodings", () => {
    const { container } = render(
      <PhotoCaptureInput
        photoType="label"
        capture
        variant="shutter"
        label="Take a label photo"
        onFile={() => {}}
      />,
    );
    const input = container.querySelector("input[type='file']");
    expect(input).toHaveAttribute("capture", "environment");
    expect(input).toHaveAttribute("accept", ACCEPTED_IMAGE_TYPES);
    expect(input).toHaveAttribute("data-photo-type", "label");
  });

  it("omits capture for the photo library", () => {
    const { container } = render(
      <PhotoCaptureInput
        photoType="whole_pack"
        variant="button"
        label="Use photo library"
        onFile={() => {}}
      />,
    );
    expect(container.querySelector("input[type='file']")).not.toHaveAttribute(
      "capture",
    );
  });

  it("emits the file with a preview URL, and never uploads", () => {
    const onFile = vi.fn();
    const { container } = render(
      <PhotoCaptureInput
        photoType="label"
        capture
        variant="shutter"
        label="Take a label photo"
        onFile={onFile}
      />,
    );
    const input = container.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const file = fileFixture();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file, "blob:preview-1");
    expect(createObjectURL).toHaveBeenCalledWith(file);
  });
});

describe("PhotoCaptureInput — the three shapes", () => {
  it("renders the shutter as a 72px round control", () => {
    render(
      <PhotoCaptureInput
        photoType="label"
        capture
        variant="shutter"
        label="Take a label photo"
        onFile={() => {}}
      />,
    );
    const shutter = screen.getByRole("button", { name: "Take a label photo" });
    expect(shutter).toHaveAttribute("data-capture-control", "shutter");
    expect(shutter.className).toContain("size-18");
    expect(shutter.className).toContain("rounded-full");
  });

  it("renders the button at the 44px floor", () => {
    render(
      <PhotoCaptureInput
        photoType="damage"
        variant="button"
        label="Add a damage photo"
        onFile={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add a damage photo" }).className,
    ).toContain("min-h-11");
  });

  it("renders the drop zone and accepts a dropped file", () => {
    const onFile = vi.fn();
    const { container } = render(
      <PhotoCaptureInput
        photoType="label"
        variant="dropzone"
        label="Choose a file"
        onFile={onFile}
      />,
    );
    const zone = container.querySelector(
      "[data-capture-variant='dropzone']",
    ) as HTMLElement;
    expect(zone).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();

    const file = fileFixture();
    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute("data-drag-over", "true");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file, "blob:preview-1");
    expect(zone).toHaveAttribute("data-drag-over", "false");
  });
});

describe("PhotoCaptureInput — disabled with a reason", () => {
  it("is aria-disabled, inert, and explains itself", () => {
    const onFile = vi.fn();
    const { container } = render(
      <PhotoCaptureInput
        photoType="damage"
        variant="button"
        label="Add a damage photo"
        disabled
        disabledReason="This record has no intake session to attach a photo to."
        onFile={onFile}
      />,
    );
    const button = screen.getByRole("button", { name: "Add a damage photo" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("disabled");
    expect(container.querySelector("[data-gated-reason]")?.textContent).toBe(
      "This record has no intake session to attach a photo to.",
    );
    const input = container.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFixture()] } });
    expect(onFile).not.toHaveBeenCalled();
  });
});
