import { afterEach, describe, expect, it, vi } from "vitest";
import {
  debugPremiereEntrypoints,
  getSelectedClipInfo,
  getSelectedRuntimeContext,
} from "../src/premiere/selection";

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

describe("selection runtime entrypoints", () => {
  it("resuelve selección usando Project.getActiveProject + project.getActiveSequence + sequence.getSelection", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);

    const projectItem = {
      id: "project-item-1",
      name: "Clip de Timeline",
      getMediaFilePath: vi.fn(() => "/media/demo.wav"),
    };

    const trackItem = {
      getProjectItem: vi.fn(() => projectItem),
      getDuration: vi.fn(() => ({ seconds: 2.5 })),
    };

    const sequence = {
      getSelection: vi.fn(() => ({
        getTrackItems: vi.fn(() => [trackItem]),
      })),
    };

    const project = {
      getActiveSequence: vi.fn(() => sequence),
    };

    const mockPremiereModule = {
      Project: {
        getActiveProject: vi.fn(() => project),
      },
      ClipProjectItem: {
        cast: vi.fn((value: unknown) => value),
      },
      ProjectUtils: {
        getSelection: vi.fn(() => ({
          getItems: vi.fn(() => []),
        })),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId !== "premierepro") {
        throw new Error(`Módulo inesperado: ${moduleId}`);
      }

      return mockPremiereModule;
    });

    const selected = await getSelectedClipInfo();
    const context = await getSelectedRuntimeContext();

    expect(selected).not.toBeNull();
    expect(selected?.clipName).toBe("Clip de Timeline");
    expect(selected?.clipId).toBe("project-item-1");
    expect(selected?.durationMs).toBe(2500);
    expect(context?.selectionSource).toBe("timeline");
  });

  it("usa fallback Project.getProject cuando getActiveProject no devuelve proyecto", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);

    const projectItem = {
      id: "project-item-2",
      name: "Clip fallback",
      getMediaFilePath: vi.fn(() => "/media/fallback.wav"),
    };

    const sequence = {
      getSelection: vi.fn(() => ({
        getItems: vi.fn(() => [
          {
            getProjectItem: vi.fn(() => projectItem),
            getDuration: vi.fn(() => ({ seconds: 3 })),
          },
        ]),
      })),
    };

    const project = {
      getActiveSequence: vi.fn(() => sequence),
    };

    const mockPremiereModule = {
      Project: {
        getActiveProject: vi.fn(() => null),
        getProject: vi.fn(() => project),
      },
      ClipProjectItem: {
        cast: vi.fn((value: unknown) => value),
      },
      ProjectUtils: {
        getSelection: vi.fn(() => null),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId !== "premierepro") {
        throw new Error(`Módulo inesperado: ${moduleId}`);
      }

      return mockPremiereModule;
    });

    const selected = await getSelectedClipInfo();

    expect(selected).not.toBeNull();
    expect(selected?.clipId).toBe("project-item-2");
    expect(selected?.clipName).toBe("Clip fallback");
    expect(selected?.durationMs).toBe(3000);
  });

  it("reporta failure reason cuando no encuentra entrypoints de proyecto/secuencia/selección", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);

    const mockPremiereModule = {
      Transcript: {},
      ClipProjectItem: {},
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId !== "premierepro") {
        throw new Error(`Módulo inesperado: ${moduleId}`);
      }

      return mockPremiereModule;
    });

    const diagnostics = await debugPremiereEntrypoints();

    expect(diagnostics.moduleAccess.premiereModuleLoaded).toBe(true);
    expect(diagnostics.promisingCandidate).toBeNull();
    expect(diagnostics.failureReason).toBe("no_entrypoint_for_project_sequence_selection");
  });
});
