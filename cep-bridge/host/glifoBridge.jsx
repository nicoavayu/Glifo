(function () {
  var TICKS_PER_SECOND = 254016000000;
  var MAX_KEYS = 80;
  var MAX_COMPONENTS = 12;
  var MAX_PARAMS = 40;
  var MAX_VISUAL_PARAMS = 120;
  var MAX_VALUE_CHARS = 6000;
  var MAX_STRUCTURE_DEPTH = 4;
  var DEFAULT_TEMPLATE_TEXT = "Caption text";
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
      key: "colorFill",
      label: "color / fill",
      keywords: ["color", "colour", "fill", "relleno", "stroke", "trazo"]
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
    audioTrackOffset
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
      result.ok = true;
      result.inserted = true;
      result.itemName = safeString(item.name);
      result.diagnostics = inspectTrackItem(item, mgtInspection);
      result.text = trySetMogrtText(item, text, mgtInspection);
      result.selectedTextProperty = result.text.selectedTextProperty;
      result.textBefore = result.text.textBefore;
      result.textAfter = result.text.textAfter;
      result.textBeforeFullDiagnostic = result.text.textBeforeFullDiagnostic;
      result.textAfterFullDiagnostic = result.text.textAfterFullDiagnostic;
      result.attemptedValueFormats = result.text.attemptedValueFormats;
      result.verificationResult = result.text.verificationResult;
      result.visual = inspectMogrtVisualAudit(item, mgtInspection, result.text);
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

  function trySetMogrtText(item, text, mgtInspection) {
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
          var candidateResult = applyTextParamCandidate(candidates[i], text);
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

  function applyTextParamCandidate(candidate, text) {
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
      var attemptResult = applySetValueAttempt(candidate.param, attempt, expectedText);
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

  function applySetValueAttempt(param, attempt, expectedText) {
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

    var preferredNames = ["Caption Text", "Source Text", "Text"];
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

  function inspectMogrtVisualAudit(item, mgtInspection, textResult) {
    var visualGroups = inspectVisualParamGroups(item, mgtInspection);
    var textInventory = inspectTextParamInventory(item, mgtInspection);
    var warnings = createVisualAuditWarnings(visualGroups, textInventory, textResult);

    return {
      note: "This is a parameter audit only. It verifies exposed MOGRT controls, not final Program Monitor pixels.",
      selectedTextProperty: textResult ? textResult.selectedTextProperty : null,
      selectedTextValueAfter: textResult ? textResult.textAfter : null,
      selectedTextVerification: textResult ? textResult.textVerification : null,
      selectedTextCandidateCount: textResult && textResult.textCandidates ? textResult.textCandidates.length : 0,
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
    var snapshot = {
      index: paramIndex,
      displayName: readParamDisplayName(param),
      matchName: readParamMatchName(param),
      type: readParamType(param),
      source: source,
      componentName: componentName,
      componentIndex: componentIndex,
      groups: groupKeys,
      value: valueInfo.valueDiagnostic,
      typeofValue: valueInfo.typeofValue,
      valueKind: valueInfo.valueKind,
      getValueAvailable: valueInfo.available,
      getValueOk: valueInfo.ok,
      getValueError: valueInfo.error,
      typeofSetValue: typeof param.setValue,
      keys: collectKeys(param, 20),
      reflectProperties: collectReflectProperties(param, 20),
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

    if (containsValue(groups, "colorFill") && looksLikeBlackColor(numbers, name)) {
      risks.push("fill_or_color_may_be_black");
    }

    if (containsValue(groups, "visibility") && looksDisabledOrHidden(value)) {
      risks.push("visibility_or_enabled_is_off");
    }

    return risks;
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

    if (groups.opacity.length === 0) {
      warnings.push("No exposed opacity parameter found; check layer opacity in After Effects if Program Monitor is black.");
    }

    addGroupRiskWarnings(warnings, groups.opacity, "Opacity/alpha risk");
    addGroupRiskWarnings(warnings, groups.position, "Position risk");
    addGroupRiskWarnings(warnings, groups.scale, "Scale risk");
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
