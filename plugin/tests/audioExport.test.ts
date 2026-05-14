import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AudioExportError,
  exportActiveSequenceInOutToWav,
  readPremiereTimeMilliseconds,
  resolveActivePremiereContextForAudioExport,
  validateInOutRange,
} from "../src/premiere/audioExport";

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown;
};

const globalWithRequire = globalThis as GlobalWithRequire;
const originalRequireDescriptor = Object.getOwnPropertyDescriptor(globalWithRequire, "require");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  if (originalRequireDescriptor) {
    Object.defineProperty(globalWithRequire, "require", originalRequireDescriptor);
  } else {
    delete globalWithRequire.require;
  }
});

describe("audio export pure helpers", () => {
  it("acepta un rango In/Out con out mayor que in", () => {
    expect(validateInOutRange({ seconds: 12.5 }, { seconds: 18 })).toMatchObject({
      valid: true,
      sequenceInMs: 12500,
      sequenceOutMs: 18000,
      durationMs: 5500,
      inSeconds: 12.5,
      outSeconds: 18,
      endSeconds: null,
    });
  });

  it("rechaza In/Out ausente o sin duración positiva", () => {
    expect(validateInOutRange(null, { seconds: 18 }).valid).toBe(false);
    expect(validateInOutRange({ seconds: 18 }, { seconds: 18 }).valid).toBe(false);
    expect(validateInOutRange({ seconds: 19 }, { seconds: 18 }).valid).toBe(false);
  });

  it("rechaza el rango completo de secuencia para evitar export accidental", () => {
    expect(validateInOutRange({ seconds: 0 }, { seconds: 60 }, { seconds: 60 })).toMatchObject({
      valid: false,
      sequenceInMs: 0,
      sequenceOutMs: 60000,
      durationMs: 60000,
      sequenceEndMs: 60000,
      inSeconds: 0,
      outSeconds: 60,
      endSeconds: 60,
    });
  });

  it("convierte ticks de Premiere a milisegundos", () => {
    expect(readPremiereTimeMilliseconds({
      ticks: String(221 * 254_016_000_000),
    })).toBe(221000);
  });

  it("convierte value/timebase a milisegundos", () => {
    expect(readPremiereTimeMilliseconds({
      value: 232 * 1000,
      timebase: 1000,
    })).toBe(232000);
  });

  it("convierte frames si hay frameRate disponible", () => {
    expect(readPremiereTimeMilliseconds({
      frames: 330,
      frameRate: 30,
    })).toBe(11000);
  });

  it("convierte strings de reloj a milisegundos", () => {
    expect(readPremiereTimeMilliseconds("00:03:41.000")).toBe(221000);
    expect(readPremiereTimeMilliseconds("03:52.000")).toBe(232000);
    expect(readPremiereTimeMilliseconds({
      frameRate: 25,
      toString: () => "00:03:41:00",
    })).toBe(221000);
  });
});

