// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { captureQueue } from "@/components/offline/capture-queue";
import {
  PhotoCaptureStep,
  isLikelyTooSmall,
  parseProblem,
  parseUploadedPhoto,
  type ImageSize,
  type PhotoCaptureStepProps,
  type UploadPhotoResult,
  type UploadTransport,
} from "@/features/intake/components/photo-capture-step";
import { actionSucceeded } from "@/lib/action-result";

/**
 * `PhotoCaptureStep` — `UX_SPEC.md` §2.2, E-3, E-10.
 *
 * The primary is disabled until a label photo is sent; a failed upload takes
 * the critical state with **Retry**; a small image raises the legibility
 * alert before anything is sent; offline, a capture queues. The transport and
 * the image sizing are injected, so no network and no decoder is involved.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const LARGE: ImageSize = { width: 1600, height: 1200 };
const SMALL: ImageSize = { width: 320, height: 240 };

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  captureQueue.reset();
});

afterEach(() => {
  captureQueue.reset();
  vi.useRealTimers();
});

const SENT: UploadPhotoResult = {
  ok: true,
  photo: {
    intakePhotoId: "photo-1",
    storagePath: "org/o/s/hash.png",
    width: 1600,
    height: 1200,
    contentHash: "hash",
    fileName: "label-clean.png",
  },
};

function transportReturning(results: readonly UploadPhotoResult[]): {
  readonly transport: UploadTransport;
  readonly calls: number[];
} {
  const calls: number[] = [];
  const transport: UploadTransport = (_request, onProgress) => {
    calls.push(calls.length + 1);
    onProgress(50);
    const result = results[Math.min(calls.length - 1, results.length - 1)];
    if (result === undefined) throw new Error("no result scripted");
    return Promise.resolve(result);
  };
  return { transport, calls };
}

function renderStep(overrides: Partial<PhotoCaptureStepProps> = {}): ReturnType<
  typeof render
> & {
  readonly onContinue: ReturnType<typeof vi.fn>;
} {
  const onContinue = vi.fn(() => Promise.resolve());
  const view = render(
    <PhotoCaptureStep
      sessionId="session-1"
      containerContext={null}
      startSession={() =>
        Promise.resolve(
          actionSucceeded({ sessionId: "session-1", batteryRecordId: "br-1" }),
        )
      }
      uploadUrl="/api/intake/photos"
      onLabelPhotoReady={() => {}}
      existingPhotos={[]}
      primary={{ label: "Read label", onContinue }}
      readImageSize={() => Promise.resolve(LARGE)}
      transport={transportReturning([SENT]).transport}
      {...overrides}
    />,
  );
  return { ...view, onContinue };
}

function captureFile(container: HTMLElement, name = "label-clean.png"): void {
  const input = container.querySelector(
    "[data-capture-variant='shutter'] input[type='file']",
  ) as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], name, {
    type: "image/png",
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("PhotoCaptureStep — the primary", () => {
  it("is disabled with the reason until a label photo is sent, then enables", async () => {
    const onLabelPhotoReady = vi.fn();
    const { container } = renderStep({ onLabelPhotoReady });

    const primary = screen.getByRole("button", { name: "Read label" });
    expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(
      container.querySelector("[data-outstanding-item='required_value']")
        ?.textContent,
    ).toContain("label photo");
    expect(container.querySelector("[data-capture-empty]")).not.toBeNull();

    captureFile(container);
    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='sent']"),
      ).not.toBeNull();
    });
    // The file name travels with the id: the read is keyed on it (§7.3).
    expect(onLabelPhotoReady).toHaveBeenCalledWith(
      "photo-1",
      "label-clean.png",
    );
    expect(
      container.querySelector("[data-photo-capture-step]"),
    ).toHaveAttribute("data-label-sent", "true");
    expect(
      screen.getByRole("button", { name: "Read label" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("starts the session on the first capture when none was given", async () => {
    const startSession = vi.fn(() =>
      Promise.resolve(
        actionSucceeded({ sessionId: "session-new", batteryRecordId: "br-2" }),
      ),
    );
    const requests: string[] = [];
    const transport: UploadTransport = (request) => {
      requests.push(request.intakeSessionId);
      return Promise.resolve(SENT);
    };
    const { container } = renderStep({
      sessionId: null,
      startSession,
      transport,
    });
    captureFile(container);
    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='sent']"),
      ).not.toBeNull();
    });
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(requests).toEqual(["session-new"]);
    expect(
      container.querySelector("[data-photo-capture-step]"),
    ).toHaveAttribute("data-session-id", "session-new");
  });
});

describe("PhotoCaptureStep — E-3, a photo fails to upload", () => {
  it("takes the critical state with Retry, and lists the photo with Retry and Remove", async () => {
    const refused: UploadPhotoResult = {
      ok: false,
      message: "The image could not be read as image/png.",
      retryable: false,
    };
    const { transport, calls } = transportReturning([refused, SENT]);
    const { container } = renderStep({ transport });
    captureFile(container);

    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='failed']"),
      ).not.toBeNull();
    });
    // A 4xx is not retried: it will not fix itself.
    expect(calls).toHaveLength(1);
    const thumbnail = container.querySelector("[data-upload-state='failed']");
    expect(thumbnail?.querySelector("[data-thumbnail-retry]")).not.toBeNull();
    expect(container.querySelector("[data-upload-failures]")).not.toBeNull();
    expect(
      screen.getByText("The image could not be read as image/png."),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-failed-remove]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Read label" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(
      thumbnail?.querySelector("[data-thumbnail-retry]") as Element,
    );
    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='sent']"),
      ).not.toBeNull();
    });
    expect(calls).toHaveLength(2);
  });

  it("retries a retryable failure twice, each attempt visible, before failing", async () => {
    vi.useFakeTimers();
    const dropped: UploadPhotoResult = {
      ok: false,
      message: "The photo could not be sent. Check the connection and retry.",
      retryable: true,
    };
    const { transport, calls } = transportReturning([dropped]);
    const { container } = renderStep({ transport });
    captureFile(container);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toHaveLength(1);
    expect(container.querySelector("[data-upload-attempt='2']")).not.toBeNull();
    expect(
      container.querySelector("[data-thumbnail-state-text]")?.textContent,
    ).toContain("attempt 2 of 3");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(calls).toHaveLength(2);
    expect(container.querySelector("[data-upload-attempt='3']")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(calls).toHaveLength(3);
    expect(
      container.querySelector("[data-upload-state='failed']"),
    ).not.toBeNull();
    expect(captureQueue.snapshot().failedCount).toBe(1);
  });
});

describe("PhotoCaptureStep — legibility", () => {
  it("raises the attention alert on a small image before sending, and sends on Use anyway", async () => {
    const { transport, calls } = transportReturning([SENT]);
    const { container } = renderStep({
      transport,
      readImageSize: () => Promise.resolve(SMALL),
    });
    captureFile(container);

    await waitFor(() => {
      expect(container.querySelector("[data-legibility-alert]")).not.toBeNull();
    });
    expect(
      screen.getByText(
        "This may be hard to read — the image is small. Re-take?",
      ),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(
      container.querySelector("[data-upload-state='held']"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use anyway" }));
    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='sent']"),
      ).not.toBeNull();
    });
    expect(calls).toHaveLength(1);
  });

  it("removes the photo on Re-take, sending nothing", async () => {
    const { transport, calls } = transportReturning([SENT]);
    const { container } = renderStep({
      transport,
      readImageSize: () => Promise.resolve(SMALL),
    });
    captureFile(container);
    await waitFor(() => {
      expect(container.querySelector("[data-legibility-alert]")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Re-take" }));
    expect(container.querySelector("[data-thumbnail]")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("treats an undecodable preview as not small — never a silent rejection", () => {
    expect(isLikelyTooSmall(null)).toBe(false);
    expect(isLikelyTooSmall(SMALL)).toBe(true);
    expect(isLikelyTooSmall(LARGE)).toBe(false);
  });
});

describe("PhotoCaptureStep — offline", () => {
  it("queues the capture and sends it on reconnect", async () => {
    online = false;
    const { transport, calls } = transportReturning([SENT]);
    const { container } = renderStep({ transport });
    captureFile(container);

    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='queued']"),
      ).not.toBeNull();
    });
    expect(calls).toHaveLength(0);
    expect(captureQueue.snapshot().queuedCount).toBe(1);
    expect(
      container.querySelector("[data-thumbnail-state-text]")?.textContent,
    ).toContain("Queued");
    expect(
      container.querySelector("[data-outstanding-item='offline']"),
    ).not.toBeNull();

    online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-upload-state='sent']"),
      ).not.toBeNull();
    });
    expect(calls).toHaveLength(1);
    expect(captureQueue.snapshot().sentCount).toBe(1);
  });
});

describe("PhotoCaptureStep — context and existing photos", () => {
  it("shows the container badge and counts a stored label photo as sent", () => {
    const { container } = renderStep({
      containerContext: { id: "c-1", code: "C-0001" },
      existingPhotos: [
        {
          id: "p-existing",
          photoType: "label",
          width: 1600,
          height: 1200,
          state: "sent",
        },
      ],
    });
    expect(
      container.querySelector("[data-container-context='c-1']")?.textContent,
    ).toContain("C-0001");
    expect(
      screen.getByRole("button", { name: "Read label" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      container.querySelector("[data-thumbnail='p-existing']"),
    ).toHaveAttribute("data-upload-state", "sent");
  });
});

describe("PhotoCaptureStep — parsing the route's replies", () => {
  it("reads a 201 body and refuses a malformed one", () => {
    expect(
      parseUploadedPhoto({
        intakePhotoId: "p",
        storagePath: "org/o/s/h.png",
        width: 1,
        height: 2,
        contentHash: "h",
        fileName: "label-low.png",
      })?.fileName,
    ).toBe("label-low.png");
    // The name is optional on the wire; absent reads as null, never as "".
    expect(
      parseUploadedPhoto({
        intakePhotoId: "p",
        storagePath: "org/o/s/h.png",
        width: 1,
        height: 2,
        contentHash: "h",
      })?.fileName,
    ).toBeNull();
    expect(parseUploadedPhoto({ intakePhotoId: "p" })).toBeNull();
    expect(parseUploadedPhoto("nope")).toBeNull();
  });

  it("reads a problem+json body, preferring detail over title", () => {
    expect(
      parseProblem({
        title: "Bad request",
        detail: "The file is not an image.",
        code: "VALIDATION",
        correlationId: "c-1",
      }),
    ).toEqual({
      message: "The file is not an image.",
      code: "VALIDATION",
      correlationId: "c-1",
    });
    expect(parseProblem({ title: "Bad request" }).message).toBe("Bad request");
    expect(parseProblem(null).message).toBeUndefined();
  });
});

describe("PhotoCaptureStep — Rule 1.25 and chemistry", () => {
  it("expresses no probability, likelihood or detected chemistry anywhere", async () => {
    const { container } = renderStep({
      readImageSize: () => Promise.resolve(SMALL),
    });
    captureFile(container);
    await waitFor(() => {
      expect(container.querySelector("[data-legibility-alert]")).not.toBeNull();
    });
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|detected chemistry/i,
    );
  });
});
