import { Router } from "express";
import {
  claimNextMogrtBridgeJob,
  completeMogrtBridgeJob,
  createMogrtBridgeJob,
  getMogrtBridgeJob,
} from "../services/mogrtJobQueue";

const mogrtBridgeRouter = Router();

mogrtBridgeRouter.post("/bridge/mogrt-jobs", (req, res) => {
  const result = createMogrtBridgeJob(req.body);
  if (!result.ok || !result.job) {
    res.status(statusForCreateJobError(result.error?.code)).json({
      error: result.error ?? {
        code: "job_create_failed",
        message: "No se pudo crear el job MOGRT.",
      },
    });
    return;
  }

  console.info("[PluginSubs][MOGRT Bridge] job queued", {
    id: result.job.id,
    mogrtPath: result.job.mogrtPath,
    sequenceInMs: result.job.sequenceInMs,
    captionStartMs: result.job.captionSegment.startMs,
    captionEndMs: result.job.captionSegment.endMs,
  });

  res.status(202).json({
    job: result.job,
  });
});

mogrtBridgeRouter.get("/bridge/mogrt-jobs/next", (_req, res) => {
  const job = claimNextMogrtBridgeJob();
  if (!job) {
    res.status(204).send();
    return;
  }

  console.info("[PluginSubs][MOGRT Bridge] job claimed", {
    id: job.id,
  });

  res.json({
    job,
  });
});

mogrtBridgeRouter.get("/bridge/mogrt-jobs/:id/result", (req, res) => {
  const job = getMogrtBridgeJob(req.params.id);
  if (!job) {
    res.status(404).json({
      error: {
        code: "job_not_found",
        message: "No existe el job MOGRT solicitado.",
      },
    });
    return;
  }

  if (job.result === null) {
    res.status(202).json({
      id: job.id,
      status: job.status,
      claimedAt: job.claimedAt,
      completedAt: job.completedAt,
    });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
  });
});

mogrtBridgeRouter.post("/bridge/mogrt-jobs/:id/result", (req, res) => {
  const job = completeMogrtBridgeJob(req.params.id, req.body);
  if (!job) {
    res.status(404).json({
      error: {
        code: "job_not_found",
        message: "No existe el job MOGRT solicitado.",
      },
    });
    return;
  }

  console.info("[PluginSubs][MOGRT Bridge] job result stored", {
    id: job.id,
    status: job.status,
  });

  res.json({
    id: job.id,
    status: job.status,
  });
});

function statusForCreateJobError(code: string | undefined): number {
  switch (code) {
    case "job_id_conflict":
      return 409;
    default:
      return 400;
  }
}

export { mogrtBridgeRouter };