describe("audio export Premiere entrypoints", () => {
  it("resuelve Project.getActiveProject aunque Project sea una clase/función host", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const sequence = { id: "sequence-1" };
    const project = {
      getActiveSequence: vi.fn(() => sequence),
    };
    const ProjectClass = function Project() {
      return undefined;
    } as unknown as Record<string, unknown>;
    ProjectClass.getActiveProject = vi.fn(() => project);

    const context = await resolveActivePremiereContextForAudioExport({
      Project: ProjectClass,
    });

    expect(context.activeProject).toBe(project);
    expect(context.activeSequence).toBe(sequence);
    expect(context.diagnostics.resolvedProjectPath).toBe("premierepro.Project.getActiveProject");
    expect(context.diagnostics.resolvedSequencePath).toBe("activeProject.getActiveSequence");
  });

  it("usa app.currentProject como fallback compatible", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const sequence = { id: "sequence-app-project" };
    const project = {
      getActiveSequence: vi.fn(() => sequence),
    };

    const context = await resolveActivePremiereContextForAudioExport({
      Project: {
        getActiveProject: vi.fn(() => null),
      },
      app: {
        currentProject: project,
      },
    });

    expect(context.activeProject).toBe(project);
    expect(context.activeSequence).toBe(sequence);
    expect(context.diagnostics.resolvedProjectPath).toBe("premierepro.app.currentProject");
  });

  it("resuelve require('premierepro') como app directo con project.activeSequence", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const sequence = { id: "sequence-direct-app" };
    const project = {
      activeSequence: sequence,
    };

    const context = await resolveActivePremiereContextForAudioExport({
      project,
    });

    expect(context.activeProject).toBe(project);
    expect(context.activeSequence).toBe(sequence);
    expect(context.diagnostics.resolvedProjectPath).toBe("premierepro.project");
    expect(context.diagnostics.resolvedSequencePath).toBe("activeProject.activeSequence");
  });

  it("puede continuar si UXP expone secuencia activa aunque no exponga proyecto activo", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const sequence = { id: "sequence-only" };

    const context = await resolveActivePremiereContextForAudioExport({
      app: {
        activeSequence: sequence,
      },
    });

    expect(context.activeProject).toBeNull();
    expect(context.activeSequence).toBe(sequence);
    expect(context.diagnostics.resolvedSequencePath).toBe("premierepro.app.activeSequence");
  });

  it("incluye diagnóstico de entrypoints cuando no puede resolver proyecto/secuencia", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(resolveActivePremiereContextForAudioExport({
      Transcript: {},
    })).rejects.toMatchObject({
      name: "AudioExportError",
      code: "active_project_missing",
    });

    try {
      await resolveActivePremiereContextForAudioExport({
        Transcript: {},
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AudioExportError);
      expect((error as AudioExportError).message).toContain(
        "Premiere runtime disponible, pero no se encontró API de proyecto activo",
      );
      expect((error as AudioExportError).message).toContain("top-level keys=[Transcript]");
      expect((error as AudioExportError).message).toContain("Project=false");
      expect((error as AudioExportError).message).toContain("app=false");
    }
  });
});

describe("audio export EncoderManager wait flow", () => {
  it("continúa si el WAV aparece aunque no llegue ningún evento de encoder", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const runtime = installAudioExportRuntime({
      exportSequenceReturnValue: true,
      onExportStart: (setSize) => {
        setTimeout(() => setSize(4096), 1000);
      },
    });

    const exportPromise = exportActiveSequenceInOutToWav();

    await vi.advanceTimersByTimeAsync(2500);

    const exported = await exportPromise;
    expect(exported).toMatchObject({
      mediaPath: `/tmp/${runtime.createdFilename}`,
      filename: runtime.createdFilename,
      sequenceInMs: 1000,
      sequenceOutMs: 4000,
      durationMs: 3000,
    });
    expect(typeof exported.cleanup).toBe("function");

    await exported.cleanup?.();

    expect(runtime.exportSequence).toHaveBeenCalledOnce();
    expect(runtime.deleteFile).toHaveBeenCalledOnce();
  });

  it("falla inmediatamente si exportSequence devuelve false", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const runtime = installAudioExportRuntime({
      exportSequenceReturnValue: false,
    });

    await expect(exportActiveSequenceInOutToWav()).rejects.toMatchObject({
      name: "AudioExportError",
      code: "encoder_export_failed",
    });
    expect(runtime.exportSequence).toHaveReturnedWith(false);
  });

  it("devuelve timeout con diagnóstico si no aparece el WAV", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    installAudioExportRuntime({
      exportSequenceReturnValue: true,
    });

    const exportPromise = exportActiveSequenceInOutToWav().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(61_000);
    const error = await exportPromise;

    expect(error).toBeInstanceOf(AudioExportError);
    expect((error as AudioExportError).code).toBe("encoder_render_timeout");
    expect((error as AudioExportError).message).toContain("outputPath=/tmp/");
    expect((error as AudioExportError).message).toContain("presetPath=/plugin/presets/glifo-wav.epr");
    expect((error as AudioExportError).message).toContain("exportSequenceReturnValue=true");
    expect((error as AudioExportError).message).toContain("fileExists=true");
    expect((error as AudioExportError).message).toContain("fileSize=0");
  });

  it("no rechaza si falla el cleanup del WAV temporal", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const runtime = installAudioExportRuntime({
      exportSequenceReturnValue: true,
      deleteThrows: true,
      unlinkThrows: true,
      onExportStart: (setSize) => {
        setTimeout(() => setSize(4096), 1000);
      },
    });

    const exportPromise = exportActiveSequenceInOutToWav();
    await vi.advanceTimersByTimeAsync(2500);
    const exported = await exportPromise;

    await expect(exported.cleanup?.()).resolves.toBeUndefined();
    expect(runtime.deleteFile).toHaveBeenCalledOnce();
  });
});

