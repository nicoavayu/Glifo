import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AudioSourceResolveInput {
  mediaPath: string | null;
}

export interface ResolvedAudioSource {
  status: "resolved";
  audioPath: string;
  filename: string;
  extension: string;
  method: string;
}

export interface UnresolvedAudioSource {
  status: "unavailable";
  code:
    | "media_path_missing"
    | "media_path_not_found"
    | "unsupported_media_type";
  message: string;
  details: {
    providedMediaPath: string | null;
    normalizedPath: string | null;
    supportedExtensions?: string[];
  };
}

export type AudioSourceResolution = ResolvedAudioSource | UnresolvedAudioSource;

const SUPPORTED_EXTENSIONS = new Set([
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".ogg",
  ".wav",
  ".webm",
]);

/**
 * Intenta resolver un archivo de audio/video legible a partir de `mediaPath`.
 */
export async function resolveAudioSource(
  input: AudioSourceResolveInput,
): Promise<AudioSourceResolution> {
  const normalizedPath = normalizeMediaPath(input.mediaPath);

  if (!input.mediaPath || !normalizedPath) {
    return {
      status: "unavailable",
      code: "media_path_missing",
      message: "No se recibió mediaPath utilizable desde el plugin",
      details: {
        providedMediaPath: input.mediaPath,
        normalizedPath,
      },
    };
  }

  const absolutePath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.resolve(normalizedPath);
  const extension = path.extname(absolutePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      status: "unavailable",
      code: "unsupported_media_type",
      message: "El tipo de archivo no está soportado para transcripción",
      details: {
        providedMediaPath: input.mediaPath,
        normalizedPath: absolutePath,
        supportedExtensions: Array.from(SUPPORTED_EXTENSIONS).sort(),
      },
    };
  }

  try {
    await access(absolutePath, fsConstants.R_OK);
  } catch {
    return {
      status: "unavailable",
      code: "media_path_not_found",
      message: "El mediaPath no existe o no es legible por el backend",
      details: {
        providedMediaPath: input.mediaPath,
        normalizedPath: absolutePath,
      },
    };
  }

  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      return {
        status: "unavailable",
        code: "media_path_not_found",
        message: "El mediaPath resuelto no apunta a un archivo legible",
        details: {
          providedMediaPath: input.mediaPath,
          normalizedPath: absolutePath,
        },
      };
    }
  } catch {
    return {
      status: "unavailable",
      code: "media_path_not_found",
      message: "No se pudo validar el mediaPath resuelto",
      details: {
        providedMediaPath: input.mediaPath,
        normalizedPath: absolutePath,
      },
    };
  }

  return {
    status: "resolved",
    audioPath: absolutePath,
    filename: path.basename(absolutePath),
    extension,
    method: "mediaPath",
  };
}

function normalizeMediaPath(mediaPath: string | null): string | null {
  if (!mediaPath) {
    return null;
  }

  const trimmed = mediaPath.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("file://")) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }

  return trimmed;
}
