(function () {
  var JOBS_ENDPOINT = "http://localhost:3001/bridge/mogrt-jobs";
  var POLL_MS = 1500;
  var csInterface = new CSInterface();
  var polling = true;
  var busy = false;
  var timer = null;
  var logLines = [];

  var statusEl = document.getElementById("status");
  var logEl = document.getElementById("log");
  var startButton = document.getElementById("startButton");
  var stopButton = document.getElementById("stopButton");

  startButton.addEventListener("click", function () {
    polling = true;
    setStatus("Estado: polling activo");
    log("polling:start");
    scheduleNextPoll(0);
  });

  stopButton.addEventListener("click", function () {
    polling = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    setStatus("Estado: polling detenido");
    log("polling:stop");
  });

  log("bridge:loaded");
  setStatus("Estado: polling activo");
  scheduleNextPoll(250);

  function scheduleNextPoll(delayMs) {
    if (!polling) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(pollNextJob, delayMs);
  }

  async function pollNextJob() {
    if (!polling) {
      return;
    }

    if (busy) {
      scheduleNextPoll(POLL_MS);
      return;
    }

    try {
      var response = await fetch(JOBS_ENDPOINT + "/next");
      if (response.status === 204) {
        setStatus("Estado: esperando jobs...");
        scheduleNextPoll(POLL_MS);
        return;
      }

      if (!response.ok) {
        log("poll:error HTTP " + response.status);
        scheduleNextPoll(POLL_MS);
        return;
      }

      var payload = await response.json();
      var job = payload && payload.job;
      if (!job || !job.id) {
        log("poll:error payload invalido");
        scheduleNextPoll(POLL_MS);
        return;
      }

      busy = true;
      setStatus("Estado: procesando job " + job.id);
      log("job:claimed " + job.id);
      await processJob(job);
    } catch (error) {
      log("poll:error " + getErrorMessage(error));
    } finally {
      busy = false;
      scheduleNextPoll(POLL_MS);
    }
  }

  async function processJob(job) {
    var result;

    try {
      var segment = job.captionSegment || {};
      var timelineStartMs = Math.max(0, Math.round(job.sequenceInMs + segment.startMs));
      var durationMs = Math.max(1, Math.round(segment.endMs - segment.startMs));
      var timelineEndMs = timelineStartMs + durationMs;
      var script = [
        "$._GLIFO.importOneMogrt(",
        quoteJsxString(job.mogrtPath),
        ",",
        String(timelineStartMs),
        ",",
        String(timelineEndMs),
        ",",
        quoteJsxString(segment.text || ""),
        ",",
        String(toTrackOffset(job.videoTrackOffset)),
        ",",
        String(toTrackOffset(job.audioTrackOffset)),
        ")",
      ].join("");

      log("eval:start " + job.id + " @" + timelineStartMs + "ms");
      var rawResult = await evalScript(script);
      result = parseEvalResult(rawResult);
      log("eval:done " + job.id + " inserted=" + Boolean(result.inserted));
    } catch (error) {
      result = {
        ok: false,
        inserted: false,
        text: {
          ok: false,
          error: "No se intento setear texto.",
        },
        duration: {
          ok: false,
          error: "No se intento ajustar duracion.",
        },
        itemName: null,
        startTicks: null,
        endTicks: null,
        errors: [getErrorMessage(error)],
      };
      log("eval:error " + job.id + " " + getErrorMessage(error));
    }

    await postResult(job.id, result);
    log("job:result-posted " + job.id);
  }

  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      csInterface.evalScript(script, function (result) {
        if (typeof result === "string" && result.indexOf("EvalScript error") === 0) {
          reject(new Error(result));
          return;
        }

        resolve(result);
      });
    });
  }

  function parseEvalResult(rawResult) {
    if (typeof rawResult !== "string" || rawResult.length === 0) {
      throw new Error("ExtendScript devolvio un resultado vacio.");
    }

    try {
      return JSON.parse(rawResult);
    } catch (error) {
      throw new Error("ExtendScript no devolvio JSON valido: " + rawResult);
    }
  }

  async function postResult(jobId, result) {
    var response = await fetch(JOBS_ENDPOINT + "/" + encodeURIComponent(jobId) + "/result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      throw new Error("No se pudo postear resultado del job " + jobId + " (HTTP " + response.status + ")");
    }
  }

  function quoteJsxString(value) {
    return JSON.stringify(String(value))
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function toTrackOffset(value) {
    return typeof value === "number" && isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function log(message) {
    var time = new Date().toISOString().split("T")[1].replace("Z", "");
    logLines.push("[" + time + "] " + message);
    if (logLines.length > 200) {
      logLines = logLines.slice(logLines.length - 200);
    }
    logEl.textContent = logLines.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error);
  }
})();
