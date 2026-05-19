import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarkersFromCaptionSegments,
  MarkerCreationError,
} from "../src/premiere/markers";

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown;
};

const globalWithRequire = globalThis as GlobalWithRequire;
const originalRequireDescriptor = Object.getOwnPropertyDescriptor(globalWithRequire, "require");

afterEach(() => {
  vi.restoreAllMocks();

  if (originalRequireDescriptor) {
    Object.defineProperty(globalWithRequire, "require", originalRequireDescriptor);
  } else {
    delete globalWithRequire.require;
  }
});

describe("createMarkersFromCaptionSegments", () => {
  it("crea un marker por captionSegment con tiempo de timeline", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const sequence = { id: "sequence-1" };
    const addedActions: unknown[] = [];
    const compoundAction = {
      addAction: vi.fn((action: unknown) => {
        addedActions.push(action);
        return true;
      }),
    };
    const project = {
      getActiveSequence: vi.fn(() => sequence),
      executeTransaction: vi.fn((callback: (compoundAction: unknown) => void) => {
        callback(compoundAction);
        return true;
      }),
    };
    const markersObject = {
      createAddMarkerAction: vi.fn((
        name: string,
        markerType: string,
        startTime: unknown,
        duration: unknown,
        comments: string,
      ) => ({
        name,
        markerType,
        startTime,
        duration,
        comments,
      })),
    };
    const premiereModule = {
      Project: {
        getActiveProject: vi.fn(() => project),
      },
      Markers: {
        getMarkers: vi.fn(() => markersObject),
      },
      TickTime: {
        createWithSeconds: vi.fn((seconds: number) => ({ seconds })),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId === "premierepro") {
        return premiereModule;
      }

      throw new Error(`Modulo inesperado: ${moduleId}`);
    });

    const result = await createMarkersFromCaptionSegments({
      sequenceInMs: 187721,
      captionSegments: [
        {
          startMs: 0,
          endMs: 3500,
          text: "Hola Feni te deseo muchas felicidades en",
        },
        {
          startMs: 3500,
          endMs: 5200,
          text: "este dia",
        },
      ],
    });

    expect(result.createdMarkers).toBe(2);
    expect(premiereModule.Markers.getMarkers).toHaveBeenCalledWith(sequence);
    expect(markersObject.createAddMarkerAction).toHaveBeenNthCalledWith(
      1,
      "GLIFO",
      "Comment",
      { seconds: 187.721 },
      { seconds: 3.5 },
      "[GLIFO] Hola Feni te deseo muchas felicidades en",
    );
    expect(markersObject.createAddMarkerAction).toHaveBeenNthCalledWith(
      2,
      "GLIFO",
      "Comment",
      { seconds: 191.221 },
      { seconds: 1.7 },
      "[GLIFO] este dia",
    );
    expect(project.executeTransaction).toHaveBeenCalledOnce();
    expect(compoundAction.addAction).toHaveBeenCalledTimes(2);
    expect(addedActions).toHaveLength(2);
  });

  it("usa sequence.getMarkers si Markers.getMarkers no existe", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const markersObject = {
      createAddMarkerAction: vi.fn((
        name: string,
        markerType: string,
        startTime: unknown,
        duration: unknown,
        comments: string,
      ) => ({
        name,
        markerType,
        startTime,
        duration,
        comments,
      })),
    };
    const sequence = {
      id: "sequence-1",
      getMarkers: vi.fn(() => markersObject),
    };
    const compoundAction = {
      addAction: vi.fn(() => true),
    };
    const project = {
      getActiveSequence: vi.fn(() => sequence),
      executeTransaction: vi.fn((callback: (compoundAction: unknown) => void) => {
        callback(compoundAction);
        return true;
      }),
    };
    const premiereModule = {
      Project: {
        getActiveProject: vi.fn(() => project),
      },
      TickTime: {
        createWithSeconds: vi.fn((seconds: number) => ({ seconds })),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId === "premierepro") {
        return premiereModule;
      }

      throw new Error(`Modulo inesperado: ${moduleId}`);
    });

    await expect(createMarkersFromCaptionSegments({
      sequenceInMs: 187721,
      captionSegments: [
        {
          startMs: 0,
          endMs: 3500,
          text: "Hola Feni",
        },
      ],
    })).resolves.toMatchObject({ createdMarkers: 1 });

    expect(sequence.getMarkers).toHaveBeenCalledOnce();
    expect(markersObject.createAddMarkerAction).toHaveBeenCalledWith(
      "GLIFO",
      "Comment",
      { seconds: 187.721 },
      { seconds: 3.5 },
      "[GLIFO] Hola Feni",
    );
  });

  it("devuelve diagnostico cuando no hay API real de markers", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const sequence = {
      id: "sequence-1",
      getPlayerPosition: vi.fn(() => null),
    };
    const project = {
      getActiveSequence: vi.fn(() => sequence),
      executeTransaction: vi.fn(),
    };
    const premiereModule = {
      Project: {
        getActiveProject: vi.fn(() => project),
      },
      TickTime: {
        createWithSeconds: vi.fn((seconds: number) => ({ seconds })),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId === "premierepro") {
        return premiereModule;
      }

      throw new Error(`Modulo inesperado: ${moduleId}`);
    });

    await expect(createMarkersFromCaptionSegments({
      sequenceInMs: 187721,
      captionSegments: [
        {
          startMs: 0,
          endMs: 3500,
          text: "Hola Feni",
        },
      ],
    })).rejects.toMatchObject({
      name: "MarkerCreationError",
      code: "markers_api_unavailable",
      message: expect.stringContaining("Entry points detectados"),
    });
  });

  it("rechaza si no hay captionSegments", async () => {
    await expect(createMarkersFromCaptionSegments({
      sequenceInMs: 1000,
      captionSegments: [],
    })).rejects.toMatchObject({
      name: "MarkerCreationError",
      code: "caption_segments_missing",
    });
  });

  it("rechaza si falta sequenceInMs", async () => {
    await expect(createMarkersFromCaptionSegments({
      sequenceInMs: null,
      captionSegments: [
        {
          startMs: 0,
          endMs: 1000,
          text: "hola",
        },
      ],
    })).rejects.toBeInstanceOf(MarkerCreationError);
  });
});
