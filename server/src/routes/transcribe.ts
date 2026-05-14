import { Router } from "express";
import { resolveAudioSource } from "../services/audioSourceResolver";
import { createSttProvider } from "../services/sttProvider";

interface TranscribeRequestBody {
  clipId?: string;
  clipName?: string;
  projectItemId?: string | null;
  mediaPath?: string | null;
  durationMs?: number | null;
}

const transcribeRouter = Router();

/**
 * Endpoint file-first de transcripción.
 * Recibe un mediaPath local legible por el backend y devuelve texto real o error trazable.
 */
transcribeRouter.post("/transcribe", async (req, res) => {
  const body = (req.body ?? {}) as TranscribeRequestBody;

  const clipId = body.clipId ?? null;
  const clipName = body.clipName ?? null;
  const projectItemId = body.projectItemId ?? null;
  const mediaPath = body.mediaPath ?? null;
  const durationMs = body.durationMs ?? null;

  console.info("[PluginSubs][Server] payload received", {
    clipId,
    clipName,
    projectItemId,
    mediaPath,
    durationMs,
  });

  console.info("[PluginSubs][Server] stt request start", {
    clipId,
    clipName,
    projectItemId,
    hasMediaPath: Boolean(mediaPath),
    mediaPath,
    durationMs,
  });

  console.info("[PluginSubs][Server] media path resolution start", {
    clipId,
    mediaPath,
  });

  const audioSource = await resolveAudioSource({ mediaPath });
  if (audioSource.status === "unavailable") {
    console.info("[PluginSubs][Server] media path unavailable", {
      clipId,
      code: audioSource.code,
      message: audioSource.message,
      details: audioSource.details,
    });

    res.status(statusForAudioSourceError(audioSource.code)).json({
      transcriptSource: "file",
      provider: null,
      model: null,
      error: {
        code: audioSource.code,
        message: audioSource.message,
        details: audioSource.details,
      },
    });
    return;
  }

  console.info("[PluginSubs][Server] media path resolved", {
    clipId,
    method: audioSource.method,
    audioPath: audioSource.audioPath,
    filename: audioSource.filename,
  });

  const sttProvider = createSttProvider();
  console.info("[PluginSubs][Server] stt provider selected", {
    provider: sttProvider.name,
    model: sttProvider.model,
  });

  try {
    const sttResult = await sttProvider.transcribe({
      mediaPath: audioSource.audioPath,
      filename: audioSource.filename,
      durationMs,
    });

    if (sttResult.status === "error") {
      console.error("[PluginSubs][Server] stt request error", {
        clipId,
        provider: sttResult.provider,
        model: sttResult.model,
        code: sttResult.code,
        message: sttResult.message,
      });

      res.status(statusForSttError(sttResult.code)).json({
        transcriptSource: "file",
        provider: sttResult.provider,
        model: sttResult.model,
        error: {
          code: sttResult.code,
          message: sttResult.message,
          details: sttResult.details ?? {},
        },
      });
      return;
    }

    console.info("[PluginSubs][Server] stt request ok", {
      clipId,
      provider: sttResult.provider,
      model: sttResult.model,
      fullTextLength: sttResult.fullText.length,
      segments: sttResult.segments.length,
      words: sttResult.words.length,
      captionSegments: sttResult.captionSegments.length,
    });

    res.json({
      transcriptSource: "file",
      provider: sttResult.provider,
      model: sttResult.model,
      fullText: sttResult.fullText,
      segments: sttResult.segments,
      words: sttResult.words,
      captionSegments: sttResult.captionSegments,
      metadata: {
        mediaPath: audioSource.audioPath,
        filename: audioSource.filename,
        durationMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido de STT";
    console.error("[PluginSubs][Server] stt request error", {
      clipId,
      message,
    });

    res.status(500).json({
      transcriptSource: "file",
      provider: sttProvider.name,
      model: sttProvider.model,
      error: {
        code: "stt_provider_failed",
        message,
      },
    });
  }
});

function statusForAudioSourceError(code: string): number {
  switch (code) {
    case "media_path_missing":
      return 400;
    case "media_path_not_found":
      return 404;
    case "unsupported_media_type":
      return 415;
    default:
      return 400;
  }
}

function statusForSttError(code: string): number {
  switch (code) {
    case "stt_provider_unconfigured":
      return 503;
    case "transcript_empty":
      return 422;
    case "stt_provider_failed":
      return 502;
    default:
      return 500;
  }
}

export { transcribeRouter };
