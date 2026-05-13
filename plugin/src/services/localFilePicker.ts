export interface PickedMediaFile {
  name: string;
  nativePath: string;
}

type UnknownRecord = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => unknown;

const SUPPORTED_MEDIA_TYPES = [
  "wav",
  "mp4",
  "m4a",
  "mp3",
  "mpeg",
  "mpga",
  "webm",
  "flac",
  "ogg",
];

export async function pickExportedMediaFile(): Promise<PickedMediaFile | null> {
  const requireFn = (globalThis as UnknownRecord).require;
  if (typeof requireFn !== "function") {
    throw new Error("UXP require no está disponible para abrir el selector de archivos");
  }

  const uxpModule = asRecord((requireFn as UnknownFn)("uxp"));
  const storage = asRecord(uxpModule?.storage);
  const localFileSystem = asRecord(storage?.localFileSystem);
  const getFileForOpening = asFunction(localFileSystem?.getFileForOpening);

  if (!getFileForOpening || !localFileSystem) {
    throw new Error("UXP localFileSystem.getFileForOpening no está disponible");
  }

  const selected = await Promise.resolve(
    getFileForOpening.call(localFileSystem, {
      types: SUPPORTED_MEDIA_TYPES,
      allowMultiple: false,
    }),
  );

  const file = Array.isArray(selected) ? selected[0] : selected;
  const fileObject = asRecord(file);
  if (!fileObject) {
    return null;
  }

  const nativePath = await Promise.resolve(fileObject.nativePath);
  if (typeof nativePath !== "string" || nativePath.trim().length === 0) {
    throw new Error("El archivo seleccionado no expone nativePath");
  }

  const name =
    typeof fileObject.name === "string" && fileObject.name.trim().length > 0
      ? fileObject.name
      : nativePath.split(/[\\/]/).pop() ?? "archivo seleccionado";

  return {
    name,
    nativePath,
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value === "object" && value !== null) {
    return value as UnknownRecord;
  }

  return null;
}

function asFunction(value: unknown): UnknownFn | null {
  if (typeof value === "function") {
    return value as UnknownFn;
  }

  return null;
}
