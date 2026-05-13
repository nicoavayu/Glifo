import { afterEach, describe, expect, it, vi } from "vitest";
import { getPremiereTranscriptCapabilities } from "../src/premiere/runtimeDiagnostics";

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

describe("getPremiereTranscriptCapabilities", () => {
  it("reporta runtime no soportado cuando require no existe", async () => {
    delete globalWithRequire.require;

    const capabilities = await getPremiereTranscriptCapabilities();

    expect(capabilities.hasRequirePremierePro).toBe(false);
    expect(capabilities.premiereModuleLoaded).toBe(false);
    expect(capabilities.canImportTranscript).toBe(false);
    expect(capabilities.missingRequirements.length).toBeGreaterThan(0);
  });

  it("detecta capacidades cuando premierepro expone API de transcript", async () => {
    const mockProject = {
      getActiveSequence: vi.fn(async () => ({
        getSelection: vi.fn(async () => ({
          getTrackItems: vi.fn(async () => []),
        })),
      })),
      executeTransaction: vi.fn(() => true),
    };

    const mockPremiereModule = {
      Transcript: {
        exportToJSON: vi.fn(async () => "{}"),
        importFromJSON: vi.fn(() => ({ kind: "TextSegments" })),
        createImportTextSegmentsAction: vi.fn(() => ({ kind: "Action" })),
      },
      ClipProjectItem: {
        cast: vi.fn((value: unknown) => value),
      },
      Project: {
        getActiveProject: vi.fn(async () => mockProject),
      },
      ProjectUtils: {
        getSelection: vi.fn(async () => ({ getItems: vi.fn(async () => []) })),
      },
    };

    globalWithRequire.require = vi.fn((moduleId: string) => {
      if (moduleId !== "premierepro") {
        throw new Error(`Módulo no soportado en test: ${moduleId}`);
      }

      return mockPremiereModule;
    });

    const capabilities = await getPremiereTranscriptCapabilities();

    expect(capabilities.hasRequirePremierePro).toBe(true);
    expect(capabilities.premiereModuleLoaded).toBe(true);
    expect(capabilities.hasTranscriptClass).toBe(true);
    expect(capabilities.hasClipProjectItem).toBe(true);
    expect(capabilities.canReadSelection).toBe(true);
    expect(capabilities.canExportTranscript).toBe(true);
    expect(capabilities.canImportTranscript).toBe(true);
    expect(capabilities.canCreateImportTextSegmentsAction).toBe(true);
    expect(capabilities.canExecuteTransaction).toBe(true);
  });
});