function installAudioExportRuntime(options: {
  exportSequenceReturnValue: unknown;
  deleteThrows?: boolean;
  unlinkThrows?: boolean;
  onExportStart?: (setSize: (size: number) => void) => void;
}): {
  createdFilename: string;
  exportSequence: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
} {
  let fileSize = 0;
  let createdFilename = "";
  const setSize = (size: number): void => {
    fileSize = size;
  };

  const sequence = {
    getInPoint: vi.fn(() => ({ seconds: 1 })),
    getOutPoint: vi.fn(() => ({ seconds: 4 })),
    getEndTime: vi.fn(() => ({ seconds: 10 })),
  };
  const project = {
    getActiveSequence: vi.fn(() => sequence),
  };
  const exportSequence = vi.fn(() => {
    options.onExportStart?.(setSize);
    return options.exportSequenceReturnValue;
  });
  const encoder = {
    exportSequence,
  };
  const deleteFile = vi.fn(() => {
    if (options.deleteThrows) {
      throw new Error("delete failed");
    }

    fileSize = 0;
    return undefined;
  });
  const unlinkSync = vi.fn(() => {
    if (options.unlinkThrows) {
      throw new Error("unlink failed");
    }

    fileSize = 0;
    return undefined;
  });
  const fileEntry = {
    get nativePath() {
      return `/tmp/${createdFilename}`;
    },
    getMetadata: vi.fn(() => ({ size: fileSize })),
    delete: deleteFile,
  };
  const localFileSystem = {
    getPluginFolder: vi.fn(() => ({
      getEntry: vi.fn(() => ({
        nativePath: "/plugin/presets/glifo-wav.epr",
      })),
    })),
    getTemporaryFolder: vi.fn(() => ({
      createFile: vi.fn((filename: string) => {
        createdFilename = filename;
        return fileEntry;
      }),
    })),
  };

  const premiereModule = {
    Project: {
      getActiveProject: vi.fn(() => project),
    },
    EncoderManager: {
      getManager: vi.fn(() => encoder),
    },
    Constants: {
      ExportType: {
        IMMEDIATELY: "immediately",
      },
      EncoderEvent: {
        RENDER_COMPLETE: "renderComplete",
        RENDER_ERROR: "renderError",
        RENDER_CANCEL: "renderCancel",
      },
    },
  };

  globalWithRequire.require = vi.fn((moduleId: string) => {
    if (moduleId === "premierepro") {
      return premiereModule;
    }

    if (moduleId === "uxp") {
      return {
        storage: {
          localFileSystem,
        },
      };
    }

    if (moduleId === "fs") {
      return {
        lstatSync: vi.fn(() => ({ size: fileSize })),
        unlinkSync,
      };
    }

    throw new Error(`Módulo inesperado: ${moduleId}`);
  });

  return {
    get createdFilename() {
      return createdFilename;
    },
    exportSequence,
    deleteFile,
  };
}
