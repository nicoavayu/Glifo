(function () {
  var TICKS_PER_SECOND = 254016000000;
  var MAX_KEYS = 80;
  var MAX_COMPONENTS = 12;
  var MAX_PARAMS = 40;
  var MAX_VISUAL_PARAMS = 120;
  var MAX_VALUE_CHARS = 6000;
  var MAX_STRUCTURE_DEPTH = 4;
  var DEFAULT_TEMPLATE_TEXT = "Caption text";
  var DEFAULT_SUBTITLE_POSITION = { x: 960, y: 850 };
  var POSITION_FRAME_1080P = {
    minX: 0,
    maxX: 1920,
    minY: 0,
    maxY: 1080,
    visibleMinY: 700,
    visibleMaxY: 980
  };
  var BAD_POSITION_SENTINEL = 32767;
  var TEXT_FIELD_NAMES = [
    "text",
    "sourceText",
    "mTextParam",
    "value",
    "textEditValue",
    "fontEditValue",
    "string",
    "content"
  ];
  var SET_VALUE_UPDATE_UI_OPTIONS = [
    { label: "1", value: 1 },
    { label: "true", value: true },
    { label: "0", value: 0 },
    { label: "false", value: false }
  ];
  var VISUAL_PARAM_GROUPS = [
    {
      key: "sourceText",
      label: "source text / caption text",
      keywords: ["caption text", "source text", "text", "texto", "mtextparam"]
    },
    {
      key: "opacity",
      label: "opacity",
      keywords: ["opacity", "opacidad", "alpha", "transparency", "transparencia"]
    },
    {
      key: "position",
      label: "position",
      keywords: ["position", "posicion", "anchor", "punto de anclaje", "x position", "y position"]
    },
    {
      key: "scale",
      label: "scale",
      keywords: ["scale", "escala", "size", "tamano"]
    },
    {
      key: "fontSize",
      label: "font size",
      keywords: ["font size", "text size", "tamano de fuente", "tamano texto", "size"]
    },
    {
      key: "fillColor",
      label: "fill color",
      keywords: ["fill color", "fill", "relleno", "text color", "caption color", "color texto"]
    },
    {
      key: "strokeColor",
      label: "stroke color",
      keywords: ["stroke color", "stroke", "trazo color", "color trazo"]
    },
    {
      key: "strokeWidth",
      label: "stroke width",
      keywords: ["stroke width", "stroke size", "stroke ancho", "trazo ancho", "ancho trazo"]
    },
    {
      key: "shadow",
      label: "shadow",
      keywords: ["shadow", "sombra", "drop shadow"]
    },
    {
      key: "animation",
      label: "animation / preset",
      keywords: ["animation", "animacion", "preset", "template"]
    },
    {
      key: "colorFill",
      label: "legacy color / fill",
      keywords: ["color", "colour"]
    },
    {
      key: "visibility",
      label: "visibility / enabled",
      keywords: ["visibility", "visible", "enabled", "enable", "habilitado", "disabled", "hidden"]
    },
    {
      key: "backgroundMask",
      label: "background / mask",
      keywords: ["background", "fondo", "mask", "mascara", "matte", "box", "shape", "rectangle"]
    }
  ];

  if (!$._GLIFO) {
    $._GLIFO = {};
  }

  $._GLIFO.importOneMogrt = function (
    mogrtPath,
    timelineStartMs,
    timelineEndMs,
    text,
    videoTrackOffset,
    audioTrackOffset,
    styleJson
  ) {
    var startTicks = msToTicks(timelineStartMs);
    var endTicks = msToTicks(timelineEndMs);
    var result = {
      ok: false,
      inserted: false,
      text: {
        ok: false,
        status: "failed",
        error: null,
        reason: null,
        paramName: null,
        source: null,
        componentName: null,
        componentIndex: null,
        paramIndex: null,
        selectedTextProperty: null,
        textBefore: null,
        textAfter: null,
        textBeforeFullDiagnostic: null,
        textAfterFullDiagnostic: null,
        textVerification: null,
        attemptedValueFormats: [],
        verificationResult: null,
        textCandidates: []
      },
      duration: {
        ok: false,
        error: null
      },
      style: {
        ok: false,
        status: "not_requested",
        error: null,
        applied: [],
        skipped: [],
        unavailable: [],
        controls: []
      },
      visual: null,
      selectedTextProperty: null,
      textBefore: null,
      textAfter: null,
      textBeforeFullDiagnostic: null,
      textAfterFullDiagnostic: null,
      attemptedValueFormats: [],
      verificationResult: null,
      itemName: null,
      startTicks: startTicks,
      endTicks: endTicks,
      availableProperties: [],
      mogrtLogs: [],
      diagnostics: null,
      errors: []
    };

    try {
      var sequence = app.project.activeSequence;
      if (!sequence) {
        result.errors.push("No activeSequence disponible.");
        return jsonStringify(result);
      }

      var item = sequence.importMGT(
        mogrtPath,
        startTicks,
        normalizeTrackOffset(videoTrackOffset),
        normalizeTrackOffset(audioTrackOffset)
      );

      if (!item) {
        result.errors.push("activeSequence.importMGT devolvio null.");
        return jsonStringify(result);
      }

      var mgtInspection = inspectMgtComponent(item);
      var stylePayload = parseStylePayload(styleJson);
      var availableProperties = inspectAllMogrtProperties(item, mgtInspection);
      result.ok = true;
      result.inserted = true;
      result.itemName = safeString(item.name);
      result.availableProperties = availableProperties;
      emitMogrtLog(result.mogrtLogs, "mogrt:available-properties", {
        count: availableProperties.length,
        properties: availableProperties
      });
      result.diagnostics = inspectTrackItem(item, mgtInspection);
      result.diagnostics.availableProperties = availableProperties;
      result.text = trySetMogrtText(item, text, mgtInspection, result.mogrtLogs);
      result.style = tryApplyMogrtStyle(item, mgtInspection, stylePayload, result.mogrtLogs);
      result.selectedTextProperty = result.text.selectedTextProperty;
      result.textBefore = result.text.textBefore;
      result.textAfter = result.text.textAfter;
      result.textBeforeFullDiagnostic = result.text.textBeforeFullDiagnostic;
      result.textAfterFullDiagnostic = result.text.textAfterFullDiagnostic;
      result.attemptedValueFormats = result.text.attemptedValueFormats;
      result.verificationResult = result.text.verificationResult;
      result.visual = inspectMogrtVisualAudit(item, mgtInspection, result.text, availableProperties, stylePayload);
      result.diagnostics.visualAudit = result.visual;
      result.duration = trySetTrackItemEnd(item, endTicks);

      if (!result.text.ok && result.text.error) {
        result.errors.push(result.text.error);
      }
      if (!result.duration.ok && result.duration.error) {
        result.errors.push(result.duration.error);
      }
    } catch (error) {
      result.ok = false;
      result.errors.push(errorToString(error));
    }

    return jsonStringify(result);
  };

  function trySetMogrtText(item, text, mgtInspection, logs) {
    var result = {
      ok: false,
      status: "failed",
      error: null,
      reason: null,
      paramName: null,
      source: null,
      componentName: null,
      componentIndex: null,
      paramIndex: null,
      selectedTextProperty: null,
      textBefore: null,
      textAfter: null,
      textBeforeFullDiagnostic: null,
      textAfterFullDiagnostic: null,
      textVerification: null,
      attemptedValueFormats: [],
      verificationResult: null,
      textCandidates: []
    };

    try {
      var candidates = collectTextParamCandidates(item, mgtInspection);
      if (candidates.length > 0) {
        for (var i = 0; i < candidates.length; i++) {
          var candidateResult = applyTextParamCandidate(candidates[i], text, logs);
          result.textCandidates.push(candidateResult.summary);

          if (candidateResult.ok) {
            fillTextResultFromCandidate(result, candidateResult.summary);
            return result;
          }

          result.textBefore = candidateResult.summary.valueBefore;
          result.textAfter = candidateResult.summary.valueAfter;
          result.textBeforeFullDiagnostic = candidateResult.summary.valueBeforeFullDiagnostic;
          result.textAfterFullDiagnostic = candidateResult.summary.valueAfterFullDiagnostic;
          result.textVerification = candidateResult.summary.textVerification;
          result.attemptedValueFormats = candidateResult.summary.attemptedValueFormats;
          result.verificationResult = candidateResult.summary.verificationResult;
          result.paramName = candidateResult.summary.displayName;
          result.source = candidateResult.summary.source;
          result.componentName = candidateResult.summary.componentName;
          result.componentIndex = candidateResult.summary.componentIndex;
          result.paramIndex = candidateResult.summary.index;
          result.selectedTextProperty = createSelectedTextProperty(candidateResult.summary);
        }

        result.error = "MOGRT Source Text detected but Premiere did not persist setValue. Need different AE template/export settings.";
        result.reason = result.error;
        return result;
      }

      if (mgtInspection.error) {
        result.error = "getMGTComponent() fallo: " + mgtInspection.error;
        result.reason = "MOGRT does not expose a controllable Source Text / Caption Text / Text property.";
        return result;
      }

      if (mgtInspection.attempted && mgtInspection.isNull) {
        result.error = "getMGTComponent() devolvio null; no se encontro parametro de texto en item.components.";
        result.reason = "MOGRT does not expose a controllable Source Text / Caption Text / Text property.";
        return result;
      }

      if (mgtInspection.typeofGetMGTComponent !== "function") {
        result.error = "TrackItem no expone getMGTComponent(); no se encontro parametro de texto en item.components.";
        result.reason = "MOGRT does not expose a controllable Source Text / Caption Text / Text property.";
        return result;
      }

      result.error = "No se encontro parametro Source Text / Caption Text / Text.";
      result.reason = "MOGRT does not expose a controllable Source Text / Caption Text / Text property.";
      return result;
    } catch (error) {
      result.error = errorToString(error);
      result.reason = result.error;
      return result;
    }
  }

  function parseStylePayload(styleJson) {
    if (!styleJson) {
      return null;
    }

    if (typeof styleJson === "object") {
      return styleJson;
    }

    if (typeof styleJson !== "string" || trimString(styleJson).length === 0) {
      return null;
    }

    var parsed = parseJsonString(styleJson);
    if (parsed.ok && parsed.value && typeof parsed.value === "object") {
      return parsed.value;
    }

    return null;
  }

  function emitSetParamLog(logs, payload) {
    emitMogrtLog(logs, "mogrt:set-param", payload);
  }

  function emitMogrtLog(logs, eventName, payload) {
    if (!logs) {
      return;
    }

    try {
      logs.push("[GLIFO] " + eventName + " " + jsonStringify(payload));
    } catch (error) {
      logs.push("[GLIFO] " + eventName + " {\"error\":\"" + errorToString(error) + "\"}");
    }
  }

  function tryApplyMogrtStyle(item, mgtInspection, stylePayload, logs) {
    var result = {
      ok: false,
      status: "not_requested",
      error: null,
      applied: [],
      skipped: [],
      unavailable: [],
      controls: []
    };

    if (!stylePayload) {
      result.ok = true;
      return result;
    }

    try {
      var candidates = collectStyleParamCandidates(item, mgtInspection);
      for (var i = 0; i < candidates.length; i++) {
        result.controls.push(createStyleCandidateSummary(candidates[i]));
      }

      if (candidates.length === 0) {
        result.status = "no_style_params";
        result.error = "Este MOGRT solo permite editar texto. Para controlar estilo, expone parametros en After Effects.";
        return result;
      }

      applyStyleControl(result, candidates, "fillColor", stylePayload.fillColor, logs);
      applyStyleControl(result, candidates, "fontSize", stylePayload.fontSize, logs);
      applyStyleControl(result, candidates, "strokeWidth", stylePayload.strokeEnabled ? stylePayload.strokeWidth : 0, logs);
      applyStyleControl(result, candidates, "shadowEnabled", stylePayload.shadowEnabled, logs);
      applyMogrtPositionControl(result, candidates, stylePayload.positionYMode, logs);

      result.ok = result.applied.length > 0;
      result.status = result.ok ? "ok" : "no_matching_style_params";
      if (!result.ok) {
        result.error = "No se encontraron parametros de estilo compatibles en este MOGRT.";
      }
      return result;
    } catch (error) {
      result.status = "failed";
      result.error = errorToString(error);
      return result;
    }
  }

  function collectStyleParamCandidates(item, mgtInspection) {
    var candidates = [];

    if (mgtInspection.component) {
      collectStyleParamCandidatesFromProperties(
        mgtInspection.component.properties,
        "getMGTComponent.properties[index]",
        readParamDisplayName(mgtInspection.component),
        null,
        candidates
      );
    }

    collectStyleParamCandidatesFromComponents(item.components, candidates);
    return candidates;
  }

  function collectStyleParamCandidatesFromComponents(components, candidates) {
    if (!components) {
      return;
    }

    var count = readCollectionCount(components);
    for (var i = 0; i < count && i < MAX_COMPONENTS; i++) {
      var component = readCollectionItem(components, i);
      if (!component || !component.properties) {
        continue;
      }

      collectStyleParamCandidatesFromProperties(
        component.properties,
        "item.components[" + String(i) + "].properties[index]",
        readParamDisplayName(component),
        i,
        candidates
      );
    }
  }

  function collectStyleParamCandidatesFromProperties(properties, source, componentName, componentIndex, candidates) {
    if (!properties) {
      return;
    }

    var count = readCollectionCount(properties);
    for (var i = 0; i < count && i < MAX_VISUAL_PARAMS; i++) {
      var param = readCollectionItem(properties, i);
      if (!param) {
        continue;
      }

      var groupKeys = getVisualParamGroupKeys(param);
      if (groupKeys.length === 0) {
        continue;
      }

      var candidate = {
        param: param,
        index: i,
        displayName: readParamDisplayName(param),
        matchName: readParamMatchName(param),
        type: readParamType(param),
        source: source,
        componentName: componentName,
        componentIndex: componentIndex,
        groups: groupKeys,
        valueInfo: readParamValueInfo(param)
      };

      if (!hasStyleParamCandidate(candidates, candidate)) {
        candidates.push(candidate);
      }
    }
  }

  function hasStyleParamCandidate(candidates, candidate) {
    for (var i = 0; i < candidates.length; i++) {
      if (
        candidates[i].source === candidate.source &&
        candidates[i].componentIndex === candidate.componentIndex &&
        candidates[i].index === candidate.index &&
        candidates[i].displayName === candidate.displayName
      ) {
        return true;
      }
    }

    return false;
  }

  function createStyleCandidateSummary(candidate) {
    return {
      index: candidate.index,
      displayName: candidate.displayName,
      matchName: candidate.matchName,
      type: candidate.type,
      source: candidate.source,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      groups: candidate.groups,
      value: candidate.valueInfo.valueDiagnostic,
      typeofValue: candidate.valueInfo.typeofValue,
      valueKind: candidate.valueInfo.valueKind,
      typeofSetValue: typeof candidate.param.setValue
    };
  }

  function applyStyleControl(result, candidates, controlKey, requestedValue, logs) {
    if (requestedValue === null || requestedValue === undefined || requestedValue === "") {
      result.skipped.push({ control: controlKey, reason: "empty_value" });
      return;
    }

    var candidate = findStyleCandidate(candidates, controlKey);
    if (!candidate) {
      result.unavailable.push({ control: controlKey });
      emitSetParamLog(logs, {
        kind: "style",
        control: controlKey,
        propertyName: controlKey,
        attemptedValue: requestedValue,
        success: false,
        error: "No matching exposed MOGRT property."
      });
      return;
    }

    applyStyleCandidate(result, candidate, controlKey, requestedValue, logs);
  }

  function applyMogrtPositionControl(result, candidates, positionYMode, logs) {
    if (positionYMode === null || positionYMode === undefined || positionYMode === "") {
      result.skipped.push({ control: "positionY", reason: "empty_value" });
      return;
    }

    var matches = findStyleCandidates(candidates, "positionY", 8);
    if (matches.length === 0) {
      result.unavailable.push({ control: "positionY" });
      emitMogrtLog(logs, "mogrt:position-before", {
        control: "positionY",
        selected: null,
        candidateCount: 0,
        before: null
      });
      emitMogrtLog(logs, "mogrt:position-set-attempt", {
        control: "positionY",
        attemptedValue: null,
        success: false,
        error: "No matching exposed MOGRT position property."
      });
      emitMogrtLog(logs, "mogrt:position-after", {
        control: "positionY",
        selected: null,
        after: null,
        success: false,
        error: "No matching exposed MOGRT position property."
      });
      emitSetParamLog(logs, {
        kind: "style",
        control: "positionY",
        propertyName: "positionY",
        attemptedValue: positionYMode,
        success: false,
        error: "No matching exposed MOGRT property."
      });
      return;
    }

    for (var i = 0; i < matches.length; i++) {
      if (applyMogrtPositionCandidate(result, matches[i], positionYMode, logs, matches.length)) {
        return;
      }
    }
  }

  function applyMogrtPositionCandidate(result, candidate, positionYMode, logs, candidateCount) {
    var beforeInfo = readParamValueInfo(candidate.param);
    var positionValue = buildSafePositionSetValue(candidate, beforeInfo.value, beforeInfo, positionYMode);
    var beforePayload = createPositionLogPayload(candidate, {
      control: "positionY",
      candidateCount: candidateCount,
      requestedMode: positionYMode,
      before: beforeInfo.valueDiagnostic,
      beforeValueKind: beforeInfo.valueKind,
      beforeGetValueOk: beforeInfo.ok,
      beforeGetValueError: beforeInfo.error,
      coordinateSpaceHint: positionValue.coordinateSpaceHint,
      strategy: positionValue.strategy
    });
    emitMogrtLog(logs, "mogrt:position-before", beforePayload);

    if (!positionValue.available) {
      var skippedEntry = createPositionResultEntry(candidate, positionYMode, null, beforeInfo, beforeInfo, null);
      skippedEntry.error = positionValue.reason;
      result.skipped.push(skippedEntry);
      emitMogrtLog(logs, "mogrt:position-set-attempt", createPositionLogPayload(candidate, {
        control: "positionY",
        requestedMode: positionYMode,
        attemptedValue: null,
        strategy: positionValue.strategy,
        success: false,
        error: positionValue.reason
      }));
      emitMogrtLog(logs, "mogrt:position-after", createPositionLogPayload(candidate, {
        control: "positionY",
        requestedMode: positionYMode,
        after: beforeInfo.valueDiagnostic,
        success: false,
        error: positionValue.reason
      }));
      emitSetParamLog(logs, {
        kind: "style",
        control: "positionY",
        propertyName: candidate.displayName || "positionY",
        matchName: candidate.matchName,
        componentName: candidate.componentName,
        componentIndex: candidate.componentIndex,
        paramIndex: candidate.index,
        attemptedValue: null,
        before: beforeInfo.valueDiagnostic,
        after: beforeInfo.valueDiagnostic,
        success: false,
        error: positionValue.reason
      });
      return false;
    }

    emitMogrtLog(logs, "mogrt:position-set-attempt", createPositionLogPayload(candidate, {
      control: "positionY",
      requestedMode: positionYMode,
      attemptedValue: toDiagnosticValue(positionValue.value, 0, []),
      pixelTarget: positionValue.pixelTarget,
      coordinateSpaceHint: positionValue.coordinateSpaceHint,
      strategy: positionValue.strategy,
      success: null,
      error: null
    }));

    var setResult = applyGenericSetValue(candidate.param, positionValue.value);
    var afterInfo = readParamValueInfo(candidate.param);
    var invalidAfter = containsBadPositionSentinel(afterInfo.value);
    var success = setResult.ok === true && invalidAfter !== true;
    var error = success
      ? null
      : (invalidAfter ? "position_after_invalid_32767" : setResult.error || "setValue failed");
    var entry = createPositionResultEntry(candidate, positionYMode, positionValue.value, beforeInfo, afterInfo, setResult);
    entry.strategy = positionValue.strategy;
    entry.coordinateSpaceHint = positionValue.coordinateSpaceHint;
    entry.pixelTarget = positionValue.pixelTarget;

    if (success) {
      result.applied.push(entry);
    } else {
      entry.error = error;
      result.skipped.push(entry);
    }

    emitMogrtLog(logs, "mogrt:position-after", createPositionLogPayload(candidate, {
      control: "positionY",
      requestedMode: positionYMode,
      attemptedValue: entry.attemptedValue,
      before: entry.before,
      after: entry.after,
      setValue: setResult,
      success: success,
      error: error
    }));
    emitSetParamLog(logs, {
      kind: "style",
      control: "positionY",
      propertyName: candidate.displayName || "positionY",
      matchName: candidate.matchName,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      paramIndex: candidate.index,
      attemptedValue: entry.attemptedValue,
      before: entry.before,
      after: entry.after,
      success: success,
      error: error
    });

    return success;
  }

  function createPositionResultEntry(candidate, requestedValue, attemptedValue, beforeInfo, afterInfo, setResult) {
    return {
      control: "positionY",
      displayName: candidate.displayName,
      matchName: candidate.matchName,
      type: candidate.type,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      paramIndex: candidate.index,
      requestedValue: requestedValue,
      attemptedValue: attemptedValue === null ? null : toDiagnosticValue(attemptedValue, 0, []),
      before: beforeInfo.valueDiagnostic,
      after: afterInfo.valueDiagnostic,
      setValue: setResult
    };
  }

  function createPositionLogPayload(candidate, payload) {
    payload.propertyName = candidate.displayName || "positionY";
    payload.matchName = candidate.matchName;
    payload.componentName = candidate.componentName;
    payload.componentIndex = candidate.componentIndex;
    payload.paramIndex = candidate.index;
    payload.source = candidate.source;
    payload.type = candidate.type;
    return payload;
  }

  function applyStyleCandidate(result, candidate, controlKey, requestedValue, logs) {
    var setValue = buildStyleSetValue(candidate, controlKey, requestedValue);
    if (!setValue.available) {
      result.skipped.push({
        control: controlKey,
        displayName: candidate.displayName,
        reason: setValue.reason
      });
      emitSetParamLog(logs, {
        kind: "style",
        control: controlKey,
        propertyName: candidate.displayName || controlKey,
        matchName: candidate.matchName,
        componentName: candidate.componentName,
        componentIndex: candidate.componentIndex,
        paramIndex: candidate.index,
        attemptedValue: requestedValue,
        success: false,
        error: setValue.reason
      });
      return;
    }

    var beforeInfo = readParamValueInfo(candidate.param);
    var setResult = applyGenericSetValue(candidate.param, setValue.value);
    var afterInfo = readParamValueInfo(candidate.param);
    var entry = {
      control: controlKey,
      displayName: candidate.displayName,
      matchName: candidate.matchName,
      type: candidate.type,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      paramIndex: candidate.index,
      requestedValue: requestedValue,
      attemptedValue: toDiagnosticValue(setValue.value, 0, []),
      before: beforeInfo.valueDiagnostic,
      after: afterInfo.valueDiagnostic,
      setValue: setResult
    };

    if (setResult.ok) {
      result.applied.push(entry);
    } else {
      entry.error = setResult.error || "setValue failed";
      result.skipped.push(entry);
    }

    emitSetParamLog(logs, {
      kind: "style",
      control: controlKey,
      propertyName: candidate.displayName || controlKey,
      matchName: candidate.matchName,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      paramIndex: candidate.index,
      attemptedValue: entry.attemptedValue,
      before: entry.before,
      after: entry.after,
      success: setResult.ok === true,
      error: setResult.ok ? null : setResult.error || "setValue failed"
    });
  }

  function findStyleCandidate(candidates, controlKey) {
    var matches = findStyleCandidates(candidates, controlKey, 1);
    return matches.length > 0 ? matches[0] : null;
  }

  function findStyleCandidates(candidates, controlKey, limit) {
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
      var score = scoreStyleCandidate(candidates[i], controlKey);
      if (score > 0) {
        scored.push({
          candidate: candidates[i],
          score: score
        });
      }
    }

    scored.sort(function (left, right) {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      var leftIndex = left.candidate.index === null ? 9999 : left.candidate.index;
      var rightIndex = right.candidate.index === null ? 9999 : right.candidate.index;
      return leftIndex - rightIndex;
    });

    var matches = [];
    for (var j = 0; j < scored.length && matches.length < limit; j++) {
      matches.push(scored[j].candidate);
    }

    return matches;
  }

  function scoreStyleCandidate(candidate, controlKey) {
    var name = normalizeParamNameForSearch(
      safeString(candidate.displayName) + " " + safeString(candidate.matchName) + " " + safeString(candidate.type)
    );
    var groups = candidate.groups || [];

    if (controlKey === "fillColor") {
      if (containsValue(groups, "backgroundMask") || name.indexOf("background") >= 0 || name.indexOf("fondo") >= 0 || name.indexOf("box") >= 0) {
        return 0;
      }
      if (containsValue(groups, "fillColor")) {
        return 90;
      }
      if (containsValue(groups, "colorFill") && name.indexOf("stroke") < 0 && name.indexOf("trazo") < 0 && name.indexOf("shadow") < 0) {
        return 50;
      }
      return 0;
    }

    if (controlKey === "fontSize") {
      if (containsValue(groups, "fontSize")) {
        return 90;
      }
      if ((name.indexOf("font") >= 0 || name.indexOf("texto") >= 0) && name.indexOf("size") >= 0) {
        return 60;
      }
      return 0;
    }

    if (controlKey === "strokeWidth") {
      if (containsValue(groups, "strokeWidth")) {
        return 100;
      }
      if ((name.indexOf("stroke") >= 0 || name.indexOf("trazo") >= 0) && (name.indexOf("width") >= 0 || name.indexOf("ancho") >= 0 || name.indexOf("size") >= 0)) {
        return 80;
      }
      return 0;
    }

    if (controlKey === "shadowEnabled") {
      if (name.indexOf("color") >= 0 || name.indexOf("colour") >= 0) {
        return 0;
      }
      if (containsValue(groups, "shadow")) {
        return name.indexOf("opacity") >= 0 || name.indexOf("enabled") >= 0 || name.indexOf("on") >= 0 ? 100 : 65;
      }
      return 0;
    }

    if (controlKey === "opacity") {
      if (containsValue(groups, "opacity")) {
        return 95;
      }
      if (name.indexOf("opacity") >= 0 || name.indexOf("opacidad") >= 0 || name.indexOf("alpha") >= 0) {
        return 80;
      }
      return 0;
    }

    if (controlKey === "scale") {
      if (containsValue(groups, "scale")) {
        return name.indexOf("anchor") >= 0 ? 10 : 95;
      }
      if (name.indexOf("scale") >= 0 || name.indexOf("escala") >= 0) {
        return 80;
      }
      return 0;
    }

    if (controlKey === "position") {
      if (!containsValue(groups, "position")) {
        return 0;
      }
      if (name.indexOf("anchor") >= 0 || name.indexOf("anclaje") >= 0) {
        return 15;
      }
      if (name.indexOf(" y") >= 0 || name.indexOf("y position") >= 0 || name.indexOf("posicion y") >= 0) {
        return 95;
      }
      if (name.indexOf(" x") >= 0 || name.indexOf("x position") >= 0 || name.indexOf("posicion x") >= 0) {
        return 95;
      }
      return 85;
    }

    if (controlKey === "positionY") {
      if (name.indexOf(" x") >= 0 || name.indexOf("x position") >= 0 || name.indexOf("posicion x") >= 0) {
        return 0;
      }
      if (containsValue(groups, "position") && (name.indexOf(" y") >= 0 || name.indexOf("position") >= 0 || name.indexOf("posicion") >= 0)) {
        return name.indexOf("anchor") >= 0 ? 20 : 85;
      }
      return 0;
    }

    return 0;
  }

  function buildStyleSetValue(candidate, controlKey, requestedValue) {
    var currentValue = candidate.valueInfo.value;

    if (controlKey === "fillColor") {
      var rgb = parseHexColor(requestedValue);
      if (!rgb) {
        return { available: false, reason: "invalid_color" };
      }
      return { available: true, value: coerceColorValue(currentValue, rgb) };
    }

    if (controlKey === "fontSize") {
      return { available: true, value: clampNumber(requestedValue, 1, 500, 96) };
    }

    if (controlKey === "strokeWidth") {
      return { available: true, value: clampNumber(requestedValue, 0, 80, 0) };
    }

    if (controlKey === "shadowEnabled") {
      return { available: true, value: coerceBooleanLikeValue(currentValue, Boolean(requestedValue)) };
    }

    if (controlKey === "opacity") {
      return { available: true, value: coerceOpacityValue(currentValue, requestedValue) };
    }

    if (controlKey === "scale") {
      return { available: true, value: coerceScaleValue(currentValue, requestedValue) };
    }

    if (controlKey === "position") {
      return { available: true, value: coercePositionValue(currentValue, requestedValue, candidate) };
    }

    if (controlKey === "positionY") {
      return { available: true, value: coercePositionYValue(currentValue, requestedValue) };
    }

    return { available: false, reason: "unknown_control" };
  }

  function applyGenericSetValue(param, value) {
    var result = {
      ok: false,
      error: null,
      returnValue: null,
      returnType: null,
      returnKind: null
    };

    if (!param || typeof param.setValue !== "function") {
      result.error = "El parametro no expone setValue().";
      return result;
    }

    var updateUiValues = [true, 1, false, 0];
    for (var i = 0; i < updateUiValues.length; i++) {
      try {
        var returnValue = param.setValue(value, updateUiValues[i]);
        result.returnValue = toDiagnosticValue(returnValue, 0, []);
        result.returnType = typeof returnValue;
        result.returnKind = valueKind(returnValue);
        if (returnValue !== false) {
          result.ok = true;
          result.error = null;
          return result;
        }
      } catch (error) {
        result.error = errorToString(error);
      }
    }

    return result;
  }

  function parseHexColor(value) {
    var normalized = trimString(safeString(value)).replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return null;
    }

    return {
      r: parseInt(normalized.substring(0, 2), 16),
      g: parseInt(normalized.substring(2, 4), 16),
      b: parseInt(normalized.substring(4, 6), 16)
    };
  }

  function coerceColorValue(currentValue, rgb) {
    if (isArray(currentValue) && currentValue.length >= 3) {
      var use255 = false;
      for (var i = 0; i < currentValue.length; i++) {
        if (typeof currentValue[i] === "number" && currentValue[i] > 1) {
          use255 = true;
        }
      }

      var converted = currentValue.slice(0);
      converted[0] = use255 ? rgb.r : rgb.r / 255;
      converted[1] = use255 ? rgb.g : rgb.g / 255;
      converted[2] = use255 ? rgb.b : rgb.b / 255;
      if (converted.length >= 4) {
        converted[3] = use255 ? 255 : 1;
      }
      return converted;
    }

    return [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1];
  }

  function coerceBooleanLikeValue(currentValue, enabled) {
    if (typeof currentValue === "boolean") {
      return enabled;
    }

    if (typeof currentValue === "number") {
      if (currentValue > 1) {
        return enabled ? 100 : 0;
      }

      return enabled ? 1 : 0;
    }

    return enabled ? 1 : 0;
  }

  function coerceOpacityValue(currentValue, requestedValue) {
    var numeric = clampNumber(requestedValue, 0, 100, 100);
    if (typeof currentValue === "number" && currentValue <= 1) {
      return numeric / 100;
    }

    if (isArray(currentValue) && currentValue.length >= 4) {
      var converted = currentValue.slice(0);
      var use255 = uses255ColorScale(currentValue);
      converted[3] = use255 ? Math.round((numeric / 100) * 255) : numeric / 100;
      return converted;
    }

    return numeric;
  }

  function coerceScaleValue(currentValue, requestedValue) {
    var numeric = clampNumber(requestedValue, 1, 500, 100);
    var scalar = typeof currentValue === "number" && currentValue <= 2 ? numeric / 100 : numeric;
    if (isArray(currentValue) && currentValue.length >= 2) {
      var converted = currentValue.slice(0);
      var useNormalized = Math.abs(Number(currentValue[0])) <= 2 && Math.abs(Number(currentValue[1])) <= 2;
      converted[0] = useNormalized ? numeric / 100 : numeric;
      converted[1] = useNormalized ? numeric / 100 : numeric;
      return converted;
    }

    return scalar;
  }

  function buildSafePositionSetValue(candidate, currentValue, beforeInfo, mode) {
    var target = createSafePositionPixelTarget(mode);
    var name = normalizeParamNameForSearch(
      safeString(candidate.displayName) + " " + safeString(candidate.matchName) + " " + safeString(candidate.type)
    );
    var explicitY = isExplicitYPositionName(name);
    var explicitX = isExplicitXPositionName(name);
    var fullPosition = isFullPositionName(name, explicitX, explicitY);

    if (isArray(currentValue) && currentValue.length >= 2) {
      var arraySpace = inferPositionArrayCoordinateSpace(currentValue);
      var arrayTarget = convertPositionPixelTargetToSpace(target, arraySpace);
      var converted = currentValue.slice(0);
      converted[0] = arrayTarget.x;
      converted[1] = arrayTarget.y;
      return {
        available: true,
        value: converted,
        reason: null,
        strategy: "array_xy",
        coordinateSpaceHint: arraySpace,
        pixelTarget: target
      };
    }

    if (typeof currentValue === "number") {
      if (explicitX) {
        return {
          available: false,
          reason: "position_x_property_not_changed",
          strategy: "separate_x_skipped",
          coordinateSpaceHint: inferScalarPositionCoordinateSpace(currentValue),
          pixelTarget: target
        };
      }

      if (explicitY) {
        var scalarSpace = inferScalarPositionCoordinateSpace(currentValue);
        return {
          available: true,
          value: convertPositionPixelYToSpace(target.y, scalarSpace),
          reason: null,
          strategy: "separate_y",
          coordinateSpaceHint: scalarSpace,
          pixelTarget: target
        };
      }

      return {
        available: false,
        reason: "ambiguous_numeric_position_property",
        strategy: "ambiguous_numeric_skipped",
        coordinateSpaceHint: inferScalarPositionCoordinateSpace(currentValue),
        pixelTarget: target
      };
    }

    if (currentValue === null || currentValue === undefined || (beforeInfo && beforeInfo.ok !== true)) {
      if (explicitY) {
        return {
          available: true,
          value: target.y,
          reason: null,
          strategy: "separate_y_without_readable_value",
          coordinateSpaceHint: "pixels_1920x1080",
          pixelTarget: target
        };
      }

      if (fullPosition) {
        return {
          available: true,
          value: [target.x, target.y],
          reason: null,
          strategy: "array_xy_without_readable_value",
          coordinateSpaceHint: "pixels_1920x1080",
          pixelTarget: target
        };
      }
    }

    return {
      available: false,
      reason: "unsupported_position_value_shape",
      strategy: "unsupported_shape_skipped",
      coordinateSpaceHint: inferPositionCoordinateSpaceFromValue(currentValue),
      pixelTarget: target
    };
  }

  function createSafePositionPixelTarget(mode) {
    return {
      x: sanitizePositionPixelX(DEFAULT_SUBTITLE_POSITION.x),
      y: sanitizePositionPixelY(positionYForMode(mode))
    };
  }

  function sanitizePositionPixelX(value) {
    var numeric = Number(value);
    if (!isFinite(numeric) || isBadPositionNumber(numeric)) {
      numeric = DEFAULT_SUBTITLE_POSITION.x;
    }

    return Math.round(Math.min(POSITION_FRAME_1080P.maxX, Math.max(POSITION_FRAME_1080P.minX, numeric)));
  }

  function sanitizePositionPixelY(value) {
    var numeric = Number(value);
    if (!isFinite(numeric) || isBadPositionNumber(numeric)) {
      numeric = DEFAULT_SUBTITLE_POSITION.y;
    }

    return Math.round(Math.min(POSITION_FRAME_1080P.maxY, Math.max(POSITION_FRAME_1080P.minY, numeric)));
  }

  function convertPositionPixelTargetToSpace(pixelTarget, coordinateSpace) {
    return {
      x: convertPositionPixelXToSpace(pixelTarget.x, coordinateSpace),
      y: convertPositionPixelYToSpace(pixelTarget.y, coordinateSpace)
    };
  }

  function convertPositionPixelXToSpace(x, coordinateSpace) {
    if (coordinateSpace === "normalized_0_to_1_or_-1_to_1") {
      return clampNumber(x / POSITION_FRAME_1080P.maxX, 0, 1, 0.5);
    }

    if (coordinateSpace === "percentage") {
      return clampNumber((x / POSITION_FRAME_1080P.maxX) * 100, 0, 100, 50);
    }

    return sanitizePositionPixelX(x);
  }

  function convertPositionPixelYToSpace(y, coordinateSpace) {
    if (coordinateSpace === "normalized_0_to_1_or_-1_to_1") {
      return clampNumber(y / POSITION_FRAME_1080P.maxY, 0, 1, DEFAULT_SUBTITLE_POSITION.y / POSITION_FRAME_1080P.maxY);
    }

    if (coordinateSpace === "percentage") {
      return clampNumber((y / POSITION_FRAME_1080P.maxY) * 100, 0, 100, (DEFAULT_SUBTITLE_POSITION.y / POSITION_FRAME_1080P.maxY) * 100);
    }

    return sanitizePositionPixelY(y);
  }

  function inferPositionCoordinateSpaceFromValue(value) {
    if (isArray(value) && value.length >= 2) {
      return inferPositionArrayCoordinateSpace(value);
    }

    if (typeof value === "number") {
      return inferScalarPositionCoordinateSpace(value);
    }

    return "unsupported_or_unknown";
  }

  function inferPositionArrayCoordinateSpace(value) {
    if (!containsBadPositionSentinel(value) && looksLikeNormalizedPosition(value)) {
      return "normalized_0_to_1_or_-1_to_1";
    }

    if (!containsBadPositionSentinel(value) && looksLikePercentPosition(value)) {
      return "percentage";
    }

    return "pixels_1920x1080";
  }

  function inferScalarPositionCoordinateSpace(value) {
    var numeric = Number(value);
    if (!isFinite(numeric) || isBadPositionNumber(numeric)) {
      return "pixels_1920x1080";
    }

    if (Math.abs(numeric) <= 2) {
      return "normalized_0_to_1_or_-1_to_1";
    }

    if (Math.abs(numeric) <= 100) {
      return "percentage";
    }

    return "pixels_1920x1080";
  }

  function isExplicitXPositionName(name) {
    return name.indexOf(" x") >= 0 ||
      name.indexOf("x position") >= 0 ||
      name.indexOf("posicion x") >= 0;
  }

  function isExplicitYPositionName(name) {
    return name.indexOf(" y") >= 0 ||
      name.indexOf("y position") >= 0 ||
      name.indexOf("posicion y") >= 0;
  }

  function isFullPositionName(name, explicitX, explicitY) {
    if (explicitX || explicitY) {
      return false;
    }

    return name.indexOf("position") >= 0 || name.indexOf("posicion") >= 0;
  }

  function containsBadPositionSentinel(value) {
    var numbers = extractNumbersFromValue(value, 0, []);
    for (var i = 0; i < numbers.length; i++) {
      if (isBadPositionNumber(numbers[i])) {
        return true;
      }
    }

    return false;
  }

  function isBadPositionNumber(value) {
    var numeric = Number(value);
    return isFinite(numeric) && Math.abs(numeric - BAD_POSITION_SENTINEL) <= 0.001;
  }

  function coercePositionValue(currentValue, requestedValue, candidate) {
    var x = Number(requestedValue && requestedValue.x);
    var y = Number(requestedValue && requestedValue.y);
    if (!isFinite(x)) {
      x = DEFAULT_SUBTITLE_POSITION.x;
    }
    if (!isFinite(y)) {
      y = DEFAULT_SUBTITLE_POSITION.y;
    }
    x = sanitizePositionPixelX(x);
    y = sanitizePositionPixelY(y);

    if (isArray(currentValue) && currentValue.length >= 2) {
      var converted = currentValue.slice(0);
      if (looksLikeNormalizedPosition(currentValue)) {
        converted[0] = convertPositionPixelXToSpace(x, "normalized_0_to_1_or_-1_to_1");
        converted[1] = convertPositionPixelYToSpace(y, "normalized_0_to_1_or_-1_to_1");
      } else if (looksLikePercentPosition(currentValue)) {
        converted[0] = convertPositionPixelXToSpace(x, "percentage");
        converted[1] = convertPositionPixelYToSpace(y, "percentage");
      } else {
        converted[0] = x;
        converted[1] = y;
      }
      return converted;
    }

    var name = normalizeParamNameForSearch(
      safeString(candidate.displayName) + " " + safeString(candidate.matchName)
    );
    if (name.indexOf(" x") >= 0 || name.indexOf("x position") >= 0 || name.indexOf("posicion x") >= 0) {
      return x;
    }

    if (name.indexOf(" y") >= 0 || name.indexOf("y position") >= 0 || name.indexOf("posicion y") >= 0) {
      return y;
    }

    if (typeof currentValue === "number" && Math.abs(currentValue) <= 2) {
      return 0.5;
    }

    if (typeof currentValue === "number" && Math.abs(currentValue) <= 100) {
      return 50;
    }

    return y;
  }

  function looksLikeNormalizedPosition(value) {
    return isArray(value) &&
      value.length >= 2 &&
      Math.abs(Number(value[0])) <= 2 &&
      Math.abs(Number(value[1])) <= 2;
  }

  function looksLikePercentPosition(value) {
    return isArray(value) &&
      value.length >= 2 &&
      Math.abs(Number(value[0])) <= 100 &&
      Math.abs(Number(value[1])) <= 100;
  }

  function uses255ColorScale(value) {
    if (!isArray(value)) {
      return false;
    }

    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] === "number" && value[i] > 1) {
        return true;
      }
    }

    return false;
  }

  function coercePositionYValue(currentValue, mode) {
    var y = sanitizePositionPixelY(positionYForMode(mode));
    if (isArray(currentValue) && currentValue.length >= 2) {
      var converted = currentValue.slice(0);
      converted[1] = convertPositionPixelYToSpace(y, inferPositionArrayCoordinateSpace(currentValue));
      return converted;
    }

    return y;
  }

  function positionYForMode(mode) {
    if (mode === "top") {
      return 220;
    }

    if (mode === "center") {
      return 540;
    }

    return DEFAULT_SUBTITLE_POSITION.y;
  }

  function clampNumber(value, min, max, fallback) {
    var numeric = Number(value);
    if (!isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, numeric));
  }

  function fillTextResultFromCandidate(result, summary) {
    result.ok = true;
    result.status = "ok";
    result.error = null;
    result.reason = null;
    result.paramName = summary.displayName;
    result.source = summary.source;
    result.componentName = summary.componentName;
    result.componentIndex = summary.componentIndex;
    result.paramIndex = summary.index;
    result.selectedTextProperty = createSelectedTextProperty(summary);
    result.textBefore = summary.valueBefore;
    result.textAfter = summary.valueAfter;
    result.textBeforeFullDiagnostic = summary.valueBeforeFullDiagnostic;
    result.textAfterFullDiagnostic = summary.valueAfterFullDiagnostic;
    result.textVerification = summary.textVerification;
    result.attemptedValueFormats = summary.attemptedValueFormats;
    result.verificationResult = summary.verificationResult;
  }

  function createSelectedTextProperty(summary) {
    return {
      index: summary.index,
      displayName: summary.displayName,
      matchName: summary.matchName,
      type: summary.type,
      source: summary.source,
      componentName: summary.componentName,
      componentIndex: summary.componentIndex,
      method: summary.selectedMethod
    };
  }

  function applyTextParamCandidate(candidate, text, logs) {
    var expectedText = String(text);
    var summary = createTextCandidateSummary(candidate);
    var beforeInfo = readParamValueInfo(candidate.param);
    summary.getValueBefore = {
      available: beforeInfo.available,
      ok: beforeInfo.ok,
      error: beforeInfo.error
    };
    summary.valueBefore = beforeInfo.valueDiagnostic;
    summary.typeofBefore = beforeInfo.typeofValue;
    summary.valueBeforeKind = beforeInfo.valueKind;
    summary.structureBefore = describeValueStructure(beforeInfo.value, 0, []);
    summary.valueBeforeFullDiagnostic = describeFullValueDiagnostic(candidate, beforeInfo, expectedText);

    var attempts = buildTextSetValueAttempts(beforeInfo, text, expectedText);
    summary.attemptedValueFormats = summarizeAttemptedValueFormats(attempts);
    if (attempts.length === 0) {
      summary.error = "No setValue attempts were available for this candidate.";
      summary.textVerification = createTextVerification(null, expectedText, "no_attempt");
      summary.verificationResult = summary.textVerification;
      return {
        ok: false,
        summary: summary
      };
    }

    for (var i = 0; i < attempts.length; i++) {
      var attempt = attempts[i];
      var attemptResult = applySetValueAttempt(candidate.param, attempt, expectedText, summary, logs);
      summary.attempts.push(attemptResult);

      if (attemptResult.skipped) {
        summary.textVerification = attemptResult.textVerification;
        summary.verificationResult = attemptResult.textVerification;
        continue;
      }

      summary.setValueResult = attemptResult.setValueResult;
      summary.valueAfter = attemptResult.valueAfter;
      summary.typeofAfter = attemptResult.typeofAfter;
      summary.valueAfterKind = attemptResult.valueAfterKind;
      summary.textVerification = attemptResult.textVerification;
      summary.getValueContainsExpected = attemptResult.getValueContainsExpected;
      summary.verificationResult = attemptResult.textVerification;
      summary.valueAfterFullDiagnostic = attemptResult.valueAfterFullDiagnostic;

      if (
        attemptResult.setValueResult &&
        attemptResult.setValueResult.ok &&
        attemptResult.textVerification &&
        attemptResult.textVerification.containsExpected
      ) {
        summary.ok = true;
        summary.selectedMethod = attempt.method;
        return {
          ok: true,
          summary: summary
        };
      }
    }

    if (!summary.error) {
      summary.error = "MOGRT Source Text detected but Premiere did not persist setValue. Need different AE template/export settings.";
    }

    return {
      ok: false,
      summary: summary
    };
  }

  function applySetValueAttempt(param, attempt, expectedText, candidateSummary, logs) {
    var result = {
      method: attempt.method,
      format: attempt.format || null,
      updateUI: attempt.updateUI,
      updateUILabel: attempt.updateUILabel || null,
      skipped: Boolean(attempt.skipped),
      skipReason: attempt.skipReason || null,
      attemptedValue: attempt.skipped ? null : toDiagnosticValue(attempt.value, 0, []),
      attemptedValueType: attempt.skipped ? null : typeof attempt.value,
      attemptedValueKind: attempt.skipped ? null : valueKind(attempt.value),
      attemptedValueSerialized: attempt.skipped ? null : serializeDiagnosticValue(attempt.value),
      structuredFields: attempt.structuredFields || [],
      setValueResult: null,
      valueAfter: null,
      typeofAfter: null,
      valueAfterKind: null,
      valueAfterFullDiagnostic: null,
      getValueAfter: null,
      getValueContainsExpected: false,
      textVerification: null
    };

    if (attempt.skipped) {
      result.textVerification = createTextVerification(null, expectedText, "skipped");
      emitSetParamLog(logs, {
        kind: "text",
        propertyName: candidateSummary ? candidateSummary.displayName : "text",
        matchName: candidateSummary ? candidateSummary.matchName : null,
        componentName: candidateSummary ? candidateSummary.componentName : null,
        componentIndex: candidateSummary ? candidateSummary.componentIndex : null,
        paramIndex: candidateSummary ? candidateSummary.index : null,
        method: attempt.method,
        attemptedValue: null,
        success: false,
        error: attempt.skipReason || "skipped"
      });
      return result;
    }

    var setResult = {
      ok: false,
      error: null,
      returnValue: null,
      returnType: null,
      returnKind: null
    };

    if (typeof param.setValue !== "function") {
      setResult.error = "El parametro de texto no expone setValue().";
      result.setValueResult = setResult;
      result.textVerification = createTextVerification(null, expectedText, "setValue_missing");
      emitSetParamLog(logs, {
        kind: "text",
        propertyName: candidateSummary ? candidateSummary.displayName : "text",
        matchName: candidateSummary ? candidateSummary.matchName : null,
        componentName: candidateSummary ? candidateSummary.componentName : null,
        componentIndex: candidateSummary ? candidateSummary.componentIndex : null,
        paramIndex: candidateSummary ? candidateSummary.index : null,
        method: attempt.method,
        attemptedValue: result.attemptedValue,
        success: false,
        error: setResult.error
      });
      return result;
    }

    try {
      var returnValue = param.setValue(attempt.value, attempt.updateUI);
      setResult.returnValue = toDiagnosticValue(returnValue, 0, []);
      setResult.returnType = typeof returnValue;
      setResult.returnKind = valueKind(returnValue);
      setResult.ok = returnValue !== false;
    } catch (error) {
      setResult.error = errorToString(error);
      setResult.ok = false;
    }

    result.setValueResult = setResult;

    var afterInfo = readParamValueInfo(param);
    result.getValueAfter = {
      available: afterInfo.available,
      ok: afterInfo.ok,
      error: afterInfo.error
    };
    result.valueAfter = afterInfo.valueDiagnostic;
    result.typeofAfter = afterInfo.typeofValue;
    result.valueAfterKind = afterInfo.valueKind;
    result.valueAfterFullDiagnostic = describeFullValueDiagnostic(null, afterInfo, expectedText);
    result.textVerification = createTextVerification(afterInfo, expectedText, setResult.ok ? "checked" : "setValue_failed");
    result.getValueContainsExpected = result.textVerification.containsExpected;

    emitSetParamLog(logs, {
      kind: "text",
      propertyName: candidateSummary ? candidateSummary.displayName : "text",
      matchName: candidateSummary ? candidateSummary.matchName : null,
      componentName: candidateSummary ? candidateSummary.componentName : null,
      componentIndex: candidateSummary ? candidateSummary.componentIndex : null,
      paramIndex: candidateSummary ? candidateSummary.index : null,
      method: attempt.method,
      attemptedValue: result.attemptedValue,
      before: null,
      after: result.valueAfter,
      success: setResult.ok === true && result.getValueContainsExpected === true,
      setValueOk: setResult.ok,
      verified: result.getValueContainsExpected,
      error: setResult.ok
        ? (result.getValueContainsExpected ? null : "setValue returned but getValue did not verify expected text")
        : setResult.error || "setValue failed"
    });

    return result;
  }

  function createTextCandidateSummary(candidate) {
    return {
      ok: false,
      index: candidate.paramIndex,
      displayName: candidate.paramName,
      matchName: candidate.matchName,
      type: candidate.paramType,
      source: candidate.source,
      componentName: candidate.componentName,
      componentIndex: candidate.componentIndex,
      priority: candidate.priority,
      typeofSetValue: typeof candidate.param.setValue,
      valueBefore: null,
      typeofBefore: null,
      valueBeforeKind: null,
      getValueBefore: null,
      structureBefore: null,
      valueBeforeFullDiagnostic: null,
      valueAfter: null,
      typeofAfter: null,
      valueAfterKind: null,
      valueAfterFullDiagnostic: null,
      setValueResult: null,
      getValueContainsExpected: false,
      textVerification: null,
      verificationResult: null,
      selectedMethod: null,
      attemptedValueFormats: [],
      attempts: [],
      error: null
    };
  }

  function collectTextParamCandidates(item, mgtInspection) {
    var candidates = [];

    if (mgtInspection.component) {
      collectTextParamCandidatesFromProperties(
        mgtInspection.component.properties,
        "getMGTComponent",
        readParamDisplayName(mgtInspection.component),
        null,
        candidates
      );
    }

    collectTextParamCandidatesFromComponents(item.components, candidates);
    candidates.sort(compareTextParamCandidates);
    return candidates;
  }

  function collectTextParamCandidatesFromComponents(components, candidates) {
    if (!components) {
      return;
    }

    var count = readCollectionCount(components);
    for (var i = 0; i < count && i < MAX_COMPONENTS; i++) {
      var component = readCollectionItem(components, i);
      if (!component || !component.properties) {
        continue;
      }

      collectTextParamCandidatesFromProperties(
        component.properties,
        "item.components",
        readParamDisplayName(component),
        i,
        candidates
      );
    }
  }

  function collectTextParamCandidatesFromProperties(properties, source, componentName, componentIndex, candidates) {
    if (!properties) {
      return;
    }

    var preferredNames = ["Caption Text", "Source Text", "Text", "Texto", "Subtitle", "Subtitles", "Subtitulo", "Content", "Message"];
    var i;
    var param;

    if (typeof properties.getParamForDisplayName === "function") {
      for (i = 0; i < preferredNames.length; i++) {
        try {
          param = properties.getParamForDisplayName(preferredNames[i]);
          addTextParamCandidate(
            candidates,
            param,
            source + ".properties.getParamForDisplayName",
            componentName,
            componentIndex,
            null,
            preferredNames[i]
          );
        } catch (ignored) {}
      }
    }

    var count = readCollectionCount(properties);
    for (i = 0; i < count && i < MAX_PARAMS; i++) {
      param = readCollectionItem(properties, i);
      if (param && looksLikeTextParam(param)) {
        addTextParamCandidate(
          candidates,
          param,
          source + ".properties[index]",
          componentName,
          componentIndex,
          i,
          null
        );
      }
    }
  }

  function addTextParamCandidate(candidates, param, source, componentName, componentIndex, paramIndex, requestedName) {
    if (!param) {
      return;
    }

    var displayName = readParamDisplayName(param) || requestedName || "";
    if (!displayName && !requestedName) {
      return;
    }

    if (!requestedName && !looksLikeTextParam(param)) {
      return;
    }

    var matchName = readParamMatchName(param);
    var paramType = readParamType(param);
    if (hasTextParamCandidate(candidates, param, componentIndex, paramIndex, displayName, source)) {
      return;
    }

    candidates.push({
      param: param,
      paramName: displayName,
      matchName: matchName,
      paramType: paramType,
      source: source,
      componentName: componentName,
      componentIndex: componentIndex,
      paramIndex: paramIndex,
      priority: textParamPriority(displayName || requestedName)
    });
  }

  function hasTextParamCandidate(candidates, param, componentIndex, paramIndex, displayName, source) {
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      try {
        if (candidate.param === param) {
          return true;
        }
      } catch (ignored) {}

      if (
        paramIndex !== null &&
        candidate.paramIndex === paramIndex &&
        candidate.componentIndex === componentIndex
      ) {
        return true;
      }

      if (
        paramIndex === null &&
        candidate.paramIndex === null &&
        candidate.componentIndex === componentIndex &&
        candidate.paramName === displayName &&
        candidate.source === source
      ) {
        return true;
      }
    }

    return false;
  }

  function compareTextParamCandidates(left, right) {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    var leftIndex = left.paramIndex === null ? 9999 : left.paramIndex;
    var rightIndex = right.paramIndex === null ? 9999 : right.paramIndex;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    var leftName = safeString(left.paramName);
    var rightName = safeString(right.paramName);
    if (leftName < rightName) {
      return -1;
    }
    if (leftName > rightName) {
      return 1;
    }
    return 0;
  }

  function textParamPriority(name) {
    var normalized = safeString(name).toLowerCase();
    if (normalized === "caption text") {
      return 0;
    }

    if (normalized === "source text") {
      return 1;
    }

    if (normalized === "text") {
      return 2;
    }

    if (normalized.indexOf("caption") >= 0) {
      return 3;
    }

    if (normalized.indexOf("source") >= 0) {
      return 4;
    }

    if (normalized.indexOf("text") >= 0 || normalized.indexOf("texto") >= 0) {
      return 5;
    }

    return 99;
  }

  function buildTextSetValueAttempts(beforeInfo, text, expectedText) {
    var attempts = [];
    var structured = inspectStructuredTextValue(beforeInfo.value);

    addSetValueAttempts(
      attempts,
      "setValue(text, updateUI)",
      text,
      [],
      "directText"
    );
    addSetValueAttempts(
      attempts,
      "setValue(String(text), updateUI)",
      String(text),
      [],
      "directString"
    );

    if (structured.structured) {
      if (structured.kind === "object") {
        var copyUpdate = cloneAndUpdateTextFields(beforeInfo.value, expectedText, 0, [], []);
        var inPlaceUpdate = updateTextFieldsInPlace(beforeInfo.value, expectedText, 0, [], []);

        if (inPlaceUpdate.changed) {
          addSetValueAttempts(
            attempts,
            "setValue(originalObjectWithUpdatedTextFields, updateUI)",
            beforeInfo.value,
            inPlaceUpdate.fields,
            "structuredObjectInPlace"
          );
        }

        if (copyUpdate.changed) {
          addSetValueAttempts(
            attempts,
            "setValue(reconstructedObjectWithUpdatedTextFields, updateUI)",
            copyUpdate.value,
            copyUpdate.fields,
            "structuredObjectClone"
          );
        }

        if (!inPlaceUpdate.changed && !copyUpdate.changed) {
          attempts.push({
            method: "setValue(structuredObjectWithTextField, updateUI)",
            format: "structuredObject",
            updateUI: null,
            updateUILabel: null,
            skipped: true,
            skipReason: "structured object did not expose known text fields or default Caption text",
            structuredFields: []
          });
        }

        return attempts;
      }

      if (structured.kind === "jsonString") {
        var jsonUpdate = cloneAndUpdateTextFields(structured.value, expectedText, 0, [], []);
        if (jsonUpdate.changed) {
          addSetValueAttempts(
            attempts,
            "setValue(reconstructedJsonStringWithUpdatedTextFields, updateUI)",
            jsonStringify(jsonUpdate.value),
            jsonUpdate.fields,
            "jsonStringClone"
          );
        } else {
          attempts.push({
            method: "setValue(reconstructedJsonStringWithTextField, updateUI)",
            format: "jsonString",
            updateUI: null,
            updateUILabel: null,
            skipped: true,
            skipReason: "JSON string did not contain known text fields or default Caption text",
            structuredFields: []
          });
        }

        if (stringContainsDefaultTemplateText(beforeInfo.value)) {
          addSetValueAttempts(
            attempts,
            "setValue(jsonStringWithDefaultCaptionTextReplaced, updateUI)",
            replaceDefaultTemplateText(beforeInfo.value, expectedText),
            ["<string:" + DEFAULT_TEMPLATE_TEXT + ">"],
            "jsonStringDefaultTextReplacement"
          );
        }

        return attempts;
      }

      if (stringContainsDefaultTemplateText(beforeInfo.value)) {
        addSetValueAttempts(
          attempts,
          "setValue(structuredStringWithDefaultCaptionTextReplaced, updateUI)",
          replaceDefaultTemplateText(beforeInfo.value, expectedText),
          ["<string:" + DEFAULT_TEMPLATE_TEXT + ">"],
          "structuredStringDefaultTextReplacement"
        );
      } else {
        attempts.push({
          method: "setValue(reconstructedStructuredStringWithTextField, updateUI)",
          format: "structuredString",
          updateUI: null,
          updateUILabel: null,
          skipped: true,
          skipReason: structured.error || "structured string could not be reconstructed safely",
          structuredFields: []
        });
      }
      return attempts;
    }

    if (stringContainsDefaultTemplateText(beforeInfo.value)) {
      addSetValueAttempts(
        attempts,
        "setValue(stringWithDefaultCaptionTextReplaced, updateUI)",
        replaceDefaultTemplateText(beforeInfo.value, expectedText),
        ["<string:" + DEFAULT_TEMPLATE_TEXT + ">"],
        "plainStringDefaultTextReplacement"
      );
    }

    return attempts;
  }

  function addSetValueAttempts(attempts, method, value, structuredFields, format) {
    for (var i = 0; i < SET_VALUE_UPDATE_UI_OPTIONS.length; i++) {
      attempts.push({
        method: method + " updateUI=" + SET_VALUE_UPDATE_UI_OPTIONS[i].label,
        value: value,
        updateUI: SET_VALUE_UPDATE_UI_OPTIONS[i].value,
        updateUILabel: SET_VALUE_UPDATE_UI_OPTIONS[i].label,
        structuredFields: structuredFields || [],
        format: format
      });
    }
  }

  function summarizeAttemptedValueFormats(attempts) {
    var formats = [];
    for (var i = 0; i < attempts.length; i++) {
      formats.push({
        method: attempts[i].method,
        format: attempts[i].format || null,
        updateUI: attempts[i].updateUI,
        updateUILabel: attempts[i].updateUILabel || null,
        skipped: Boolean(attempts[i].skipped),
        skipReason: attempts[i].skipReason || null,
        structuredFields: attempts[i].structuredFields || [],
        valueType: attempts[i].skipped ? null : typeof attempts[i].value,
        valueKind: attempts[i].skipped ? null : valueKind(attempts[i].value),
        valueSerialized: attempts[i].skipped ? null : serializeDiagnosticValue(attempts[i].value)
      });
    }

    return formats;
  }

  function inspectStructuredTextValue(value) {
    if (value !== null && value !== undefined && typeof value === "object") {
      return {
        structured: true,
        kind: "object",
        value: value,
        error: null
      };
    }

    if (typeof value === "string") {
      var trimmed = trimString(value);
      if (looksLikeJsonString(trimmed)) {
        var parsed = parseJsonString(trimmed);
        return {
          structured: true,
          kind: parsed.ok ? "jsonString" : "structuredString",
          value: parsed.value,
          error: parsed.error
        };
      }
    }

    return {
      structured: false,
      kind: null,
      value: null,
      error: null
    };
  }

  function cloneAndUpdateTextFields(value, text, depth, path, seen) {
    var result = {
      value: value,
      changed: false,
      fields: []
    };

    if (value === null || value === undefined || depth > MAX_STRUCTURE_DEPTH) {
      return result;
    }

    if (typeof value !== "object") {
      return result;
    }

    if (hasSeenObject(seen, value)) {
      return result;
    }
    seen.push(value);

    var output = isArray(value) ? [] : {};
    result.value = output;

    var copiedKeys = [];
    var i;
    if (isArray(value)) {
      for (i = 0; i < value.length; i++) {
        var childPath = path.concat([String(i)]);
        var child = cloneAndUpdateTextFields(value[i], text, depth + 1, childPath, seen);
        output[i] = child.value;
        mergeMutationResult(result, child);
      }
      return result;
    }

    for (var key in value) {
      var keyValue;
      try {
        keyValue = value[key];
      } catch (ignoredRead) {
        continue;
      }

      if (!hasOwn(value, key) || typeof keyValue === "function") {
        continue;
      }

      addUnique(copiedKeys, key, 200);
      copyUpdatedField(value, output, key, text, depth, path, seen, result);
    }

    for (i = 0; i < TEXT_FIELD_NAMES.length; i++) {
      var fieldName = TEXT_FIELD_NAMES[i];
      if (containsValue(copiedKeys, fieldName)) {
        continue;
      }

      try {
        if (value[fieldName] !== undefined) {
          copyUpdatedField(value, output, fieldName, text, depth, path, seen, result);
        }
      } catch (ignored) {}
    }

    return result;
  }

  function copyUpdatedField(source, target, key, text, depth, path, seen, result) {
    var current;
    try {
      current = source[key];
    } catch (error) {
      target[key] = "[read error: " + errorToString(error) + "]";
      return;
    }

    if (key === "fontTextRunLength" && target.fontTextRunLength !== undefined) {
      return;
    }

    var fieldPath = path.concat([String(key)]);
    if (isTextFieldName(key) && canReplaceTextFieldValue(current)) {
      target[key] = String(text);
      result.changed = true;
      result.fields.push(fieldPath.join("."));
      updateFontTextRunLengthIfPresent(source, target, text, path, result);
      return;
    }

    if (typeof current === "string" && stringContainsDefaultTemplateText(current)) {
      target[key] = replaceDefaultTemplateText(current, text);
      result.changed = true;
      result.fields.push(fieldPath.join(".") + ":defaultTextReplacement");
      updateFontTextRunLengthIfPresent(source, target, text, path, result);
      return;
    }

    var child = cloneAndUpdateTextFields(current, text, depth + 1, fieldPath, seen);
    target[key] = child.value;
    mergeMutationResult(result, child);
  }

  function updateTextFieldsInPlace(value, text, depth, path, seen) {
    var result = {
      changed: false,
      fields: []
    };

    if (value === null || value === undefined || depth > MAX_STRUCTURE_DEPTH || typeof value !== "object") {
      return result;
    }

    if (hasSeenObject(seen, value)) {
      return result;
    }
    seen.push(value);

    var i;
    if (isArray(value)) {
      for (i = 0; i < value.length; i++) {
        var arrayChild = updateTextFieldsInPlace(value[i], text, depth + 1, path.concat([String(i)]), seen);
        mergeMutationResult(result, arrayChild);
      }
      return result;
    }

    var visited = [];
    for (i = 0; i < TEXT_FIELD_NAMES.length; i++) {
      var fieldName = TEXT_FIELD_NAMES[i];
      tryUpdateTextFieldInPlace(value, fieldName, text, depth, path, seen, visited, result);
    }

    for (var key in value) {
      var keyValue;
      try {
        keyValue = value[key];
      } catch (ignoredRead) {
        continue;
      }

      if (!hasOwn(value, key) || typeof keyValue === "function" || containsValue(visited, key)) {
        continue;
      }

      tryUpdateTextFieldInPlace(value, key, text, depth, path, seen, visited, result);
    }

    return result;
  }

  function tryUpdateTextFieldInPlace(parent, key, text, depth, path, seen, visited, result) {
    addUnique(visited, key, 200);

    var current;
    try {
      current = parent[key];
    } catch (ignored) {
      return;
    }

    var fieldPath = path.concat([String(key)]);
    if (isTextFieldName(key) && canReplaceTextFieldValue(current)) {
      try {
        parent[key] = String(text);
        result.changed = true;
        result.fields.push(fieldPath.join("."));
        updateFontTextRunLengthInPlaceIfPresent(parent, text, path, result);
      } catch (ignoredSet) {}
      return;
    }

    if (typeof current === "string" && stringContainsDefaultTemplateText(current)) {
      try {
        parent[key] = replaceDefaultTemplateText(current, text);
        result.changed = true;
        result.fields.push(fieldPath.join(".") + ":defaultTextReplacement");
        updateFontTextRunLengthInPlaceIfPresent(parent, text, path, result);
      } catch (ignoredDefaultSet) {}
      return;
    }

    var child = updateTextFieldsInPlace(current, text, depth + 1, fieldPath, seen);
    mergeMutationResult(result, child);
  }

  function updateFontTextRunLengthIfPresent(source, target, text, path, result) {
    try {
      if (!source || source.fontTextRunLength === undefined) {
        return;
      }

      var replacement = replacementTextLength(text);
      if (typeof source.fontTextRunLength === "number") {
        target.fontTextRunLength = replacement;
        addFontTextRunLengthField(path, result);
      } else if (typeof source.fontTextRunLength === "string" && isNumericString(source.fontTextRunLength)) {
        target.fontTextRunLength = String(replacement);
        addFontTextRunLengthField(path, result);
      } else if (target.fontTextRunLength === undefined) {
        target.fontTextRunLength = source.fontTextRunLength;
      }
    } catch (ignored) {}
  }

  function updateFontTextRunLengthInPlaceIfPresent(parent, text, path, result) {
    try {
      if (!parent || parent.fontTextRunLength === undefined) {
        return;
      }

      var replacement = replacementTextLength(text);
      if (typeof parent.fontTextRunLength === "number") {
        parent.fontTextRunLength = replacement;
        addFontTextRunLengthField(path, result);
      } else if (typeof parent.fontTextRunLength === "string" && isNumericString(parent.fontTextRunLength)) {
        parent.fontTextRunLength = String(replacement);
        addFontTextRunLengthField(path, result);
      }
    } catch (ignored) {}
  }

  function addFontTextRunLengthField(path, result) {
    result.fields.push(path.concat(["fontTextRunLength"]).join("."));
  }

  function replacementTextLength(text) {
    return String(text).length;
  }

  function isNumericString(value) {
    return /^-?\d+(?:\.\d+)?$/.test(trimString(value));
  }

  function mergeMutationResult(target, source) {
    if (!source || !source.changed) {
      return;
    }

    target.changed = true;
    for (var i = 0; i < source.fields.length; i++) {
      addUnique(target.fields, source.fields[i], 200);
    }
  }

  function canReplaceTextFieldValue(value) {
    var type = typeof value;
    return (
      value === null ||
      value === undefined ||
      type === "string"
    );
  }

  function isTextFieldName(name) {
    var normalized = safeString(name).toLowerCase();
    for (var i = 0; i < TEXT_FIELD_NAMES.length; i++) {
      if (normalized === TEXT_FIELD_NAMES[i].toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  function readParamValueInfo(param) {
    var info = {
      available: false,
      ok: false,
      error: null,
      value: null,
      valueDiagnostic: null,
      typeofValue: "undefined",
      valueKind: "undefined"
    };

    if (!param || typeof param.getValue !== "function") {
      return info;
    }

    info.available = true;
    try {
      info.value = param.getValue();
      info.ok = true;
      info.typeofValue = typeof info.value;
      info.valueKind = valueKind(info.value);
      info.valueDiagnostic = toDiagnosticValue(info.value, 0, []);
    } catch (error) {
      info.error = errorToString(error);
    }

    return info;
  }

  function describeFullValueDiagnostic(candidate, valueInfo, expectedText) {
    var value = valueInfo ? valueInfo.value : null;
    var stringValue = typeof value === "string" ? value : null;
    var parsed = stringValue !== null && looksLikeJsonString(trimString(stringValue))
      ? parseJsonString(trimString(stringValue))
      : null;

    return {
      displayName: candidate ? candidate.paramName : null,
      matchName: candidate ? candidate.matchName : null,
      type: candidate ? candidate.paramType : null,
      source: candidate ? candidate.source : null,
      componentName: candidate ? candidate.componentName : null,
      componentIndex: candidate ? candidate.componentIndex : null,
      paramIndex: candidate ? candidate.paramIndex : null,
      getValueAvailable: valueInfo ? valueInfo.available : false,
      getValueOk: valueInfo ? valueInfo.ok : false,
      getValueError: valueInfo ? valueInfo.error : null,
      typeofValue: valueInfo ? valueInfo.typeofValue : "undefined",
      valueKind: valueInfo ? valueInfo.valueKind : "undefined",
      valueSerialized: serializeDiagnosticValue(value),
      isString: typeof value === "string",
      isObject: value !== null && value !== undefined && typeof value === "object",
      keys: value !== null && value !== undefined && typeof value === "object" ? collectKeys(value, 60) : [],
      looksLikeJsonString: stringValue !== null ? looksLikeJsonString(trimString(stringValue)) : false,
      jsonParseOk: parsed ? parsed.ok : false,
      jsonParseError: parsed ? parsed.error : null,
      jsonParsedKind: parsed && parsed.ok ? valueKind(parsed.value) : null,
      jsonParsedKeys: parsed && parsed.ok && parsed.value && typeof parsed.value === "object"
        ? collectKeys(parsed.value, 60)
        : [],
      containsExpectedText: valueContainsText(value, expectedText),
      containsDefaultTemplateText: valueContainsText(value, DEFAULT_TEMPLATE_TEXT)
    };
  }

  function serializeDiagnosticValue(value) {
    try {
      return truncateString(jsonStringify(toDiagnosticValue(value, 0, [])), MAX_VALUE_CHARS);
    } catch (error) {
      return "[serialize error: " + errorToString(error) + "]";
    }
  }

  function createTextVerification(afterInfo, expectedText, fallbackStatus) {
    var verification = {
      status: fallbackStatus,
      expectedSample: truncateString(expectedText, 180),
      defaultTemplateSample: DEFAULT_TEMPLATE_TEXT,
      getValueAvailable: false,
      getValueOk: false,
      getValueError: null,
      containsExpected: false,
      containsDefaultTemplateText: false,
      defaultTemplateTextRemoved: false,
      matchedNeedle: null,
      checkedValueType: null,
      checkedValueKind: null,
      checkedValueSample: null
    };

    if (!afterInfo) {
      return verification;
    }

    verification.getValueAvailable = afterInfo.available;
    verification.getValueOk = afterInfo.ok;
    verification.getValueError = afterInfo.error;
    verification.checkedValueType = afterInfo.typeofValue;
    verification.checkedValueKind = afterInfo.valueKind;
    verification.checkedValueSample = truncateString(valueToSearchText(afterInfo.value, 0, []), 240);

    if (!afterInfo.available) {
      verification.status = "getValue_unavailable";
      return verification;
    }

    if (!afterInfo.ok) {
      verification.status = "getValue_failed";
      return verification;
    }

    var match = findExpectedTextMatch(afterInfo.value, expectedText);
    verification.containsExpected = match.contains;
    verification.containsDefaultTemplateText = valueContainsText(afterInfo.value, DEFAULT_TEMPLATE_TEXT);
    verification.defaultTemplateTextRemoved = !verification.containsDefaultTemplateText;
    verification.matchedNeedle = match.needle;
    verification.status = match.contains ? "verified" : "failed";
    return verification;
  }

  function valueContainsText(value, text) {
    if (!text) {
      return false;
    }

    return normalizeForVerification(valueToSearchText(value, 0, [])).indexOf(normalizeForVerification(text)) >= 0;
  }

  function stringContainsDefaultTemplateText(value) {
    return typeof value === "string" && valueContainsText(value, DEFAULT_TEMPLATE_TEXT);
  }

  function replaceDefaultTemplateText(value, text) {
    return safeString(value).replace(new RegExp(escapeRegExp(DEFAULT_TEMPLATE_TEXT), "gi"), String(text));
  }

  function escapeRegExp(value) {
    return safeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findExpectedTextMatch(value, expectedText) {
    var haystack = normalizeForVerification(valueToSearchText(value, 0, []));
    var expected = normalizeForVerification(expectedText);
    var needles = [];
    var i;

    addUnique(needles, expected, 20);
    if (expected.length > 80) {
      addUnique(needles, expected.substring(0, 80), 20);
    }
    if (expected.length > 32) {
      addUnique(needles, expected.substring(0, 32), 20);
    }

    var words = expected.split(" ");
    var phrase = "";
    for (i = 0; i < words.length && i < 4; i++) {
      phrase += (phrase ? " " : "") + words[i];
    }
    if (phrase.length >= 4) {
      addUnique(needles, phrase, 20);
    }

    for (i = 0; i < words.length && needles.length < 20; i++) {
      if (words[i].length >= 5) {
        addUnique(needles, words[i], 20);
      }
    }

    for (i = 0; i < needles.length; i++) {
      if (needles[i] && haystack.indexOf(needles[i]) >= 0) {
        return {
          contains: true,
          needle: needles[i]
        };
      }
    }

    var compactHaystack = haystack.replace(/\s+/g, "");
    var compactExpected = expected.replace(/\s+/g, "");
    if (compactExpected && compactHaystack.indexOf(compactExpected) >= 0) {
      return {
        contains: true,
        needle: compactExpected
      };
    }

    return {
      contains: false,
      needle: null
    };
  }

  function valueToSearchText(value, depth, seen) {
    if (value === null || value === undefined) {
      return "";
    }

    var type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
      return String(value);
    }

    if (type !== "object" || depth > MAX_STRUCTURE_DEPTH || hasSeenObject(seen, value)) {
      return "";
    }
    seen.push(value);

    var parts = [];
    var i;
    for (i = 0; i < TEXT_FIELD_NAMES.length; i++) {
      try {
        var fieldValue = value[TEXT_FIELD_NAMES[i]];
        if (fieldValue !== undefined) {
          addSearchTextPart(parts, valueToSearchText(fieldValue, depth + 1, seen));
        }
      } catch (ignored) {}
    }

    if (isArray(value)) {
      for (i = 0; i < value.length && i < 40; i++) {
        addSearchTextPart(parts, valueToSearchText(value[i], depth + 1, seen));
      }
      return parts.join(" ");
    }

    for (var key in value) {
      var keyValue;
      try {
        keyValue = value[key];
      } catch (ignoredRead) {
        continue;
      }

      if (!hasOwn(value, key) || typeof keyValue === "function") {
        continue;
      }

      try {
        addSearchTextPart(parts, valueToSearchText(keyValue, depth + 1, seen));
      } catch (ignoredToo) {}
    }

    return parts.join(" ");
  }

  function addSearchTextPart(parts, value) {
    if (value && trimString(value).length > 0) {
      parts.push(value);
    }
  }

  function normalizeForVerification(value) {
    return trimString(safeString(value).toLowerCase()).replace(/\s+/g, " ");
  }

  function describeValueStructure(value, depth, seen) {
    var structure = {
      type: typeof value,
      kind: valueKind(value),
      keys: [],
      textFields: [],
      sample: null
    };

    if (value === null || value === undefined || typeof value !== "object" || depth > MAX_STRUCTURE_DEPTH) {
      structure.sample = toDiagnosticValue(value, depth, seen);
      return structure;
    }

    if (hasSeenObject(seen, value)) {
      structure.sample = "[circular]";
      return structure;
    }
    structure.keys = collectKeys(value, 30);
    structure.textFields = collectTextFieldSnapshots(value);
    structure.sample = toDiagnosticValue(value, depth, []);
    return structure;
  }

  function collectTextFieldSnapshots(value) {
    var fields = [];
    if (!value || typeof value !== "object") {
      return fields;
    }

    for (var i = 0; i < TEXT_FIELD_NAMES.length; i++) {
      var key = TEXT_FIELD_NAMES[i];
      try {
        if (value[key] !== undefined) {
          fields.push({
            name: key,
            type: typeof value[key],
            kind: valueKind(value[key]),
            value: toDiagnosticValue(value[key], 1, [])
          });
        }
      } catch (error) {
        fields.push({
          name: key,
          error: errorToString(error)
        });
      }
    }

    return fields;
  }

  function toDiagnosticValue(value, depth, seen) {
    if (value === null || value === undefined) {
      return value === undefined ? "[undefined]" : null;
    }

    var type = typeof value;
    if (type === "string") {
      return truncateString(value, MAX_VALUE_CHARS);
    }

    if (type === "number" || type === "boolean") {
      return value;
    }

    if (type === "function") {
      return "[function]";
    }

    if (type !== "object") {
      return safeString(value);
    }

    if (depth > MAX_STRUCTURE_DEPTH) {
      return valueKind(value);
    }

    if (hasSeenObject(seen, value)) {
      return "[circular]";
    }
    seen.push(value);

    if (isArray(value)) {
      var arrayValue = [];
      for (var i = 0; i < value.length && i < 30; i++) {
        arrayValue.push(toDiagnosticValue(value[i], depth + 1, seen));
      }
      if (value.length > 30) {
        arrayValue.push("... +" + String(value.length - 30) + " items");
      }
      return arrayValue;
    }

    var objectValue = {
      __kind: valueKind(value)
    };
    var count = 0;

    for (var key in value) {
      if (!hasOwn(value, key)) {
        continue;
      }

      if (count >= 30) {
        objectValue.__truncated = true;
        break;
      }

      try {
        var keyValue = value[key];
        if (typeof keyValue !== "function") {
          objectValue[key] = toDiagnosticValue(keyValue, depth + 1, seen);
          count++;
        }
      } catch (error) {
        objectValue[key] = "[read error: " + errorToString(error) + "]";
        count++;
      }
    }

    for (var j = 0; j < TEXT_FIELD_NAMES.length && count < 30; j++) {
      var fieldName = TEXT_FIELD_NAMES[j];
      if (hasOwn(objectValue, fieldName)) {
        continue;
      }

      try {
        if (value[fieldName] !== undefined) {
          objectValue[fieldName] = toDiagnosticValue(value[fieldName], depth + 1, seen);
          count++;
        }
      } catch (ignored) {}
    }

    return objectValue;
  }

  function readParamDisplayName(param) {
    return readStringFromMethod(param, "getDisplayName") ||
      readStringFromField(param, "displayName") ||
      readStringFromField(param, "name");
  }

  function readParamMatchName(param) {
    return readStringFromMethod(param, "getMatchName") ||
      readStringFromField(param, "matchName");
  }

  function readParamType(param) {
    var methodNames = ["getType", "getValueType", "getParamType"];
    var fieldNames = ["type", "valueType", "paramType", "dataType"];
    var i;

    for (i = 0; i < methodNames.length; i++) {
      try {
        if (param && typeof param[methodNames[i]] === "function") {
          return safeScalar(param[methodNames[i]]());
        }
      } catch (ignored) {}
    }

    for (i = 0; i < fieldNames.length; i++) {
      try {
        if (param && param[fieldNames[i]] !== undefined) {
          return safeScalar(param[fieldNames[i]]);
        }
      } catch (ignoredToo) {}
    }

    return null;
  }

  function readStringFromMethod(object, methodName) {
    try {
      if (object && typeof object[methodName] === "function") {
        return safeString(object[methodName]());
      }
    } catch (ignored) {}

    return "";
  }

  function readStringFromField(object, fieldName) {
    try {
      if (object && object[fieldName] !== null && object[fieldName] !== undefined) {
        return safeString(object[fieldName]);
      }
    } catch (ignored) {}

    return "";
  }

  function parseJsonString(value) {
    var result = {
      ok: false,
      value: null,
      error: null
    };

    try {
      if (typeof JSON !== "undefined" && JSON && typeof JSON.parse === "function") {
        result.value = JSON.parse(value);
      } else {
        result.value = eval("(" + value + ")");
      }
      result.ok = true;
    } catch (error) {
      result.error = "JSON parse failed: " + errorToString(error);
    }

    return result;
  }

  function looksLikeJsonString(value) {
    if (!value) {
      return false;
    }

    var first = value.charAt(0);
    return first === "{" || first === "[";
  }

  function trimString(value) {
    return safeString(value).replace(/^\s+|\s+$/g, "");
  }

  function truncateString(value, limit) {
    var text = safeString(value);
    if (text.length <= limit) {
      return text;
    }

    return text.substring(0, limit) + "...[truncated " + String(text.length - limit) + " chars]";
  }

  function hasSeenObject(seen, value) {
    for (var i = 0; i < seen.length; i++) {
      try {
        if (seen[i] === value) {
          return true;
        }
      } catch (ignored) {}
    }

    return false;
  }

  function containsValue(values, value) {
    for (var i = 0; i < values.length; i++) {
      if (values[i] === value) {
        return true;
      }
    }

    return false;
  }

  function inspectMgtComponent(item) {
    var inspection = {
      attempted: false,
      typeofGetMGTComponent: typeof item.getMGTComponent,
      isNull: false,
      valueKind: null,
      error: null,
      component: null,
      summary: null
    };

    if (typeof item.getMGTComponent !== "function") {
      return inspection;
    }

    inspection.attempted = true;
    try {
      var component = item.getMGTComponent();
      inspection.valueKind = valueKind(component);
      inspection.isNull = component === null || component === undefined;
      if (component) {
        inspection.component = component;
        inspection.summary = inspectComponent(component, null);
      }
    } catch (error) {
      inspection.error = errorToString(error);
    }

    return inspection;
  }

  function inspectTrackItem(item, mgtInspection) {
    return {
      itemName: safeString(item.name),
      itemType: safeScalar(item.type),
      itemMediaType: safeScalar(item.mediaType),
      itemKeys: collectKeys(item, MAX_KEYS),
      itemReflectProperties: collectReflectProperties(item, MAX_KEYS),
      typeofGetMGTComponent: mgtInspection.typeofGetMGTComponent,
      mgtComponentAttempted: mgtInspection.attempted,
      mgtComponentIsNull: mgtInspection.isNull,
      mgtComponentValueKind: mgtInspection.valueKind,
      mgtComponentError: mgtInspection.error,
      mgtComponentSummary: mgtInspection.summary,
      componentsExists: item.components !== null && item.components !== undefined,
      componentsValueKind: valueKind(item.components),
      componentsCount: item.components ? readCollectionCount(item.components) : null,
      components: inspectComponents(item.components),
      typeofGetComponentChain: typeof item.getComponentChain,
      getComponentChain: inspectComponentChain(item)
    };
  }

  function inspectMogrtVisualAudit(item, mgtInspection, textResult, availableProperties, stylePayload) {
    var visualGroups = inspectVisualParamGroups(item, mgtInspection);
    var textInventory = inspectTextParamInventory(item, mgtInspection);
    var warnings = createVisualAuditWarnings(visualGroups, textInventory, textResult);

    return {
      note: "This is a parameter audit only. It verifies exposed MOGRT controls, not final Program Monitor pixels.",
      diagnosticMode: false,
      diagnosticExpectation: null,
      expressionInspection: "Premiere scripting does not expose After Effects expressions in this bridge; expression overrides must be checked in the AE template.",
      resolutionAssumption: "Position risk checks assume 1920x1080 unless exposed values look normalized or percentage-based.",
      selectedTextProperty: textResult ? textResult.selectedTextProperty : null,
      selectedTextValueAfter: textResult ? textResult.textAfter : null,
      selectedTextVerification: textResult ? textResult.textVerification : null,
      selectedTextCandidateCount: textResult && textResult.textCandidates ? textResult.textCandidates.length : 0,
      availableProperties: availableProperties || [],
      textParamInventory: textInventory,
      paramGroups: visualGroups,
      warnings: warnings
    };
  }

  function inspectTextParamInventory(item, mgtInspection) {
    var candidates = collectTextParamCandidates(item, mgtInspection);
    var inventory = [];

    for (var i = 0; i < candidates.length && i < MAX_VISUAL_PARAMS; i++) {
      inventory.push(inspectParamSnapshot(
        candidates[i].param,
        candidates[i].source,
        candidates[i].componentName,
        candidates[i].componentIndex,
        candidates[i].paramIndex,
        ["sourceText"]
      ));
    }

    return inventory;
  }

  function inspectAllMogrtProperties(item, mgtInspection) {
    var properties = [];

    if (mgtInspection.component) {
      collectAllMogrtPropertiesFromProperties(
        mgtInspection.component.properties,
        "getMGTComponent.properties[index]",
        readParamDisplayName(mgtInspection.component),
        null,
        properties
      );
    }

    collectAllMogrtPropertiesFromComponents(item.components, properties);
    return properties;
  }

  function collectAllMogrtPropertiesFromComponents(components, output) {
    if (!components) {
      return;
    }

    var count = readCollectionCount(components);
    for (var i = 0; i < count && i < MAX_COMPONENTS; i++) {
      var component = readCollectionItem(components, i);
      if (!component || !component.properties) {
        continue;
      }

      collectAllMogrtPropertiesFromProperties(
        component.properties,
        "item.components[" + String(i) + "].properties[index]",
        readParamDisplayName(component),
        i,
        output
      );
    }
  }

  function collectAllMogrtPropertiesFromProperties(properties, source, componentName, componentIndex, output) {
    if (!properties) {
      return;
    }

    var count = readCollectionCount(properties);
    for (var i = 0; i < count && i < MAX_VISUAL_PARAMS; i++) {
      var param = readCollectionItem(properties, i);
      if (!param) {
        continue;
      }

      addAvailablePropertySnapshot(output, inspectParamSnapshot(
        param,
        source,
        componentName,
        componentIndex,
        i,
        getVisualParamGroupKeys(param)
      ));
    }
  }

  function addAvailablePropertySnapshot(output, snapshot) {
    for (var i = 0; i < output.length; i++) {
      if (
        output[i].source === snapshot.source &&
        output[i].componentIndex === snapshot.componentIndex &&
        output[i].index === snapshot.index &&
        output[i].displayName === snapshot.displayName
      ) {
        return;
      }
    }

    output.push(snapshot);
  }

  function inspectVisualParamGroups(item, mgtInspection) {
    var groups = createEmptyVisualParamGroups();

    if (mgtInspection.component) {
      collectVisualParamsFromProperties(
        mgtInspection.component.properties,
        "getMGTComponent.properties[index]",
        readParamDisplayName(mgtInspection.component),
        null,
        groups
      );
    }

    collectVisualParamsFromComponents(item.components, groups);
    return groups;
  }

  function createEmptyVisualParamGroups() {
    var groups = {};

    for (var i = 0; i < VISUAL_PARAM_GROUPS.length; i++) {
      groups[VISUAL_PARAM_GROUPS[i].key] = [];
    }

    return groups;
  }

  function collectVisualParamsFromComponents(components, groups) {
    if (!components) {
      return;
    }

    var count = readCollectionCount(components);
    for (var i = 0; i < count && i < MAX_COMPONENTS; i++) {
      var component = readCollectionItem(components, i);
      if (!component || !component.properties) {
        continue;
      }

      collectVisualParamsFromProperties(
        component.properties,
        "item.components[" + String(i) + "].properties[index]",
        readParamDisplayName(component),
        i,
        groups
      );
    }
  }

  function collectVisualParamsFromProperties(properties, source, componentName, componentIndex, groups) {
    if (!properties) {
      return;
    }

    var count = readCollectionCount(properties);
    for (var i = 0; i < count && i < MAX_VISUAL_PARAMS; i++) {
      var param = readCollectionItem(properties, i);
      if (!param) {
        continue;
      }

      var groupKeys = getVisualParamGroupKeys(param);
      if (groupKeys.length === 0) {
        continue;
      }

      var snapshot = inspectParamSnapshot(param, source, componentName, componentIndex, i, groupKeys);
      for (var groupIndex = 0; groupIndex < groupKeys.length; groupIndex++) {
        addParamSnapshotToGroup(groups[groupKeys[groupIndex]], snapshot);
      }
    }
  }

  function addParamSnapshotToGroup(group, snapshot) {
    if (!group) {
      return;
    }

    for (var i = 0; i < group.length; i++) {
      if (
        group[i].source === snapshot.source &&
        group[i].componentIndex === snapshot.componentIndex &&
        group[i].index === snapshot.index &&
        group[i].displayName === snapshot.displayName
      ) {
        return;
      }
    }

    if (group.length < MAX_VISUAL_PARAMS) {
      group.push(snapshot);
    }
  }

  function inspectParamSnapshot(param, source, componentName, componentIndex, paramIndex, groupKeys) {
    var valueInfo = readParamValueInfo(param);
    var displayName = readParamDisplayName(param);
    var matchName = readParamMatchName(param);
    var type = readParamType(param);
    var snapshot = {
      name: displayName || matchName || "(unnamed)",
      propertyName: displayName || matchName || "(unnamed)",
      index: paramIndex,
      displayName: displayName,
      matchName: matchName,
      type: type,
      source: source,
      componentName: componentName,
      componentIndex: componentIndex,
      groups: groupKeys,
      value: valueInfo.valueDiagnostic,
      currentValue: valueInfo.valueDiagnostic,
      typeofValue: valueInfo.typeofValue,
      valueKind: valueInfo.valueKind,
      getValueAvailable: valueInfo.available,
      getValueOk: valueInfo.ok,
      getValueError: valueInfo.error,
      typeofSetValue: typeof param.setValue,
      keys: collectKeys(param, 20),
      reflectProperties: collectReflectProperties(param, 20),
      coordinateSpaceHint: inferCoordinateSpaceHint(groupKeys, valueInfo.value),
      risks: []
    };

    snapshot.risks = createVisualParamRisks(snapshot, valueInfo.value);
    return snapshot;
  }

  function getVisualParamGroupKeys(param) {
    var text = normalizeParamNameForSearch(
      readParamDisplayName(param) + " " + readParamMatchName(param) + " " + safeString(readParamType(param))
    );
    var keys = [];

    for (var i = 0; i < VISUAL_PARAM_GROUPS.length; i++) {
      if (matchesAnyKeyword(text, VISUAL_PARAM_GROUPS[i].keywords)) {
        addUnique(keys, VISUAL_PARAM_GROUPS[i].key, VISUAL_PARAM_GROUPS.length);
      }
    }

    return keys;
  }

  function matchesAnyKeyword(text, keywords) {
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) >= 0) {
        return true;
      }
    }

    return false;
  }

  function createVisualParamRisks(snapshot, value) {
    var risks = [];
    var groups = snapshot.groups || [];
    var name = normalizeParamNameForSearch(snapshot.displayName + " " + snapshot.matchName);
    var numbers = extractNumbersFromValue(value, 0, []);

    if (containsValue(groups, "opacity") && hasZeroLikeOpacity(numbers, value)) {
      risks.push("opacity_or_alpha_is_zero");
    }

    if (containsValue(groups, "scale") && hasZeroLikeScale(numbers, value)) {
      risks.push("scale_is_zero_or_negative");
    }

    if (containsValue(groups, "position") && hasOutOfFramePosition(numbers)) {
      risks.push("position_may_be_outside_1920x1080_frame");
    }

    if (
      (containsValue(groups, "colorFill") || containsValue(groups, "fillColor") || containsValue(groups, "strokeColor")) &&
      looksLikeBlackColor(numbers, name)
    ) {
      risks.push("fill_or_color_may_be_black");
    }

    if (containsValue(groups, "visibility") && looksDisabledOrHidden(value)) {
      risks.push("visibility_or_enabled_is_off");
    }

    return risks;
  }

  function inferCoordinateSpaceHint(groups, value) {
    groups = groups || [];
    var numbers = extractNumbersFromValue(value, 0, []);
    if (numbers.length === 0) {
      return null;
    }

    if (containsValue(groups, "position")) {
      if (numbers.length >= 2 && Math.abs(numbers[0]) <= 2 && Math.abs(numbers[1]) <= 2) {
        return "normalized_0_to_1_or_-1_to_1";
      }

      if (numbers.length >= 2 && Math.abs(numbers[0]) <= 100 && Math.abs(numbers[1]) <= 100) {
        return "percentage";
      }

      return "pixels_or_sequence_space";
    }

    if (containsValue(groups, "scale")) {
      if (Math.abs(numbers[0]) <= 2) {
        return "normalized_scale";
      }

      return "percent_scale";
    }

    return null;
  }

  function createVisualAuditWarnings(groups, textInventory, textResult) {
    var warnings = [];

    if (!textResult || !textResult.ok) {
      warnings.push("Text parameter did not verify; visual audit cannot confirm text binding.");
    }

    if (textInventory.length === 0) {
      warnings.push("No exposed Source Text / Caption Text / Text parameter was found.");
    }

    if (textInventory.length > 1) {
      warnings.push(
        "Multiple text-like parameters are exposed; confirm the selected text parameter is the visible text layer."
      );
    }

    if (groups.backgroundMask.length > 0) {
      warnings.push("Background/mask-like parameters are exposed; check whether a shape layer is above or covering the text in the template.");
    }

    if (groups.opacity.length === 0) {
      warnings.push("No exposed opacity parameter found; check layer opacity in After Effects if Program Monitor is black.");
    }

    addGroupRiskWarnings(warnings, groups.opacity, "Opacity/alpha risk");
    addGroupRiskWarnings(warnings, groups.position, "Position risk");
    addGroupRiskWarnings(warnings, groups.scale, "Scale risk");
    addGroupRiskWarnings(warnings, groups.fillColor, "Fill color risk");
    addGroupRiskWarnings(warnings, groups.strokeColor, "Stroke color risk");
    addGroupRiskWarnings(warnings, groups.strokeWidth, "Stroke width risk");
    addGroupRiskWarnings(warnings, groups.shadow, "Shadow risk");
    addGroupRiskWarnings(warnings, groups.fontSize, "Font size risk");
    addGroupRiskWarnings(warnings, groups.colorFill, "Color/fill risk");
    addGroupRiskWarnings(warnings, groups.visibility, "Visibility/enabled risk");
    addGroupRiskWarnings(warnings, groups.backgroundMask, "Background/mask risk");

    return warnings;
  }

  function addGroupRiskWarnings(warnings, group, prefix) {
    for (var i = 0; i < group.length; i++) {
      if (!group[i].risks || group[i].risks.length === 0) {
        continue;
      }

      warnings.push(
        prefix + " on " + (group[i].displayName || "(unnamed)") + ": " + group[i].risks.join(", ")
      );
    }
  }

  function normalizeParamNameForSearch(value) {
    return safeString(value)
      .toLowerCase()
      .replace(/[\u00e1\u00e0\u00e2\u00e4]/g, "a")
      .replace(/[\u00e9\u00e8\u00ea\u00eb]/g, "e")
      .replace(/[\u00ed\u00ec\u00ee\u00ef]/g, "i")
      .replace(/[\u00f3\u00f2\u00f4\u00f6]/g, "o")
      .replace(/[\u00fa\u00f9\u00fb\u00fc]/g, "u")
      .replace(/\u00f1/g, "n");
  }

  function extractNumbersFromValue(value, depth, seen) {
    var numbers = [];
    collectNumbersFromValue(value, depth, seen, numbers);
    return numbers;
  }

  function collectNumbersFromValue(value, depth, seen, numbers) {
    if (numbers.length >= 24 || depth > MAX_STRUCTURE_DEPTH) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    var type = typeof value;
    if (type === "number") {
      if (isFinite(value)) {
        numbers.push(value);
      }
      return;
    }

    if (type === "boolean") {
      numbers.push(value ? 1 : 0);
      return;
    }

    if (type === "string") {
      collectNumbersFromString(value, numbers);
      return;
    }

    if (type !== "object" || hasSeenObject(seen, value)) {
      return;
    }
    seen.push(value);

    var i;
    if (isArray(value)) {
      for (i = 0; i < value.length && numbers.length < 24; i++) {
        collectNumbersFromValue(value[i], depth + 1, seen, numbers);
      }
      return;
    }

    for (var key in value) {
      if (!hasOwn(value, key) || numbers.length >= 24) {
        continue;
      }

      try {
        if (typeof value[key] !== "function") {
          collectNumbersFromValue(value[key], depth + 1, seen, numbers);
        }
      } catch (ignored) {}
    }
  }

  function collectNumbersFromString(value, numbers) {
    var regex = /-?\d+(?:\.\d+)?/g;
    var match;
    while (numbers.length < 24 && (match = regex.exec(value)) !== null) {
      var parsed = Number(match[0]);
      if (isFinite(parsed)) {
        numbers.push(parsed);
      }
    }
  }

  function hasZeroLikeOpacity(numbers, value) {
    if (typeof value === "boolean") {
      return value === false;
    }

    if (numbers.length === 0) {
      return false;
    }

    return Math.abs(numbers[0]) <= 0.0001;
  }

  function hasZeroLikeScale(numbers, value) {
    if (typeof value === "boolean") {
      return value === false;
    }

    if (numbers.length === 0) {
      return false;
    }

    if (numbers.length === 1) {
      return numbers[0] <= 0.0001;
    }

    return numbers[0] <= 0.0001 || numbers[1] <= 0.0001;
  }

  function hasOutOfFramePosition(numbers) {
    if (numbers.length < 2) {
      return false;
    }

    var x = numbers[0];
    var y = numbers[1];
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) {
      return false;
    }

    return x < -10 || x > 1930 || y < -10 || y > 1090;
  }

  function looksLikeBlackColor(numbers, name) {
    if (numbers.length < 3) {
      return false;
    }

    if (name.indexOf("alpha") >= 0 || name.indexOf("opacity") >= 0 || name.indexOf("opacidad") >= 0) {
      return false;
    }

    return Math.abs(numbers[0]) <= 0.0001 &&
      Math.abs(numbers[1]) <= 0.0001 &&
      Math.abs(numbers[2]) <= 0.0001;
  }

  function looksDisabledOrHidden(value) {
    if (value === false) {
      return true;
    }

    if (typeof value === "number") {
      return value === 0;
    }

    if (typeof value === "string") {
      var normalized = normalizeParamNameForSearch(value);
      return normalized === "false" ||
        normalized === "off" ||
        normalized === "hidden" ||
        normalized === "disabled" ||
        normalized === "0";
    }

    var numbers = extractNumbersFromValue(value, 0, []);
    return numbers.length > 0 && numbers[0] === 0;
  }

  function inspectComponents(components) {
    var summaries = [];
    if (!components) {
      return summaries;
    }

    var count = readCollectionCount(components);
    for (var i = 0; i < count && i < MAX_COMPONENTS; i++) {
      var component = readCollectionItem(components, i);
      if (component) {
        summaries.push(inspectComponent(component, i));
      }
    }

    return summaries;
  }

  function inspectComponent(component, index) {
    var properties = component.properties;
    return {
      index: index,
      displayName: readParamDisplayName(component),
      matchName: readParamMatchName(component),
      keys: collectKeys(component, MAX_KEYS),
      reflectProperties: collectReflectProperties(component, MAX_KEYS),
      propertiesExists: properties !== null && properties !== undefined,
      propertiesValueKind: valueKind(properties),
      propertiesCount: properties ? readCollectionCount(properties) : null,
      textParamCandidates: inspectTextParamCandidates(properties)
    };
  }

  function inspectTextParamCandidates(properties) {
    var candidates = [];
    if (!properties) {
      return candidates;
    }

    var count = readCollectionCount(properties);
    for (var i = 0; i < count && i < MAX_PARAMS; i++) {
      var param = readCollectionItem(properties, i);
      if (!param) {
        continue;
      }

      if (looksLikeTextParam(param)) {
        var valueInfo = readParamValueInfo(param);
        candidates.push({
          index: i,
          displayName: readParamDisplayName(param),
          matchName: readParamMatchName(param),
          type: readParamType(param),
          valueBefore: valueInfo.valueDiagnostic,
          typeofBefore: valueInfo.typeofValue,
          valueKind: valueInfo.valueKind,
          getValueAvailable: valueInfo.available,
          getValueOk: valueInfo.ok,
          getValueError: valueInfo.error,
          typeofSetValue: typeof param.setValue,
          keys: collectKeys(param, 20),
          reflectProperties: collectReflectProperties(param, 20)
        });
      }
    }

    return candidates;
  }

  function inspectComponentChain(item) {
    var result = {
      exists: typeof item.getComponentChain === "function",
      valueKind: null,
      keys: [],
      reflectProperties: [],
      count: null,
      error: null
    };

    if (!result.exists) {
      return result;
    }

    try {
      var chain = item.getComponentChain();
      result.valueKind = valueKind(chain);
      result.keys = collectKeys(chain, MAX_KEYS);
      result.reflectProperties = collectReflectProperties(chain, MAX_KEYS);
      result.count = readCollectionCount(chain);
    } catch (error) {
      result.error = errorToString(error);
    }

    return result;
  }

  function looksLikeTextParam(param) {
    var name = readParamDisplayName(param).toLowerCase();
    if (!name) {
      return false;
    }

    return (
      name === "text" ||
      name === "source text" ||
      name === "caption text" ||
      name.indexOf("text") >= 0 ||
      name.indexOf("texto") >= 0 ||
      name.indexOf("caption") >= 0 ||
      name.indexOf("source") >= 0
    );
  }

  function trySetTrackItemEnd(item, endTicks) {
    var result = {
      ok: false,
      error: null
    };

    try {
      var endTime = new Time();
      endTime.ticks = endTicks;
      item.end = endTime;
      result.ok = true;
      return result;
    } catch (error) {
      result.error = errorToString(error);
      return result;
    }
  }

  function readCollectionCount(collection) {
    if (!collection) {
      return 0;
    }

    if (typeof collection.numItems === "number") {
      return collection.numItems;
    }

    if (typeof collection.length === "number") {
      return collection.length;
    }

    return 0;
  }

  function readCollectionItem(collection, index) {
    try {
      if (collection[index]) {
        return collection[index];
      }
    } catch (ignored) {}

    try {
      if (typeof collection.getParamAtIndex === "function") {
        return collection.getParamAtIndex(index);
      }
    } catch (ignoredToo) {}

    try {
      if (typeof collection.getComponentAtIndex === "function") {
        return collection.getComponentAtIndex(index);
      }
    } catch (ignoredThree) {}

    return null;
  }

  function safeGetValue(param) {
    try {
      if (typeof param.getValue === "function") {
        return param.getValue();
      }
    } catch (ignored) {}

    return null;
  }

  function collectKeys(object, limit) {
    var keys = [];
    if (!object) {
      return keys;
    }

    try {
      for (var key in object) {
        addUnique(keys, String(key), limit);
        if (keys.length >= limit) {
          break;
        }
      }
    } catch (ignored) {}

    return keys;
  }

  function collectReflectProperties(object, limit) {
    var names = [];
    try {
      if (object && object.reflect && object.reflect.properties) {
        var properties = object.reflect.properties;
        for (var i = 0; i < properties.length && names.length < limit; i++) {
          addUnique(names, String(properties[i].name), limit);
        }
      }
    } catch (ignored) {}

    return names;
  }

  function addUnique(values, value, limit) {
    if (!value) {
      return;
    }

    for (var i = 0; i < values.length; i++) {
      if (values[i] === value) {
        return;
      }
    }

    if (values.length < limit) {
      values.push(value);
    }
  }

  function msToTicks(milliseconds) {
    var numericMs = Number(milliseconds);
    if (!isFinite(numericMs) || numericMs < 0) {
      numericMs = 0;
    }

    return String(Math.round((numericMs / 1000) * TICKS_PER_SECOND));
  }

  function normalizeTrackOffset(value) {
    var numeric = Number(value);
    if (!isFinite(numeric) || numeric < 0) {
      return 0;
    }

    return Math.floor(numeric);
  }

  function safeScalar(value) {
    var type = typeof value;
    if (value === null || value === undefined) {
      return null;
    }

    if (type === "string" || type === "number" || type === "boolean") {
      return value;
    }

    return valueKind(value);
  }

  function safeString(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  }

  function valueKind(value) {
    if (value === null) {
      return "null";
    }

    if (value === undefined) {
      return "undefined";
    }

    return Object.prototype.toString.call(value);
  }

  function errorToString(error) {
    if (error && error.message) {
      return String(error.message);
    }

    return String(error);
  }

  function jsonStringify(value) {
    if (value === null || value === undefined) {
      return "null";
    }

    var type = typeof value;
    if (type === "string") {
      return quoteJsonString(value);
    }

    if (type === "number") {
      return isFinite(value) ? String(value) : "null";
    }

    if (type === "boolean") {
      return value ? "true" : "false";
    }

    if (isArray(value)) {
      var arrayParts = [];
      for (var i = 0; i < value.length; i++) {
        arrayParts.push(jsonStringify(value[i]));
      }
      return "[" + arrayParts.join(",") + "]";
    }

    if (type === "object") {
      var objectParts = [];
      for (var key in value) {
        if (hasOwn(value, key) && typeof value[key] !== "function") {
          objectParts.push(quoteJsonString(key) + ":" + jsonStringify(value[key]));
        }
      }
      return "{" + objectParts.join(",") + "}";
    }

    return "null";
  }

  function quoteJsonString(value) {
    return "\"" + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\x08/g, "\\b")
      .replace(/\f/g, "\\f") + "\"";
  }

  function hasOwn(object, key) {
    if (!object) {
      return false;
    }

    if (typeof object.hasOwnProperty === "function") {
      return object.hasOwnProperty(key);
    }

    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
  }
})();
