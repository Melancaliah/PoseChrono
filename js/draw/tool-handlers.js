/**
 * Sélectionne un outil dans la toolbar
 */
function selectDrawingTool(toolName) {
  if (!drawingToolbar) return;

  // Arrêter l'animation laser si on quitte cet outil
  if (currentTool === "laser" && toolName !== "laser") {
    stopLaserAnimation();
  }

  // Annuler l'état du compas si on quitte l'outil protractor
  if (currentTool === "protractor" && toolName !== "protractor") {
    if (compassWaitingSecondClick) {
      compassCenter = null;
      compassWaitingSecondClick = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      // Cacher l'info de mesure
      const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
      if (measureInfo) measureInfo.classList.add("hidden");
    }
  }

  const toolButtons = drawingToolbar.querySelectorAll(
    ".annotation-tool[data-tool]",
  );
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === toolName);
  });
  currentTool = toolName;
  updateDrawingCursor();
}

/**
 * Efface à un point donné (gomme)
 */
function eraseAtDrawingPoint(x, y, ctx, canvas) {
  if (!ctx || !canvas) return;
  const eraserSize = annotationStyle.size / 2; // Rayon = moitié du lineWidth (diamètre)
  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, eraserSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = prevGCO;
}

/**
 * Efface une ligne continue entre deux points (avec interpolation)
 * Résout le problème des points espacés quand on gomme vite
 */
function eraseLineBetweenPoints(from, to, ctx, canvas) {
  if (!ctx || !canvas || !from || !to) return;

  const eraserSize = annotationStyle.size / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);

  // Interpoler tous les ERASER_INTERPOLATION_STEP pixels pour un effacement continu
  const steps = Math.max(1, Math.ceil(distance / DRAWING_CONSTANTS.ERASER_INTERPOLATION_STEP));

  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    ctx.beginPath();
    ctx.arc(x, y, eraserSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = prevGCO;
}

/**
 * Ajoute un point au tracé laser avec lissage (stabilisateur)
 */
function addLaserPoint(x, y) {
  // Ajouter au buffer pour le lissage
  stabilizerBuffer.push({ x, y });
  if (stabilizerBuffer.length > stabilizerBufferSize) {
    stabilizerBuffer.shift();
  }

  // Utiliser le point stabilisé si le buffer a assez de points
  let finalPoint;
  if (stabilizerBuffer.length >= 3) {
    finalPoint = calculateLaserStabilizedPoint();
  } else {
    finalPoint = { x, y };
  }

  laserPoints.push({ x: finalPoint.x, y: finalPoint.y, timestamp: Date.now() });
  // Démarrer l'animation si pas déjà en cours
  if (!laserAnimationId) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  }
}

/**
 * Ajoute une ligne droite interpolée au tracé laser
 * Les points sont ajoutés avec le même timestamp pour former une ligne
 */
function addLaserLineBetweenPoints(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);
  const now = Date.now();

  // Interpoler tous les LASER_INTERPOLATION_STEP pixels pour une ligne fluide
  const steps = Math.max(1, Math.ceil(distance / DRAWING_CONSTANTS.LASER_INTERPOLATION_STEP));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    laserPoints.push({ x, y, timestamp: now });
  }

  // Démarrer l'animation si pas déjà en cours
  if (!laserAnimationId) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  }
}

/**
 * Anime le laser pointer (fondu progressif avec courbes lissées)
 */
function animateLaser() {
  if (!drawingPreviewCtx || !drawingPreview) {
    laserAnimationId = null;
    return;
  }

  const now = Date.now();

  // Supprimer les points trop vieux
  laserPoints = laserPoints.filter(
    (p) => now - p.timestamp < LASER_FADE_DURATION,
  );

  // Effacer le canvas preview
  clearCanvas(drawingPreviewCtx, drawingPreview);

  if (laserPoints.length < 2) {
    // Dessiner la preview de ligne droite même sans points
    if (laserShiftPreview) {
      drawingPreviewCtx.beginPath();
      drawingPreviewCtx.moveTo(
        laserShiftPreview.from.x,
        laserShiftPreview.from.y,
      );
      drawingPreviewCtx.lineTo(laserShiftPreview.to.x, laserShiftPreview.to.y);
      const shiftGradient = drawingPreviewCtx.createLinearGradient(
        laserShiftPreview.from.x,
        laserShiftPreview.from.y,
        laserShiftPreview.to.x,
        laserShiftPreview.to.y,
      );
      shiftGradient.addColorStop(0, "rgba(255, 86, 72, 0.92)");
      shiftGradient.addColorStop(1, "rgba(255, 156, 64, 0.92)");
      drawingPreviewCtx.strokeStyle = shiftGradient;
      drawingPreviewCtx.lineWidth = annotationStyle.size;
      drawingPreviewCtx.lineCap = "round";
      drawingPreviewCtx.stroke();
      laserAnimationId = requestAnimationFrame(animateLaser);
      return;
    }
    if (laserPoints.length === 0) {
      laserAnimationId = null;
      return;
    }
    laserAnimationId = requestAnimationFrame(animateLaser);
    return;
  }

  // Configuration du style
  drawingPreviewCtx.lineCap = "round";
  drawingPreviewCtx.lineJoin = "round";
  drawingPreviewCtx.lineWidth = annotationStyle.size;

  // Seuil pour détecter un nouveau tracé (gap temporel entre points)
  const GAP_THRESHOLD = DRAWING_CONSTANTS.GAP_THRESHOLD;

  // Dessiner une courbe lissée avec quadraticCurveTo
  // Technique : passer par les milieux des segments, utiliser les points réels comme contrôles
  // Détecter les gaps temporels pour ne pas connecter des tracés séparés
  for (let i = 0; i < laserPoints.length - 1; i++) {
    const p0 = laserPoints[i];
    const p1 = laserPoints[i + 1];

    // Détecter si c'est un nouveau tracé (gap temporel)
    const timeDiff = p1.timestamp - p0.timestamp;
    if (timeDiff > GAP_THRESHOLD) {
      // Gap détecté : ne pas connecter ces points
      continue;
    }

    // Opacité basée sur l'âge du point de départ
    const age = now - p0.timestamp;
    const opacity = Math.max(0, 1 - age / LASER_FADE_DURATION);

    if (opacity <= 0) continue;

    drawingPreviewCtx.beginPath();
    const segmentRatio =
      laserPoints.length > 1 ? i / (laserPoints.length - 1) : 0;
    const startColor = {
      r: 255,
      g: 76,
      b: 72,
    };
    const endColor = {
      r: 255,
      g: 162,
      b: 72,
    };
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * segmentRatio);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * segmentRatio);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * segmentRatio);
    drawingPreviewCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    // Vérifier si le point précédent fait partie du même tracé
    const prevIsConnected =
      i > 0 && p0.timestamp - laserPoints[i - 1].timestamp <= GAP_THRESHOLD;

    if (!prevIsConnected) {
      // Début d'un nouveau tracé : commencer au point p0
      drawingPreviewCtx.moveTo(p0.x, p0.y);
    } else {
      // Continuer le tracé : commencer au milieu du segment précédent
      const pPrev = laserPoints[i - 1];
      const startX = (pPrev.x + p0.x) / 2;
      const startY = (pPrev.y + p0.y) / 2;
      drawingPreviewCtx.moveTo(startX, startY);
    }

    // Vérifier si le point suivant fait partie du même tracé
    const nextIsConnected =
      i < laserPoints.length - 2 &&
      laserPoints[i + 2].timestamp - p1.timestamp <= GAP_THRESHOLD;

    if (!nextIsConnected) {
      // Fin du tracé : aller directement au point p1
      drawingPreviewCtx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y);
    } else {
      // Segment intermédiaire : aller au milieu du prochain segment
      const endX = (p0.x + p1.x) / 2;
      const endY = (p0.y + p1.y) / 2;
      drawingPreviewCtx.quadraticCurveTo(p0.x, p0.y, endX, endY);
    }

    drawingPreviewCtx.stroke();
  }

  // Dessiner la preview de ligne droite si Shift est maintenu
  if (laserShiftPreview) {
    drawingPreviewCtx.beginPath();
    drawingPreviewCtx.moveTo(
      laserShiftPreview.from.x,
      laserShiftPreview.from.y,
    );
    drawingPreviewCtx.lineTo(laserShiftPreview.to.x, laserShiftPreview.to.y);
    const shiftGradient = drawingPreviewCtx.createLinearGradient(
      laserShiftPreview.from.x,
      laserShiftPreview.from.y,
      laserShiftPreview.to.x,
      laserShiftPreview.to.y,
    );
    shiftGradient.addColorStop(0, "rgba(255, 86, 72, 0.92)");
    shiftGradient.addColorStop(1, "rgba(255, 156, 64, 0.92)");
    drawingPreviewCtx.strokeStyle = shiftGradient;
    drawingPreviewCtx.lineWidth = annotationStyle.size;
    drawingPreviewCtx.lineCap = "round";
    drawingPreviewCtx.stroke();
  }

  // Continuer l'animation si il y a des points ou une preview
  if (laserPoints.length > 0 || laserShiftPreview) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  } else {
    laserAnimationId = null;
  }
}

/**
 * Arrête l'animation laser et nettoie
 */
function stopLaserAnimation() {
  if (laserAnimationId) {
    cancelAnimationFrame(laserAnimationId);
    laserAnimationId = null;
  }
  laserPoints = [];
  if (drawingPreviewCtx && drawingPreview) {
    clearCanvas(drawingPreviewCtx, drawingPreview);
  }
}

/**
 * Dessine une prévisualisation de forme (sans contraintes)
 */
function drawShapePreview(start, end, tool, ctx, canvas) {
  if (!ctx || !canvas || !start || !end) return;

  clearCanvas(ctx, canvas);
  applyStrokeStyle(ctx);
  drawShapeOnCanvas(ctx, start, end, tool);
}

/**
 * Dessine une prévisualisation de forme avec contraintes (Shift, Alt)
 */
function drawShapePreviewConstrained(start, end, tool, isShift, isAlt) {
  if (!drawingPreviewCtx || !drawingPreview || !start || !end) return;

  const ctx = drawingPreviewCtx;
  clearCanvas(ctx, drawingPreview);
  applyStrokeStyle(ctx);

  const { drawStart, drawEnd } = applyShapeConstraints(
    start,
    end,
    tool,
    isShift,
    isAlt,
  );
  drawShapeOnCanvas(ctx, drawStart, drawEnd, tool);
}

/**
 * Dessine une forme finale avec contraintes (Shift, Alt)
 */
function drawFinalShapeConstrained(start, end, tool, isShift, isAlt) {
  if (!drawingCtx || !start || !end) return;

  const { drawStart, drawEnd } = applyShapeConstraints(
    start,
    end,
    tool,
    isShift,
    isAlt,
  );

  if (tool === "rectangle") {
    const minX = Math.min(drawStart.x, drawEnd.x);
    const maxX = Math.max(drawStart.x, drawEnd.x);
    const minY = Math.min(drawStart.y, drawEnd.y);
    const maxY = Math.max(drawStart.y, drawEnd.y);

    if (Math.abs(maxX - minX) < 1 || Math.abs(maxY - minY) < 1) return;

    const groupId = generateDrawEntityId("shape-group");
    const baseConfig = {
      color: annotationStyle.color,
      lineWidth: annotationStyle.size,
      showSizeLabels: false,
      graduationType: "none",
      graduationSize: 0,
    };
    const edge = (start, end, startCorner, endCorner) => ({
      id: generateDrawEntityId("shape-edge"),
      type: "shape-edge",
      shapeGroup: groupId,
      startCorner,
      endCorner,
      start,
      end,
      control: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      },
      config: { ...baseConfig },
    });

    measurementLines.push(
      edge({ x: minX, y: minY }, { x: maxX, y: minY }, "a", "b"), // top
      edge({ x: maxX, y: minY }, { x: maxX, y: maxY }, "b", "c"), // right
      edge({ x: maxX, y: maxY }, { x: minX, y: maxY }, "c", "d"), // bottom
      edge({ x: minX, y: maxY }, { x: minX, y: minY }, "d", "a"), // left
    );
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
    return;
  }

  if (tool === "line") {
    const startPt = { x: drawStart.x, y: drawStart.y };
    const endPt = { x: drawEnd.x, y: drawEnd.y };
    const control = {
      x: (startPt.x + endPt.x) / 2,
      y: (startPt.y + endPt.y) / 2,
    };
    measurementLines.push({
      id: generateDrawEntityId("shape-line"),
      type: "shape-line",
      start: startPt,
      end: endPt,
      control,
      config: {
        color: annotationStyle.color,
        lineWidth: annotationStyle.size,
        showSizeLabels: false,
        graduationType: "none",
        graduationSize: 0,
      },
    });
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
    return;
  }

  if (tool === "circle") {
    const minX = Math.min(drawStart.x, drawEnd.x);
    const maxX = Math.max(drawStart.x, drawEnd.x);
    const minY = Math.min(drawStart.y, drawEnd.y);
    const maxY = Math.max(drawStart.y, drawEnd.y);

    if (Math.abs(maxX - minX) < 1 || Math.abs(maxY - minY) < 1) return;

    measurementLines.push({
      id: generateDrawEntityId("shape-circle"),
      type: "shape-circle",
      start: { x: minX, y: minY },
      end: { x: maxX, y: maxY },
      config: {
        color: annotationStyle.color,
        lineWidth: annotationStyle.size,
        showSizeLabels: false,
        graduationType: "none",
        graduationSize: 0,
      },
    });
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
    return;
  }

  if (tool === "arrow") {
    const startPt = { x: drawStart.x, y: drawStart.y };
    const endPt = { x: drawEnd.x, y: drawEnd.y };
    const control = {
      x: (startPt.x + endPt.x) / 2,
      y: (startPt.y + endPt.y) / 2,
    };
    measurementLines.push({
      id: generateDrawEntityId("shape-arrow"),
      type: "shape-arrow",
      start: startPt,
      end: endPt,
      control,
      config: {
        color: annotationStyle.color,
        lineWidth: annotationStyle.size,
        showSizeLabels: false,
        graduationType: "none",
        graduationSize: 0,
        arrowHeadSize: 1.15,
        arrowDoubleHead: false,
      },
    });
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
    return;
  }

  const ctx = drawingCtx;
  applyStrokeStyle(ctx);
  drawShapeOnCanvas(ctx, drawStart, drawEnd, tool);
}

// ================================================================
// HELPERS POUR LES HANDLERS DE SOURIS
// ================================================================

/**
 * Gère le Shift+Alt+clic pour supprimer une mesure
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si une mesure a été supprimée
 */
function handleShiftClickDelete(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return false;

  if (hit.type === "shape-edge" && hit.shapeGroup) {
    measurementLines = measurementLines.filter(
      (line) => !(line.type === "shape-edge" && line.shapeGroup === hit.shapeGroup),
    );
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
    return true;
  }

  const index = measurementLines.findIndex((line) => line.id === hit.id);
  if (index === -1) return false;

  // Si on supprime une ligne calibrate, supprimer aussi tous les compass
  if (hit.type === "calibrate") {
    calibrationUnit = null;
    removeCalibrateAndCompass();
    const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
    if (unitInfo) unitInfo.classList.add("hidden");
  } else {
    measurementLines.splice(index, 1);
  }
  redrawDrawingMeasurements();
  updateDrawingTotalDistance();
  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
  return true;
}

/**
 * Gère le Alt+clic-glissé pour dupliquer une mesure
 * @param {Object} coords - Coordonnées du clic
 * @returns {Object|null} La mesure dupliquée si succès, null sinon
 */
function handleAltClickDuplicate(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return null;

  // Ne pas dupliquer calibrate
  if (hit.type === "calibrate") {
    return null; // Pas de toast, juste ignorer silencieusement
  }

  // Rectangle groupé: dupliquer tout le groupe
  if (hit.type === "shape-edge" && hit.shapeGroup) {
    const groupLines = measurementLines.filter(
      (line) => line.type === "shape-edge" && line.shapeGroup === hit.shapeGroup,
    );
    if (groupLines.length === 0) return null;

    const newGroupId = generateDrawEntityId("shape-group");
    const duplicatedLines = groupLines.map((line) => {
      const duplicate = structuredClone(line);
      duplicate.id = generateDrawEntityId("shape-edge");
      duplicate.shapeGroup = newGroupId;
      return duplicate;
    });

    measurementLines.push(...duplicatedLines);
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();

    const matched =
      duplicatedLines.find(
        (line) =>
          line.startCorner === hit.startCorner && line.endCorner === hit.endCorner,
      ) || duplicatedLines[0];
    return matched || null;
  }

  // Créer une copie de la mesure (sans décalage, le drag positionnera)
  const duplicate = structuredClone(hit);
  duplicate.id = generateDrawEntityId(hit.type || "shape"); // Nouvel ID unique

  // Ajouter à la liste
  measurementLines.push(duplicate);
  redrawDrawingMeasurements();
  updateDrawingTotalDistance();

  return duplicate;
}

/**
 * Gère le Ctrl+clic pour cycler le type de graduation
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si une action a été effectuée
 */
function handleCtrlClickCycle(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return false;

  if (isEditableShape(hit.type)) return false;

  if (!hit.config) hit.config = {};

  if (hit.type === "measure") {
    const types = ["none", "units", "proportions"];
    const currentType = hit.config.graduationType ?? measureGraduationType;
    const currentIndex = types.indexOf(currentType);
    hit.config.graduationType = types[(currentIndex + 1) % types.length];
    redrawDrawingMeasurements();
    return true;
  }

  if (hit.type === "compass") {
    const subdivisions = [0, 2, 3, 4];
    const currentSubdiv = hit.config.subdivisions ?? 0;
    const currentIndex = subdivisions.indexOf(currentSubdiv);
    hit.config.subdivisions =
      subdivisions[(currentIndex + 1) % subdivisions.length];
    redrawDrawingMeasurements();
    return true;
  }

  if (hit.type === "calibrate") {
    const subdivisions = [0, 2, 3, 4];
    const currentSubdiv = hit.config.subdivisions ?? 0;
    const currentIndex = subdivisions.indexOf(currentSubdiv);
    hit.config.subdivisions =
      subdivisions[(currentIndex + 1) % subdivisions.length];
    redrawDrawingMeasurements();
    return true;
  }

  return false;
}

function ensureEditableShapeSelected(line, options = {}) {
  if (!needsEditableShapeSelection(line)) return false;
  return selectEditableShape(line, options);
}

function needsEditableShapeSelection(line) {
  if (!isEditableShape(line)) return false;
  if (isShapeEdgeSelected(line) || isIndividualShapeSelected(line)) return false;
  return true;
}

function getShapeInteractionModeFromEvent(e) {
  const isShapeTool = ["line", "rectangle", "circle", "arrow"].includes(currentTool);
  return {
    isShapeTool,
    forceCreateShape: !!(e.ctrlKey && isShapeTool),
    canEditShapes: !!(isShapeEditingTool(currentTool) && !e.ctrlKey),
  };
}

/**
 * Vérifie si on clique sur une borne de mesure pour l'éditer
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à éditer une borne
 */
function handleEndpointClick(coords, options = {}) {
  const addToSelection = !!options.addToSelection;
  const target = findDrawingHitTarget(coords, {
    includeControl: false,
    includeEndpoints: true,
    includeLabels: false,
    includeLines: false,
    endpointThreshold: 15,
  });
  if (!target || target.kind !== "endpoint") return false;
  const hit = { line: target.line, endpoint: target.endpoint };
  if (isEditableShape(hit.line.type) && !rectangleEditMode) {
    return false;
  }
  if (
    shapeSafeSelectMode &&
    isEditableShape(hit.line.type) &&
    needsEditableShapeSelection(hit.line)
  ) {
    selectEditableShape(hit.line, { add: addToSelection });
    return true;
  }
  if (
    addToSelection &&
    isEditableShape(hit.line.type) &&
    needsEditableShapeSelection(hit.line)
  ) {
    selectEditableShape(hit.line, { add: true });
    return true;
  }
  ensureEditableShapeSelected(hit.line, { add: addToSelection });

  isDraggingEndpoint = true;
  resetDragShapeSession();
  selectedMeasurement = hit.line;
  draggedEndpoint = hit.endpoint;
  if (hit.line.type === "shape-edge" && hit.line.shapeGroup) {
    const groupLines = measurementLines.filter(
      (line) =>
        line.type === "shape-edge" && line.shapeGroup === hit.line.shapeGroup,
    );
    if (groupLines.length > 0) {
      const xs = [];
      const ys = [];
      groupLines.forEach((line) => {
        xs.push(line.start.x, line.end.x);
        ys.push(line.start.y, line.end.y);
      });
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      dragShapeAspectRatio = width > 0 && height > 0 ? width / height : null;
    } else {
      dragShapeAspectRatio = null;
    }
  } else {
    dragShapeAspectRatio = null;
  }
  isDrawing = true;
  startPoint = coords;
  // Réinitialiser l'état du compas
  compassCenter = null;
  compassWaitingSecondClick = false;
  return true;
}

/**
 * Vérifie si on clique sur un label pour le déplacer
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à déplacer un label
 */
function handleLabelClick(coords) {
  const target = findDrawingHitTarget(coords, {
    includeControl: false,
    includeEndpoints: false,
    includeLabels: true,
    includeLines: false,
  });
  const labelHit = target?.kind === "label" ? target.line : null;
  if (!labelHit) return false;

  isDraggingLabel = true;
  dragLabelMeasurement = labelHit;
  if (!labelHit.labelOffset) {
    labelHit.labelOffset = { x: 0, y: 0 };
  }
  startPoint = coords;
  isDrawing = true;
  return true;
}

/**
 * Vérifie si on clique sur une mesure pour la déplacer entièrement
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à déplacer une mesure
 */
function handleMeasurementClick(coords, options = {}) {
  const addToSelection = !!options.addToSelection;
  const target = findDrawingHitTarget(coords, {
    includeControl: false,
    includeEndpoints: false,
    includeLabels: false,
    includeLines: true,
    lineThreshold: 15,
  });
  const lineHit = target?.kind === "line" ? target.line : null;
  if (!lineHit) return false;
  if (isEditableShape(lineHit.type) && !rectangleEditMode) {
    return false;
  }
  if (
    shapeSafeSelectMode &&
    isEditableShape(lineHit.type) &&
    needsEditableShapeSelection(lineHit)
  ) {
    selectEditableShape(lineHit, { add: addToSelection });
    return true;
  }
  if (
    addToSelection &&
    isEditableShape(lineHit.type) &&
    needsEditableShapeSelection(lineHit)
  ) {
    selectEditableShape(lineHit, { add: true });
    return true;
  }
  ensureEditableShapeSelected(lineHit, { add: addToSelection });

  // Calculer le centre de la mesure
  let centerX, centerY;
  if (lineHit.type === "shape-edge" && lineHit.shapeGroup) {
    const bounds = getShapeGroupBounds(lineHit.shapeGroup);
    if (bounds) {
      centerX = (bounds.minX + bounds.maxX) / 2;
      centerY = (bounds.minY + bounds.maxY) / 2;
    } else {
      centerX = (lineHit.start.x + lineHit.end.x) / 2;
      centerY = (lineHit.start.y + lineHit.end.y) / 2;
    }
  } else if (lineHit.type === "compass") {
    centerX = lineHit.start.x;
    centerY = lineHit.start.y;
  } else {
    centerX = (lineHit.start.x + lineHit.end.x) / 2;
    centerY = (lineHit.start.y + lineHit.end.y) / 2;
  }

  isDraggingMeasurement = true;
  resetDragShapeSession();
  selectedMeasurement = lineHit;
  const selectedLines =
    typeof getSelectedEditableShapeLines === "function"
      ? getSelectedEditableShapeLines()
      : [];
  const canTransformSelectionAsGroup =
    isEditableShape(lineHit.type) &&
    selectedLines.length > 1 &&
    (shapeHasCapability(lineHit, "grouped")
      ? isShapeEdgeSelected(lineHit)
      : isIndividualShapeSelected(lineHit));

  if (canTransformSelectionAsGroup) {
    const multiSnapshot = createMultiShapeTransformSnapshot(selectedLines, coords);
    dragShapeSession.multiSelectionSnapshot = multiSnapshot;
    dragShapeSession.scaleSnapshot = multiSnapshot;
    dragShapeSession.rotateSnapshot = multiSnapshot;
    if (multiSnapshot?.center) {
      centerX = multiSnapshot.center.x;
      centerY = multiSnapshot.center.y;
    }
  } else {
    dragShapeSession.multiSelectionSnapshot = null;
    dragShapeSession.scaleSnapshot = createShapeScaleSnapshot(lineHit);
    dragShapeSession.rotateSnapshot = createShapeRotateSnapshot(lineHit, coords);
  }
  dragMeasurementOffset = {
    x: coords.x - centerX,
    y: coords.y - centerY,
  };
  isDrawing = true;
  startPoint = coords;
  // Réinitialiser l'état du compas
  compassCenter = null;
  compassWaitingSecondClick = false;
  return true;
}

/**
 * Initialise le dessin avec l'outil pencil
 * @param {Object} coords - Coordonnées de départ
 */
function initPencilDrawing(coords) {
  stabilizerBuffer = [coords];
  lastDrawnPoint = { ...coords };
  drawingCtx.beginPath();
  drawingCtx.moveTo(coords.x, coords.y);
  drawingCtx.strokeStyle = annotationStyle.color;
  drawingCtx.lineWidth = getActivePencilStrokeSize();
  drawingCtx.lineCap = "round";
  drawingCtx.lineJoin = "round";
}

/**
 * Initialise l'effacement avec l'outil eraser
 * @param {Object} coords - Coordonnées de départ
 */
function initEraserDrawing(coords) {
  lastDrawnPoint = { ...coords };
  eraseAtDrawingPoint(coords.x, coords.y, drawingCtx, drawingCanvas);
  applyEraserShapeModeAlongStroke(coords, coords, drawingCtx, drawingCanvas);
}

/**
 * Initialise le tracé laser
 * @param {Object} coords - Coordonnées de départ
 */
function initLaserDrawing(coords) {
  lastDrawnPoint = { ...coords };
  addLaserPoint(coords.x, coords.y);
}

/**
 * Gère le mousedown pour le dessin
 * Utilise les helpers pour la logique commune
 */
function handleDrawingMouseDown(e) {
  // Seulement clic gauche (button 0), ignorer clic droit (button 2) et molette (button 1)
  if (e.button !== 0) return;
  hideDrawingEditHud();


  const coords = getDrawingCoordinates(e);

  // Synchroniser keysState avec l'événement souris (évite les désynchronisations)
  keysState.shift = e.shiftKey;
  keysState.alt = e.altKey;
  keysState.ctrl = e.ctrlKey;

  // Shift+Alt+clic = mode suppression (bloquer toute création)
  if (e.shiftKey && e.altKey && !e.ctrlKey) {
    // Tenter la suppression si on est sur un segment
    handleShiftClickDelete(coords);
    // Dans tous les cas, ne PAS créer de segment quand Shift+Alt est maintenu
    return;
  }

  // Alt+clic sur une mesure = duplication (démarre le drag de la copie)
  if (e.altKey && !e.shiftKey) {
    const duplicated = handleAltClickDuplicate(coords);
    if (duplicated) {
      // Calculer le centre de la mesure dupliquée (comme handleMeasurementClick)
      let centerX, centerY;
      if (duplicated.type === "compass") {
        centerX = duplicated.start.x;
        centerY = duplicated.start.y;
      } else if (duplicated.type === "shape-edge" && duplicated.shapeGroup) {
        const bounds = getShapeGroupBounds(duplicated.shapeGroup);
        if (bounds) {
          centerX = (bounds.minX + bounds.maxX) / 2;
          centerY = (bounds.minY + bounds.maxY) / 2;
        } else {
          centerX = (duplicated.start.x + duplicated.end.x) / 2;
          centerY = (duplicated.start.y + duplicated.end.y) / 2;
        }
      } else {
        centerX = (duplicated.start.x + duplicated.end.x) / 2;
        centerY = (duplicated.start.y + duplicated.end.y) / 2;
      }

      // Démarrer le drag de la mesure dupliquée
      isDraggingMeasurement = true;
      selectedMeasurement = duplicated;
      dragShapeSession.multiSelectionSnapshot = null;
      dragShapeSession.scaleSnapshot = createShapeScaleSnapshot(duplicated);
      dragShapeSession.rotateSnapshot = createShapeRotateSnapshot(duplicated, coords);
      // L'offset est calculé par rapport au centre (comme pour le drag normal)
      dragMeasurementOffset = {
        x: coords.x - centerX,
        y: coords.y - centerY,
      };
      startPoint = coords;
      isDrawing = true;
      return;
    }
  }

  // Ctrl+clic sur une mesure = changer le type de graduation (uniquement outils de mesure)
  if (e.ctrlKey && ["measure", "calibrate", "protractor"].includes(currentTool)) {
    handleCtrlClickCycle(coords);
    return; // Ne pas traiter Ctrl+clic autrement
  }

  // Vérifier si on clique sur une borne/label/segment de mesure (pour les outils measure/calibrate/protractor)
  const interactionMode = getShapeInteractionModeFromEvent(e);
  const shapeEditingActive = interactionMode.canEditShapes;
  const forceCreateShape =
    interactionMode.forceCreateShape;
  const controlEditingActive =
    isCurveEditingTool(currentTool) ||
    (rectangleEditMode && currentTool === "rectangle");
  if (
    ["measure", "calibrate", "protractor"].includes(currentTool) ||
    (shapeEditingActive && !forceCreateShape)
  ) {
    // Point de flexion (shape-line / shape-arrow / shape-edge)
    if (controlEditingActive && handleShapeControlClick(coords, { addToSelection: e.shiftKey })) return;

    // Borne de mesure
    if (handleEndpointClick(coords, { addToSelection: e.shiftKey })) return;

    // Label de mesure (pas pour protractor ni rectangle)
    if (currentTool !== "protractor" && currentTool !== "rectangle" && handleLabelClick(coords)) return;

    // Segment de mesure entier
    if (handleMeasurementClick(coords, { addToSelection: e.shiftKey })) return;
  }

  if (
    rectangleEditMode &&
    ["line", "rectangle", "circle", "arrow"].includes(currentTool) &&
    hasEditableShapeSelection()
  ) {
    clearEditableShapeSelection();
    redrawDrawingMeasurements();
  }

  // Gestion spéciale pour l'outil protractor (compas)
  if (currentTool === "protractor") {
    if (!calibrationUnit || calibrationUnit <= 0) {
      showDrawingToast(
        i18next.t("drawing.calibrationRequired"),
        "warning",
      );
      return;
    }

    if (!compassWaitingSecondClick) {
      // Premier clic : définir le centre du compas et activer le mode drag
      compassCenter = { ...coords };
      compassWaitingSecondClick = true;
      compassDragging = true;
      compassDragMoved = false;
      startPoint = coords;
      isDrawing = true;
      drawCompassPreview(compassCenter, coords);
      return;
    } else {
      // Deuxième clic : finaliser le compas
      finalizeCompass(compassCenter, coords);
      compassCenter = null;
      compassWaitingSecondClick = false;
      compassDragging = false;
      startPoint = null;
      isDrawing = false;
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      saveDrawingHistory();
      return;
    }
  }

  // Initialiser le dessin
  startPoint = coords;
  originalStartPoint = { ...coords };
  isDrawing = true;

  // Initialisation spécifique à l'outil
  if (currentTool === "pencil") {
    initPencilDrawing(coords);
  } else if (currentTool === "eraser") {
    initEraserDrawing(coords);
  } else if (currentTool === "laser") {
    initLaserDrawing(coords);
  }
}

// ================================================================
// HELPERS POUR handleDrawingMouseMove() - Phase 6.1
// ================================================================

/**
 * Interpole une ligne entre deux points en dessinant des segments courts
 * Résout le problème des trous quand on dessine vite
 * @param {CanvasRenderingContext2D} ctx - Contexte de dessin
 * @param {Object} from - Point de départ {x, y}
 * @param {Object} to - Point d'arrivée {x, y}
 * @param {number} step - Distance entre chaque point interpolé
 */
function interpolateLine(ctx, from, to, step) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);

  if (distance <= step) {
    // Distance courte, dessiner directement
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    return;
  }

  // Interpoler des points intermédiaires
  const steps = Math.ceil(distance / step);
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 1; i <= steps; i++) {
    const x = from.x + stepX * i;
    const y = from.y + stepY * i;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
}

/**
 * Calcule le point d'intersection avec le bord du canvas
 * Quand le curseur sort vite du canvas, cette fonction calcule où
 * le trait devrait s'arrêter sur le bord
 * @param {Object} from - Dernier point dessiné {x, y}
 * @param {Object} to - Position actuelle du curseur (peut être hors canvas) {x, y}
 * @param {number} width - Largeur du canvas
 * @param {number} height - Hauteur du canvas
 * @returns {Object|null} Point d'intersection avec le bord ou null
 */
function getEdgeIntersection(from, to, width, height) {
  // Vérifier si to est déjà dans le canvas
  if (to.x >= 0 && to.x <= width && to.y >= 0 && to.y <= height) {
    return null; // Pas besoin d'intersection
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Si pas de mouvement, retourner null
  if (dx === 0 && dy === 0) return null;

  let tMin = Infinity;
  let intersection = null;

  // Vérifier intersection avec chaque bord
  // Bord gauche (x = 0)
  if (dx < 0 && from.x > 0) {
    const t = (0 - from.x) / dx;
    if (t >= 0 && t < tMin) {
      const y = from.y + t * dy;
      if (y >= 0 && y <= height) {
        tMin = t;
        intersection = { x: 0, y };
      }
    }
  }

  // Bord droit (x = width)
  if (dx > 0 && from.x < width) {
    const t = (width - from.x) / dx;
    if (t >= 0 && t < tMin) {
      const y = from.y + t * dy;
      if (y >= 0 && y <= height) {
        tMin = t;
        intersection = { x: width, y };
      }
    }
  }

  // Bord haut (y = 0)
  if (dy < 0 && from.y > 0) {
    const t = (0 - from.y) / dy;
    if (t >= 0 && t < tMin) {
      const x = from.x + t * dx;
      if (x >= 0 && x <= width) {
        tMin = t;
        intersection = { x, y: 0 };
      }
    }
  }

  // Bord bas (y = height)
  if (dy > 0 && from.y < height) {
    const t = (height - from.y) / dy;
    if (t >= 0 && t < tMin) {
      const x = from.x + t * dx;
      if (x >= 0 && x <= width) {
        tMin = t;
        intersection = { x, y: height };
      }
    }
  }

  return intersection;
}

/**
 * Gère le mouvement du pencil (dessin libre ou ligne droite avec Shift)
 */
function handlePencilMove(coords, ctx, previewCtx, previewCanvas) {
  const strokeSize = getActivePencilStrokeSize();

  if (keysState.shift) {
    // Transition libre -> Shift: vider d'abord le segment en attente du lissage,
    // puis souder avec la nouvelle direction pour éviter les trous visuels.
    if (!wasShiftPressed && lastDrawnPoint) {
      ctx.strokeStyle = annotationStyle.color;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(lastDrawnPoint.x, lastDrawnPoint.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);

      ctx.beginPath();
      ctx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.strokeStyle = annotationStyle.color;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      lastDrawnPoint = { ...coords };
    }

    // Mode Shift : ligne droite depuis le dernier point
    // Si lastDrawnPoint est null (on vient de rentrer dans le canvas),
    // on ne dessine pas de ligne, juste un point
    if (!lastDrawnPoint) {
      clearCanvas(previewCtx, previewCanvas);
      wasShiftPressed = true;
      return;
    }
    clearCanvas(previewCtx, previewCanvas);
    previewCtx.beginPath();
    previewCtx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
    previewCtx.lineTo(coords.x, coords.y);
    previewCtx.strokeStyle = annotationStyle.color;
    previewCtx.lineWidth = strokeSize;
    previewCtx.lineCap = "round";
    previewCtx.stroke();
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    return;
  }

  // Transition Shift → libre : finaliser la ligne droite
  if (wasShiftPressed && lastDrawnPoint) {
    ctx.beginPath();
    ctx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = annotationStyle.color;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    lastDrawnPoint = { ...coords };
    stabilizerBuffer = [coords];
    wasShiftPressed = false;
    clearCanvas(previewCtx, previewCanvas);
    return;
  }
  wasShiftPressed = false;

  // Effacer le preview
  clearCanvas(previewCtx, previewCanvas);

  // Ajouter au buffer du stabilisateur
  stabilizerBuffer.push(coords);
  if (stabilizerBuffer.length > stabilizerBufferSize) {
    stabilizerBuffer.shift();
  }

  if (stabilizerEnabled && lastDrawnPoint) {
    // Utiliser l'algorithme "Pulling String"
    const smoothed = calculateStabilizedPoint(coords, lastDrawnPoint);

    if (smoothed) {
      // Le point a assez bougé, on dessine avec courbe lissée
      ctx.lineWidth = strokeSize;
      const midX = (lastDrawnPoint.x + smoothed.x) / 2;
      const midY = (lastDrawnPoint.y + smoothed.y) / 2;
      ctx.quadraticCurveTo(lastDrawnPoint.x, lastDrawnPoint.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      lastDrawnPoint = { ...smoothed };

      // Afficher un aperçu de la "corde" entre le point lissé et la souris
      // Seulement si le lissage est > 60%
      if (stabilizerStrength > 0.6) {
        previewCtx.beginPath();
        previewCtx.moveTo(smoothed.x, smoothed.y);
        previewCtx.lineTo(coords.x, coords.y);
        previewCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        previewCtx.lineWidth = 1;
        previewCtx.setLineDash([3, 3]);
        previewCtx.stroke();
        previewCtx.setLineDash([]);

        // Point indicateur de la position réelle de la souris
        previewCtx.beginPath();
        previewCtx.arc(coords.x, coords.y, 4, 0, Math.PI * 2);
        previewCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
        previewCtx.fill();
      }
    } else if (lastDrawnPoint) {
      // La souris n'a pas assez bougé, afficher la corde quand même si lissage > 60%
      if (stabilizerStrength > 0.6) {
        previewCtx.beginPath();
        previewCtx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
        previewCtx.lineTo(coords.x, coords.y);
        previewCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        previewCtx.lineWidth = 1;
        previewCtx.setLineDash([3, 3]);
        previewCtx.stroke();
        previewCtx.setLineDash([]);

        // Point indicateur de la position réelle de la souris
        previewCtx.beginPath();
        previewCtx.arc(coords.x, coords.y, 4, 0, Math.PI * 2);
        previewCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
        previewCtx.fill();
      }
    }
  } else {
    // Pas de stabilisation, dessin avec lissage par courbes de Bézier (midpoint smoothing)
    ctx.lineWidth = strokeSize;

    if (lastDrawnPoint) {
      // Courbe quadratique : control = lastDrawnPoint, end = midpoint
      const midX = (lastDrawnPoint.x + coords.x) / 2;
      const midY = (lastDrawnPoint.y + coords.y) / 2;
      ctx.quadraticCurveTo(lastDrawnPoint.x, lastDrawnPoint.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    } else {
      // Premier point après être revenu dans le canvas
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
    lastDrawnPoint = { ...coords };
  }
}

/**
 * Gère le mouvement de l'eraser (effacement libre ou ligne droite avec Shift)
 */
function handleEraserMove(coords, ctx, canvas, previewCtx, previewCanvas) {
  if (keysState.shift) {
    // Mode Shift : ligne droite d'effacement
    const lineOrigin = lastDrawnPoint || startPoint;
    clearCanvas(previewCtx, previewCanvas);
    previewCtx.beginPath();
    previewCtx.moveTo(lineOrigin.x, lineOrigin.y);
    previewCtx.lineTo(coords.x, coords.y);
    previewCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    previewCtx.lineWidth = annotationStyle.size;
    previewCtx.lineCap = "round";
    previewCtx.setLineDash([5, 5]);
    previewCtx.stroke();
    previewCtx.setLineDash([]);
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    return;
  }

  // Transition Shift → libre
  if (wasShiftPressed && lastDrawnPoint) {
    eraseLineBetweenPoints(lastDrawnPoint, coords, ctx, canvas);
    applyEraserShapeModeAlongStroke(lastDrawnPoint, coords, ctx, canvas);
    lastDrawnPoint = { ...coords };
    wasShiftPressed = false;
    clearCanvas(previewCtx, previewCanvas);
    return;
  }
  wasShiftPressed = false;

  // Effacer le preview
  clearCanvas(previewCtx, previewCanvas);

  // Effacement continu avec interpolation
  if (lastDrawnPoint) {
    eraseLineBetweenPoints(lastDrawnPoint, coords, ctx, canvas);
    applyEraserShapeModeAlongStroke(lastDrawnPoint, coords, ctx, canvas);
  } else {
    eraseAtDrawingPoint(coords.x, coords.y, ctx, canvas);
    applyEraserShapeModeAlongStroke(coords, coords, ctx, canvas);
  }
  lastDrawnPoint = { ...coords };
}

function drawArrowHeadLocal(ctx, from, to, headLength) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

function rasterizeEditableShapeLineToCanvas(line, ctx) {
  if (!line || !ctx || !isEditableShape(line)) return false;

  const color = line.config?.color ?? annotationStyle.color;
  const lineWidth = line.config?.lineWidth ?? annotationStyle.size;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (line.type === "shape-line") {
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    if (line.control) {
      ctx.quadraticCurveTo(line.control.x, line.control.y, line.end.x, line.end.y);
    } else {
      ctx.lineTo(line.end.x, line.end.y);
    }
    ctx.stroke();
    ctx.restore();
    return true;
  }

  if (line.type === "shape-arrow") {
    const headScale = line.config?.arrowHeadSize ?? 1.15;
    const headLength = Math.max(4, DRAWING_CONSTANTS.ARROW_HEAD_LENGTH * headScale);
    if (line.control) {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.quadraticCurveTo(line.control.x, line.control.y, line.end.x, line.end.y);
      ctx.stroke();
      drawArrowHeadLocal(ctx, line.control, line.end, headLength);
      if (line.config?.arrowDoubleHead) {
        drawArrowHeadLocal(ctx, line.control, line.start, headLength);
      }
    } else {
      drawArrowOnCanvas(ctx, line.start, line.end, headScale, !!line.config?.arrowDoubleHead);
    }
    ctx.restore();
    return true;
  }

  if (line.type === "shape-circle") {
    const minX = Math.min(line.start.x, line.end.x);
    const maxX = Math.max(line.start.x, line.end.x);
    const minY = Math.min(line.start.y, line.end.y);
    const maxY = Math.max(line.start.y, line.end.y);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(1, (maxX - minX) / 2);
    const ry = Math.max(1, (maxY - minY) / 2);
    if (line.config?.fillEnabled) {
      const fillColor = line.config?.fillColor || color;
      const fillOpacity = Math.min(0.9, Math.max(0.05, line.config?.fillOpacity ?? 0.2));
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = fillOpacity;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  if (line.type === "shape-edge" && line.shapeGroup) {
    const groupLines = measurementLines.filter(
      (entry) => entry.type === "shape-edge" && entry.shapeGroup === line.shapeGroup,
    );
    if (groupLines.length === 0) {
      ctx.restore();
      return false;
    }

    const baseCfg = line.config || {};
    if (baseCfg.fillEnabled) {
      if (buildShapeEdgeGroupPath(ctx, line)) {
        const fillColor = baseCfg.fillColor || color;
        const fillOpacity = Math.min(0.9, Math.max(0.05, baseCfg.fillOpacity ?? 0.2));
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.restore();
      }
    }

    groupLines.forEach((edge) => {
      ctx.strokeStyle = edge.config?.color ?? color;
      ctx.lineWidth = edge.config?.lineWidth ?? lineWidth;
      ctx.beginPath();
      ctx.moveTo(edge.start.x, edge.start.y);
      if (edge.control) {
        ctx.quadraticCurveTo(edge.control.x, edge.control.y, edge.end.x, edge.end.y);
      } else {
        ctx.lineTo(edge.end.x, edge.end.y);
      }
      ctx.stroke();
    });
    ctx.restore();
    return true;
  }

  ctx.restore();
  return false;
}

function detachEditableShapeAfterRasterize(line) {
  if (!line || !isEditableShape(line)) return false;
  if (line.type === "shape-edge" && line.shapeGroup) {
    const before = measurementLines.length;
    measurementLines = measurementLines.filter(
      (entry) => !(entry.type === "shape-edge" && entry.shapeGroup === line.shapeGroup),
    );
    return measurementLines.length !== before;
  }
  const idx = measurementLines.findIndex((entry) => entry.id === line.id);
  if (idx < 0) return false;
  measurementLines.splice(idx, 1);
  return true;
}

function applyEraserShapeModeAlongStroke(from, to, ctx, canvas) {
  if (!from || !to || !ctx || !canvas) return;
  const mode = eraserShapeMode === "keep-vector" ? "keep-vector" : "partial-raster";
  const eraserRadius = Math.max(2, annotationStyle.size / 2);
  const samples = interpolatePoints(from, to, Math.max(3, eraserRadius * 0.75));
  let changed = false;
  const consumedGroups = new Set();
  const consumedIds = new Set();

  for (const p of samples) {
    const hit = findMeasurementLineAt(p, eraserRadius + 3);
    if (!hit || !isEditableShape(hit)) continue;
    if (hit.type === "shape-edge" && hit.shapeGroup) {
      if (consumedGroups.has(hit.shapeGroup)) continue;
      if (mode === "partial-raster") {
        const ok = rasterizeEditableShapeLineToCanvas(hit, ctx);
        if (!ok) continue;
      }
      if (detachEditableShapeAfterRasterize(hit)) {
        consumedGroups.add(hit.shapeGroup);
        changed = true;
      }
      continue;
    }
    if (consumedIds.has(hit.id)) continue;
    if (mode === "partial-raster") {
      const ok = rasterizeEditableShapeLineToCanvas(hit, ctx);
      if (!ok) continue;
    }
    if (detachEditableShapeAfterRasterize(hit)) {
      consumedIds.add(hit.id);
      changed = true;
    }
  }

  if (changed) {
    clearEditableShapeSelection();
    scheduleDrawingMeasurementsRedraw();
    updateDrawingTotalDistance();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  }
}

/**
 * Gère le mouvement du laser (tracé libre ou ligne droite avec Shift)
 */
function handleLaserMove(coords) {
  if (keysState.shift) {
    // Mode Shift : ligne droite laser
    const lineOrigin = lastDrawnPoint || startPoint;
    laserShiftPreview = {
      from: { x: lineOrigin.x, y: lineOrigin.y },
      to: { x: coords.x, y: coords.y },
    };
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    if (!laserAnimationId) {
      laserAnimationId = requestAnimationFrame(animateLaser);
    }
    return;
  }

  // Transition Shift → libre
  if (wasShiftPressed && lastDrawnPoint) {
    addLaserLineBetweenPoints(lastDrawnPoint, coords);
    lastDrawnPoint = { ...coords };
    laserShiftPreview = null;
    wasShiftPressed = false;
    return;
  }
  wasShiftPressed = false;
  laserShiftPreview = null;

  // Tracé laser libre
  addLaserPoint(coords.x, coords.y);
  lastDrawnPoint = { ...coords };
}

/**
 * Gère le mouvement pour les formes (rectangle, circle, line, arrow)
 */
function getShapeCreationEndpoint(start, rawEnd, tool, isShift, isCtrl) {
  if (!start || !rawEnd) return rawEnd;
  if (tool === "line") {
    return getSmartLineEndpoint(start, rawEnd, !!isShift, !!isCtrl);
  }
  if (tool === "rectangle" && isCtrl) {
    const snap = findNearbyEndpointSnap(rawEnd, 14);
    if (snap) return snap;
  }
  return rawEnd;
}

function handleShapeMove(coords) {
  const previewCoords = getShapeCreationEndpoint(
    startPoint,
    coords,
    currentTool,
    !!keysState.shift,
    !!keysState.ctrl,
  );

  if (keysState.ctrl && (currentTool === "line" || currentTool === "rectangle")) {
    const snapText =
      typeof i18next !== "undefined"
        ? i18next.t("draw.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
        : "Snap (Ctrl)";
    showDrawingModeHint(snapText);
  }

  if (keysState.space && originalStartPoint) {
    // Déplacement avec Espace
    if (!spacePressStartPos) {
      spacePressStartPos = { x: coords.x, y: coords.y };
      shapeEndAtSpacePress = { x: coords.x, y: coords.y };
    }

    const offsetX = coords.x - spacePressStartPos.x;
    const offsetY = coords.y - spacePressStartPos.y;

    const movedStart = {
      x: originalStartPoint.x + offsetX,
      y: originalStartPoint.y + offsetY,
    };
    const movedEnd = {
      x: shapeEndAtSpacePress.x + offsetX,
      y: shapeEndAtSpacePress.y + offsetY,
    };

    startPoint = movedStart;
    originalStartPoint = movedStart;
    shapeEndAtSpacePress = movedEnd;
    spacePressStartPos = { x: coords.x, y: coords.y };

    drawShapePreviewConstrained(
      movedStart,
      movedEnd,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
    if (currentTool === "line") {
      updateDrawingEditHudFromPoints(
        movedStart,
        movedEnd,
        lastMousePosition?.x ?? null,
        lastMousePosition?.y ?? null,
      );
    }
  } else {
    // Prévisualisation normale
    drawShapePreviewConstrained(
      startPoint,
      previewCoords,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
    if (currentTool === "line") {
      updateDrawingEditHudFromPoints(
        startPoint,
        previewCoords,
        lastMousePosition?.x ?? null,
        lastMousePosition?.y ?? null,
      );
    }
  }
}

/**
 * Gère le mouvement pour les mesures (measure, calibrate)
 */
function handleMeasureToolMove(coords, e) {
  if (keysState.space && originalStartPoint) {
    // Déplacement avec Espace
    if (!spacePressStartPos) {
      spacePressStartPos = { x: coords.x, y: coords.y };
      // Utiliser shapeEndAtSpacePress déjà calculé (avec le lock si actif)
      // Si pas encore défini, calculer le point de fin avec le lock actuel
      if (!shapeEndAtSpacePress) {
        if (measureLockedLength !== null && measureLockedLength > 0) {
          const dx = coords.x - startPoint.x;
          const dy = coords.y - startPoint.y;
          const currentDist = getDistance(startPoint, coords);
          if (currentDist > 0) {
            shapeEndAtSpacePress = {
              x: startPoint.x + (dx / currentDist) * measureLockedLength,
              y: startPoint.y + (dy / currentDist) * measureLockedLength,
            };
          } else {
            shapeEndAtSpacePress = { ...coords };
          }
        } else {
          shapeEndAtSpacePress = { ...coords };
        }
      }
    }

    const offsetX = coords.x - spacePressStartPos.x;
    const offsetY = coords.y - spacePressStartPos.y;

    const movedStart = {
      x: originalStartPoint.x + offsetX,
      y: originalStartPoint.y + offsetY,
    };
    const movedEnd = {
      x: shapeEndAtSpacePress.x + offsetX,
      y: shapeEndAtSpacePress.y + offsetY,
    };

    startPoint = movedStart;
    originalStartPoint = movedStart;
    shapeEndAtSpacePress = movedEnd;
    spacePressStartPos = { x: coords.x, y: coords.y };

    drawMeasurePreview(
      movedStart,
      movedEnd,
      currentTool,
      { lockedLength: measureLockedLength },
    );
  } else {
    let endPoint = { ...coords };

    // Shift : verrouiller la taille du segment
    if (
      keysState.shift &&
      measureLockedLength !== null &&
      measureLockedLength > 0
    ) {
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;
      const currentDist = getDistance(startPoint, coords);
      if (currentDist > 0) {
        endPoint = {
          x: startPoint.x + (dx / currentDist) * measureLockedLength,
          y: startPoint.y + (dy / currentDist) * measureLockedLength,
        };
      }
    } else {
      measureLockedLength = getDistance(startPoint, coords);

      // Ctrl : snap à l'unité calibrée
      if (
        e.ctrlKey &&
        currentTool === "measure" &&
        calibrationUnit &&
        calibrationUnit > 0
      ) {
        const distance = getDistance(startPoint, coords);
        const snappedUnits = Math.round(distance / calibrationUnit);
        const snappedDistance = snappedUnits * calibrationUnit;

        if (snappedDistance > 0) {
          const dx = coords.x - startPoint.x;
          const dy = coords.y - startPoint.y;
          const currentDist = getDistance(startPoint, coords);
          if (currentDist > 0) {
            endPoint = {
              x: startPoint.x + (dx / currentDist) * snappedDistance,
              y: startPoint.y + (dy / currentDist) * snappedDistance,
            };
            measureLockedLength = snappedDistance;
          }
        }
      }
    }

    shapeEndAtSpacePress = { ...endPoint };
    drawMeasurePreview(
      startPoint,
      endPoint,
      currentTool,
      { lockedLength: keysState.shift ? measureLockedLength : null },
    );
  }
}

/**
 * Gère le drag d'une borne de mesure
 */
function handleEndpointDrag(coords, e) {
  const lineExists = measurementLines.some(
    (line) => line.id === selectedMeasurement.id,
  );
  if (!lineExists) {
    isDraggingEndpoint = false;
    selectedMeasurement = null;
    draggedEndpoint = null;
    return false;
  }

  if (selectedMeasurement.type === "shape-line") {
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    let nextPoint = { x: coords.x, y: coords.y };
    if (e.ctrlKey) {
      const snap = findNearbyEndpointSnap(
        nextPoint,
        14,
        selectedMeasurement.id,
        draggedEndpoint,
      );
      if (snap) {
        nextPoint = snap;
      } else if (e.shiftKey) {
        nextPoint = applyLine45Constraint(anchorPoint, nextPoint);
      }
    } else if (e.shiftKey) {
      nextPoint = applyLine45Constraint(anchorPoint, nextPoint);
    }
    const beforePoint = {
      x: selectedMeasurement[draggedEndpoint].x,
      y: selectedMeasurement[draggedEndpoint].y,
    };
    selectedMeasurement[draggedEndpoint] = nextPoint;
    if (selectedMeasurement.control) {
      const dx = nextPoint.x - beforePoint.x;
      const dy = nextPoint.y - beforePoint.y;
      selectedMeasurement.control = {
        x: selectedMeasurement.control.x + dx * 0.5,
        y: selectedMeasurement.control.y + dy * 0.5,
      };
    }
    updateDrawingEditHudFromLine(
      selectedMeasurement,
      lastMousePosition?.x ?? null,
      lastMousePosition?.y ?? null,
    );
  } else if (selectedMeasurement.type === "shape-arrow") {
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    let nextPoint = { x: coords.x, y: coords.y };
    if (e.ctrlKey) {
      const snap = findNearbyEndpointSnap(
        nextPoint,
        14,
        selectedMeasurement.id,
        draggedEndpoint,
      );
      if (snap) {
        nextPoint = snap;
      } else if (e.shiftKey) {
        nextPoint = applyLine45Constraint(anchorPoint, nextPoint);
      }
    } else if (e.shiftKey) {
      nextPoint = applyLine45Constraint(anchorPoint, nextPoint);
    }
    const beforePoint = {
      x: selectedMeasurement[draggedEndpoint].x,
      y: selectedMeasurement[draggedEndpoint].y,
    };
    selectedMeasurement[draggedEndpoint] = nextPoint;
    if (selectedMeasurement.control) {
      const dx = nextPoint.x - beforePoint.x;
      const dy = nextPoint.y - beforePoint.y;
      selectedMeasurement.control = {
        x: selectedMeasurement.control.x + dx * 0.5,
        y: selectedMeasurement.control.y + dy * 0.5,
      };
    }
    updateDrawingEditHudFromLine(
      selectedMeasurement,
      lastMousePosition?.x ?? null,
      lastMousePosition?.y ?? null,
    );
  } else if (selectedMeasurement.type === "shape-circle") {
    if (keysState.space) {
      if (!dragShapeSession.circleSpaceBase) {
        dragShapeSession.circleSpaceBase = {
          mouse: { x: coords.x, y: coords.y },
          start: { ...selectedMeasurement.start },
          end: { ...selectedMeasurement.end },
        };
      }
      const base = dragShapeSession.circleSpaceBase;
      const dx = coords.x - base.mouse.x;
      const dy = coords.y - base.mouse.y;
      selectedMeasurement.start = {
        x: base.start.x + dx,
        y: base.start.y + dy,
      };
      selectedMeasurement.end = {
        x: base.end.x + dx,
        y: base.end.y + dy,
      };
      redrawDrawingMeasurements(coords, 15);
      return true;
    }
    if (dragShapeSession.circleSpaceBase) {
      dragShapeSession.circleSpaceBase = null;
    }
    let nextPoint = { x: coords.x, y: coords.y };
    let snapped = false;
    if (e.ctrlKey) {
      const snap = findNearbyEndpointSnap(
        nextPoint,
        14,
        selectedMeasurement.id,
        draggedEndpoint,
      );
      if (snap) {
        nextPoint = snap;
        snapped = true;
      }
    }
    if (e.shiftKey && !snapped) {
      // Contrainte cercle parfait lors du resize via la poignée unique.
      const constrained = applyShapeConstraints(
        selectedMeasurement.start,
        nextPoint,
        "circle",
        true,
        false,
      );
      nextPoint = constrained.drawEnd;
    }
    selectedMeasurement[draggedEndpoint] = nextPoint;
  } else if (selectedMeasurement.type === "compass" && calibrationUnit > 0) {
    // Compass : maintenir la longueur fixe
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * calibrationUnit,
        y: anchorPoint.y + normalizedDy * calibrationUnit,
      };
    }
  } else if (selectedMeasurement.type === "calibrate") {
    handleCalibrateDrag(coords, e);
  } else if (selectedMeasurement.type === "shape-edge") {
    handleShapeEdgeCornerDrag(coords, e);
  } else {
    handleMeasureDrag(coords, e);
  }

  redrawDrawingMeasurements(coords, 15);
  return true;
}

/**
 * Gère le drag spécifique pour calibrate
 */
function handleCalibrateDrag(coords, e) {
  if (keysState.shift || e.shiftKey) {
    // Shift : verrouiller la taille
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    const currentLength =
      calibrationUnit ||
      getDistance(selectedMeasurement.start, selectedMeasurement.end);

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0 && currentLength > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * currentLength,
        y: anchorPoint.y + normalizedDy * currentLength,
      };
    }
  } else {
    // Mettre à jour la borne ET recalculer calibrationUnit
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };

    const newCalibrationUnit = getDistance(
      selectedMeasurement.start,
      selectedMeasurement.end,
    );

    if (newCalibrationUnit > 0 && newCalibrationUnit !== calibrationUnit) {
      calibrationUnit = newCalibrationUnit;

      // Redimensionner tous les compass
      resizeCompassLines(calibrationUnit);

      const unitValue = drawingDOM.unitValue || document.getElementById("drawing-unit-value");
      if (unitValue) {
        unitValue.textContent = `${Math.round(calibrationUnit)}px`;
      }
    }
  }
}

/**
 * Gère le drag spécifique pour measure
 */
function handleMeasureDrag(coords, e) {
  const beforePoint =
    selectedMeasurement && draggedEndpoint
      ? {
          x: selectedMeasurement[draggedEndpoint].x,
          y: selectedMeasurement[draggedEndpoint].y,
        }
      : null;

  if (keysState.shift || e.shiftKey) {
    // Shift : verrouiller la taille
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    const currentLength = getDistance(
      selectedMeasurement.start,
      selectedMeasurement.end,
    );

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0 && currentLength > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * currentLength,
        y: anchorPoint.y + normalizedDy * currentLength,
      };
    }
  } else {
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };
  }

  if (
    selectedMeasurement &&
    selectedMeasurement.type === "shape-line" &&
    selectedMeasurement.control &&
    beforePoint
  ) {
    const afterPoint = selectedMeasurement[draggedEndpoint];
    const dx = afterPoint.x - beforePoint.x;
    const dy = afterPoint.y - beforePoint.y;
    selectedMeasurement.control = {
      x: selectedMeasurement.control.x + dx * 0.5,
      y: selectedMeasurement.control.y + dy * 0.5,
    };
  }
}

function getShapeGroupBounds(groupId) {
  const groupLines = measurementLines.filter(
    (line) => line.type === "shape-edge" && line.shapeGroup === groupId,
  );
  if (groupLines.length === 0) return null;
  const xs = [];
  const ys = [];
  groupLines.forEach((line) => {
    xs.push(line.start.x, line.end.x);
    ys.push(line.start.y, line.end.y);
  });
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function createShapeScaleSnapshot(line) {
  if (!line || !isEditableShape(line.type)) return null;
  if (line.type === "shape-edge" && line.shapeGroup) {
    const bounds = getShapeGroupBounds(line.shapeGroup);
    if (!bounds) return null;
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const items = measurementLines
      .filter((entry) => entry.type === "shape-edge" && entry.shapeGroup === line.shapeGroup)
      .map((entry) => ({
        line: entry,
        start: { ...entry.start },
        end: { ...entry.end },
        control: entry.control ? { ...entry.control } : null,
      }));
    return { type: "shape-edge-group", center, items };
  }

  const center = {
    x: (line.start.x + line.end.x) / 2,
    y: (line.start.y + line.end.y) / 2,
  };
  return {
    type: line.type,
    line,
    center,
    start: { ...line.start },
    end: { ...line.end },
    control: line.control ? { ...line.control } : null,
  };
}

function createMultiShapeTransformSnapshot(lines, pointerStart = null) {
  const uniqueLines = [];
  const seen = new Set();
  (lines || []).forEach((line) => {
    if (!line || !isEditableShape(line.type) || seen.has(line.id)) return;
    seen.add(line.id);
    uniqueLines.push(line);
  });
  if (uniqueLines.length === 0) return null;

  const xs = [];
  const ys = [];
  uniqueLines.forEach((line) => {
    xs.push(line.start.x, line.end.x);
    ys.push(line.start.y, line.end.y);
    if (line.control) {
      xs.push(line.control.x);
      ys.push(line.control.y);
    }
  });
  if (xs.length === 0 || ys.length === 0) return null;
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };

  const items = uniqueLines.map((line) => ({
    line,
    start: { ...line.start },
    end: { ...line.end },
    control: line.control ? { ...line.control } : null,
  }));

  const pointer = pointerStart || startPoint || null;
  return {
    type: "multi-shape",
    center,
    startMouseAngle:
      pointer ? Math.atan2(pointer.y - center.y, pointer.x - center.x) : 0,
    items,
  };
}

function createShapeRotateSnapshot(line, pointerStart = null) {
  if (!line || !isEditableShape(line.type)) return null;
  const pointer = pointerStart || startPoint || null;

  if (line.type === "shape-edge" && line.shapeGroup) {
    const bounds = getShapeGroupBounds(line.shapeGroup);
    if (!bounds) return null;
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const items = measurementLines
      .filter((entry) => entry.type === "shape-edge" && entry.shapeGroup === line.shapeGroup)
      .map((entry) => ({
        line: entry,
        start: { ...entry.start },
        end: { ...entry.end },
        control: entry.control ? { ...entry.control } : null,
      }));
    return {
      type: "shape-edge-group",
      center,
      startMouseAngle:
        pointer ? Math.atan2(pointer.y - center.y, pointer.x - center.x) : 0,
      items,
    };
  }

  const center = {
    x: (line.start.x + line.end.x) / 2,
    y: (line.start.y + line.end.y) / 2,
  };
  return {
    type: line.type,
    line,
    center,
    startMouseAngle: pointer ? Math.atan2(pointer.y - center.y, pointer.x - center.x) : 0,
    start: { ...line.start },
    end: { ...line.end },
    control: line.control ? { ...line.control } : null,
  };
}

function applyShapeRotateFromSnapshot(snapshot, pointerCoords) {
  if (!snapshot || !pointerCoords || !snapshot.center) return false;
  const currentMouseAngle = Math.atan2(
    pointerCoords.y - snapshot.center.y,
    pointerCoords.x - snapshot.center.x,
  );
  const deltaAngle = currentMouseAngle - (snapshot.startMouseAngle || 0);
  if (!Number.isFinite(deltaAngle)) return false;

  if (snapshot.type === "shape-edge-group" || snapshot.type === "multi-shape") {
    snapshot.items.forEach((item) => {
      item.line.start = rotatePointAround(item.start, snapshot.center, deltaAngle);
      item.line.end = rotatePointAround(item.end, snapshot.center, deltaAngle);
      if (item.control) {
        item.line.control = rotatePointAround(item.control, snapshot.center, deltaAngle);
      }
    });
    return true;
  }

  snapshot.line.start = rotatePointAround(snapshot.start, snapshot.center, deltaAngle);
  snapshot.line.end = rotatePointAround(snapshot.end, snapshot.center, deltaAngle);
  if (snapshot.control && snapshot.line.control) {
    snapshot.line.control = rotatePointAround(snapshot.control, snapshot.center, deltaAngle);
  }
  return true;
}

function applyShapeScaleFromSnapshot(snapshot, factor) {
  if (!snapshot || !Number.isFinite(factor) || factor <= 0) return false;
  const f = Math.max(0.1, Math.min(8, factor));
  const scalePoint = (point, center) => ({
    x: center.x + (point.x - center.x) * f,
    y: center.y + (point.y - center.y) * f,
  });

  if (snapshot.type === "shape-edge-group" || snapshot.type === "multi-shape") {
    snapshot.items.forEach((item) => {
      item.line.start = scalePoint(item.start, snapshot.center);
      item.line.end = scalePoint(item.end, snapshot.center);
      if (item.control) {
        item.line.control = scalePoint(item.control, snapshot.center);
      }
    });
    return true;
  }

  snapshot.line.start = scalePoint(snapshot.start, snapshot.center);
  snapshot.line.end = scalePoint(snapshot.end, snapshot.center);
  if (snapshot.control && snapshot.line.control) {
    snapshot.line.control = scalePoint(snapshot.control, snapshot.center);
  }
  return true;
}

function handleShapeEdgeCornerDrag(coords, e) {
  if (!selectedMeasurement || selectedMeasurement.type !== "shape-edge") {
    return;
  }

  const cornerKey =
    draggedEndpoint === "start"
      ? selectedMeasurement.startCorner
      : selectedMeasurement.endCorner;
  if (!cornerKey) {
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };
    return;
  }

  const groupId = selectedMeasurement.shapeGroup;
  if (!groupId) {
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };
    return;
  }

  let nextPoint = { x: coords.x, y: coords.y };

  if (e?.ctrlKey) {
    const snap = findNearbyEndpointSnap(
      nextPoint,
      14,
      null,
      null,
      { excludeShapeGroupId: groupId },
    );
    if (snap) nextPoint = snap;
  }

  if (e?.shiftKey && dragShapeAspectRatio && dragShapeAspectRatio > 0) {
    const oppositeCornerMap = { a: "c", b: "d", c: "a", d: "b" };
    const oppositeKey = oppositeCornerMap[cornerKey];
    const bounds = getShapeGroupBounds(groupId);
    if (oppositeKey && bounds) {
      const corners = {
        a: { x: bounds.minX, y: bounds.minY },
        b: { x: bounds.maxX, y: bounds.minY },
        c: { x: bounds.maxX, y: bounds.maxY },
        d: { x: bounds.minX, y: bounds.maxY },
      };
      const anchor = corners[oppositeKey];
      if (anchor) {
        const dx = nextPoint.x - anchor.x;
        const dy = nextPoint.y - anchor.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > 0 || absDy > 0) {
          let targetDx = absDx;
          let targetDy = absDy;
          if (absDy === 0 || absDx / absDy > dragShapeAspectRatio) {
            targetDy = absDx / dragShapeAspectRatio;
          } else {
            targetDx = absDy * dragShapeAspectRatio;
          }
          nextPoint = {
            x: anchor.x + Math.sign(dx || 1) * targetDx,
            y: anchor.y + Math.sign(dy || 1) * targetDy,
          };
        }
      }
    }
  }

  measurementLines.forEach((line) => {
    if (line.type !== "shape-edge" || line.shapeGroup !== groupId) return;
    if (line.startCorner === cornerKey) {
      const before = { ...line.start };
      line.start = { x: nextPoint.x, y: nextPoint.y };
      if (line.control) {
        line.control.x += (line.start.x - before.x) * 0.5;
        line.control.y += (line.start.y - before.y) * 0.5;
      }
    }
    if (line.endCorner === cornerKey) {
      const before = { ...line.end };
      line.end = { x: nextPoint.x, y: nextPoint.y };
      if (line.control) {
        line.control.x += (line.end.x - before.x) * 0.5;
        line.control.y += (line.end.y - before.y) * 0.5;
      }
    }
  });
}

function findShapeControlAt(coords, threshold = 14) {
  return findEditableShapeControlAt(coords, threshold, {
    selectedOnly: shapeSafeSelectMode,
  });
}

function handleShapeControlClick(coords, options = {}) {
  const addToSelection = !!options.addToSelection;
  const controlEditingActive =
    isCurveEditingTool(currentTool) ||
    (rectangleEditMode && currentTool === "rectangle");
  if (!controlEditingActive) return false;
  const hit = findShapeControlAt(coords);
  if (!hit) return false;
  if (
    shapeSafeSelectMode &&
    isEditableShape(hit.type) &&
    needsEditableShapeSelection(hit)
  ) {
    selectEditableShape(hit, { add: addToSelection });
    return true;
  }
  if (
    addToSelection &&
    isEditableShape(hit.type) &&
    needsEditableShapeSelection(hit)
  ) {
    selectEditableShape(hit, { add: true });
    return true;
  }
  isDraggingShapeControl = true;
  dragShapeControlLine = hit;
  isDrawing = true;
  startPoint = coords;
  return true;
}

function handleShapeControlDrag(coords) {
  if (!isDraggingShapeControl || !dragShapeControlLine) return false;
  if (dragShapeControlLine.type === "shape-edge") {
    const nextControl = getQuadraticControlFromMidpoint(
      dragShapeControlLine.start,
      { x: coords.x, y: coords.y },
      dragShapeControlLine.end,
    );
    if (!nextControl) return false;
    dragShapeControlLine.control = nextControl;
    scheduleDrawingMeasurementsRedraw();
    return true;
  }
  const nextControl = getQuadraticControlFromMidpoint(
    dragShapeControlLine.start,
    { x: coords.x, y: coords.y },
    dragShapeControlLine.end,
  );
  if (!nextControl) return false;
  dragShapeControlLine.control = nextControl;
  scheduleDrawingMeasurementsRedraw();
  updateDrawingEditHudFromLine(
    dragShapeControlLine,
    lastMousePosition?.x ?? null,
    lastMousePosition?.y ?? null,
  );
  return true;
}

/**
 * Gère le drag d'une mesure entière
 */
function handleMeasurementDrag(coords) {
  const lineExists = measurementLines.some(
    (line) => line.id === selectedMeasurement.id,
  );
  if (!lineExists) {
    isDraggingMeasurement = false;
    selectedMeasurement = null;
    dragMeasurementOffset = null;
    resetDragShapeSession();
    return false;
  }

  if (
    keysState.q &&
    dragShapeSession.rotateSnapshot &&
    isEditableShape(selectedMeasurement.type)
  ) {
    if (applyShapeRotateFromSnapshot(dragShapeSession.rotateSnapshot, coords)) {
      scheduleDrawingMeasurementsRedraw();
      if (
        selectedMeasurement.type === "shape-line" ||
        selectedMeasurement.type === "shape-arrow"
      ) {
        updateDrawingEditHudFromLine(
          selectedMeasurement,
          lastMousePosition?.x ?? null,
          lastMousePosition?.y ?? null,
        );
      }
      return true;
    }
  }

  const newCenterX = coords.x - dragMeasurementOffset.x;
  const newCenterY = coords.y - dragMeasurementOffset.y;
  const multiSnapshot = dragShapeSession.multiSelectionSnapshot;

  if (multiSnapshot && multiSnapshot.items?.length > 1) {
    if (keysState.s && dragShapeSession.scaleSnapshot) {
      const factor = 1 + (coords.x - startPoint.x) / 180;
      if (applyShapeScaleFromSnapshot(dragShapeSession.scaleSnapshot, factor)) {
        scheduleDrawingMeasurementsRedraw();
        return true;
      }
    }

    const center = multiSnapshot.center;
    if (!center) return false;
    const deltaX = newCenterX - center.x;
    const deltaY = newCenterY - center.y;
    multiSnapshot.items.forEach((item) => {
      item.line.start.x = item.start.x + deltaX;
      item.line.start.y = item.start.y + deltaY;
      item.line.end.x = item.end.x + deltaX;
      item.line.end.y = item.end.y + deltaY;
      if (item.control) {
        item.line.control.x = item.control.x + deltaX;
        item.line.control.y = item.control.y + deltaY;
      }
    });
    scheduleDrawingMeasurementsRedraw();
    return true;
  }

  let oldCenterX, oldCenterY;
  if (
    selectedMeasurement.type === "shape-edge" &&
    selectedMeasurement.shapeGroup
  ) {
    const bounds = getShapeGroupBounds(selectedMeasurement.shapeGroup);
    if (!bounds) return false;
    oldCenterX = (bounds.minX + bounds.maxX) / 2;
    oldCenterY = (bounds.minY + bounds.maxY) / 2;
  } else if (selectedMeasurement.type === "compass") {
    oldCenterX = selectedMeasurement.start.x;
    oldCenterY = selectedMeasurement.start.y;
  } else {
    oldCenterX = (selectedMeasurement.start.x + selectedMeasurement.end.x) / 2;
    oldCenterY = (selectedMeasurement.start.y + selectedMeasurement.end.y) / 2;
  }

  const deltaX = newCenterX - oldCenterX;
  const deltaY = newCenterY - oldCenterY;

  if (keysState.s && dragShapeSession.scaleSnapshot && isEditableShape(selectedMeasurement.type)) {
    const factor = 1 + (coords.x - startPoint.x) / 180;
    if (applyShapeScaleFromSnapshot(dragShapeSession.scaleSnapshot, factor)) {
      scheduleDrawingMeasurementsRedraw();
      if (selectedMeasurement.type === "shape-line" || selectedMeasurement.type === "shape-arrow") {
        updateDrawingEditHudFromLine(
          selectedMeasurement,
          lastMousePosition?.x ?? null,
          lastMousePosition?.y ?? null,
        );
      }
      return true;
    }
  }

  if (selectedMeasurement.type === "shape-edge" && selectedMeasurement.shapeGroup) {
    measurementLines.forEach((line) => {
      if (
        line.type === "shape-edge" &&
        line.shapeGroup === selectedMeasurement.shapeGroup
      ) {
        line.start.x += deltaX;
        line.start.y += deltaY;
        line.end.x += deltaX;
        line.end.y += deltaY;
        if (line.control) {
          line.control.x += deltaX;
          line.control.y += deltaY;
        }
      }
    });
    redrawDrawingMeasurements();
    return true;
  }

  if (selectedMeasurement.type === "shape-line" && selectedMeasurement.control) {
    selectedMeasurement.start.x += deltaX;
    selectedMeasurement.start.y += deltaY;
    selectedMeasurement.end.x += deltaX;
    selectedMeasurement.end.y += deltaY;
    selectedMeasurement.control.x += deltaX;
    selectedMeasurement.control.y += deltaY;
    redrawDrawingMeasurements();
    updateDrawingEditHudFromLine(
      selectedMeasurement,
      lastMousePosition?.x ?? null,
      lastMousePosition?.y ?? null,
    );
    return true;
  }

  if (selectedMeasurement.type === "shape-arrow") {
    selectedMeasurement.start.x += deltaX;
    selectedMeasurement.start.y += deltaY;
    selectedMeasurement.end.x += deltaX;
    selectedMeasurement.end.y += deltaY;
    if (selectedMeasurement.control) {
      selectedMeasurement.control.x += deltaX;
      selectedMeasurement.control.y += deltaY;
    }
    scheduleDrawingMeasurementsRedraw();
    updateDrawingEditHudFromLine(
      selectedMeasurement,
      lastMousePosition?.x ?? null,
      lastMousePosition?.y ?? null,
    );
    return true;
  }

  if (selectedMeasurement.type === "shape-circle") {
    selectedMeasurement.start.x += deltaX;
    selectedMeasurement.start.y += deltaY;
    selectedMeasurement.end.x += deltaX;
    selectedMeasurement.end.y += deltaY;
    scheduleDrawingMeasurementsRedraw();
    return true;
  }

  selectedMeasurement.start.x += deltaX;
  selectedMeasurement.start.y += deltaY;
  selectedMeasurement.end.x += deltaX;
  selectedMeasurement.end.y += deltaY;

  scheduleDrawingMeasurementsRedraw();
  return true;
}

/**
 * Gère le drag d'un label de mesure
 */
function handleLabelDrag(coords) {
  const lineExists = measurementLines.some(
    (line) => line.id === dragLabelMeasurement.id,
  );
  if (!lineExists) {
    isDraggingLabel = false;
    dragLabelMeasurement = null;
    return false;
  }

  const deltaX = coords.x - startPoint.x;
  const deltaY = coords.y - startPoint.y;

  if (!dragLabelMeasurement.labelOffset) {
    dragLabelMeasurement.labelOffset = { x: 0, y: 0 };
  }

  if (!dragLabelMeasurement._originalLabelOffset) {
    dragLabelMeasurement._originalLabelOffset = {
      ...dragLabelMeasurement.labelOffset,
    };
  }

  dragLabelMeasurement.labelOffset = {
    x: dragLabelMeasurement._originalLabelOffset.x + deltaX,
    y: dragLabelMeasurement._originalLabelOffset.y + deltaY,
  };

  redrawDrawingMeasurements();
  return true;
}

/**
 * Gère le survol quand on ne dessine pas (curseurs, hover)
 */
function handleIdleHover(coords, e) {
  // Synchroniser keysState avec l'événement souris (évite les désynchronisations)
  keysState.shift = e.shiftKey;
  keysState.alt = e.altKey;
  keysState.ctrl = e.ctrlKey;

  // Détection des touches de modification
  const isShiftPressed = e.shiftKey;
  const isAltPressed = e.altKey;
  const isCtrlPressed = e.ctrlKey;
  const forceCreateShape =
    isCtrlPressed &&
    ["line", "rectangle", "circle", "arrow"].includes(currentTool);

  if (forceCreateShape) {
    if (drawingPreview) drawingPreview.style.cursor = "crosshair";
    scheduleDrawingMeasurementsRedraw();
    return true;
  }

  // Hit-test unique pour les modificateurs.
  const modTarget = findDrawingHitTarget(coords, {
    includeControl: false,
    includeEndpoints: false,
    includeLabels: false,
    includeLines: true,
    lineThreshold: 20,
  });
  const modLineHit = modTarget?.kind === "line" ? modTarget.line : null;

  // Shift+Alt maintenu : curseur de suppression (prioritaire)
  if (isShiftPressed && isAltPressed && !isCtrlPressed) {
    if (modLineHit && drawingPreview) {
      drawingPreview.style.cursor = getDeleteCursor();
      scheduleDrawingMeasurementsRedraw(coords, 20);
      return true;
    }
    return false;
  }

  // Alt maintenu SEUL (sans Shift) : curseur de duplication
  if (isAltPressed && !isShiftPressed && modLineHit) {
    if (drawingPreview) {
      drawingPreview.style.cursor =
        modLineHit.type === "calibrate" ? "not-allowed" : getDuplicateCursor();
    }
    scheduleDrawingMeasurementsRedraw(coords, 20);
    return true;
  }

  // Ctrl maintenu : curseur de cycle
  if (
    e.ctrlKey &&
    modLineHit &&
    (modLineHit.type === "measure" || modLineHit.type === "compass") &&
    drawingPreview
  ) {
    drawingPreview.style.cursor = getCycleCursor();
    scheduleDrawingMeasurementsRedraw(coords, 20);
    return true;
  }

  // Survol des outils de mesure
  if (
    currentTool === "measure" ||
    currentTool === "calibrate" ||
    currentTool === "protractor" ||
    isShapeEditingTool(currentTool)
  ) {
    // Protractor en attente du second clic
    if (
      currentTool === "protractor" &&
      compassWaitingSecondClick &&
      compassCenter
    ) {
      drawCompassPreview(compassCenter, coords);
    }

    const target = findDrawingHitTarget(coords, {
      includeControl:
        isCurveEditingTool(currentTool) ||
        (rectangleEditMode && currentTool === "rectangle"),
      includeEndpoints: true,
      includeLabels: currentTool !== "protractor" && currentTool !== "rectangle",
      includeLines: true,
      controlThreshold: 16,
      endpointThreshold: 15,
      lineThreshold: 15,
    });

    if (!target) {
      if (drawingPreview) drawingPreview.style.cursor = "";
      scheduleDrawingMeasurementsRedraw();
      return true;
    }

    if (target.kind === "control") {
      if (drawingPreview) drawingPreview.style.cursor = "grab";
      scheduleDrawingMeasurementsRedraw(coords, 15);
      return true;
    }

    if (target.kind === "endpoint") {
      if (drawingPreview) drawingPreview.style.cursor = "pointer";
      scheduleDrawingMeasurementsRedraw(coords, 15);
      return true;
    }

    if (target.kind === "label") {
      if (drawingPreview) drawingPreview.style.cursor = "grab";
      scheduleDrawingMeasurementsRedraw(coords, 15);
      return true;
    }

    const lineHit = target.line;
    if (lineHit && isEditableShape(lineHit.type) && needsEditableShapeSelection(lineHit)) {
      if (drawingPreview) drawingPreview.style.cursor = "pointer";
      scheduleDrawingMeasurementsRedraw(coords, 15);
      return true;
    }
    if (drawingPreview) drawingPreview.style.cursor = "move";
    scheduleDrawingMeasurementsRedraw(coords, 15);
    return true;
  }

  return false;
}

/**
 * Gère le mousemove pour le dessin
 * Utilise les helpers Phase 6.1 pour la logique par outil
 */
function handleDrawingMouseMove(e) {


  // Mettre à jour la position pour updateAltDuplicateCursor
  lastMousePosition = { x: e.clientX, y: e.clientY };

  const coords = getDrawingCoordinates(e);

  // Détection de l'entrée dans le canvas (quand mouseenter n'est pas déclenché)
  // Si wasOutsideCanvas est true alors qu'on reçoit un mousemove,
  // c'est qu'on vient de rentrer dans le canvas
  if (wasOutsideCanvas) {
    resetDrawingStateOnEnter();
  }

  // Stocker les coordonnées canvas pour le compas (utilisé dans mouseUp)
  if (currentTool === "protractor" && compassWaitingSecondClick) {
    lastMousePosition = coords;
    if (compassDragging && compassCenter) {
      const distance = getDistance(compassCenter, coords);
      if (distance > 10) {
        compassDragMoved = true;
      }
    }
  }

  // Curseur personnalisé pour pencil/eraser/laser (sauf mode précis CapsLock)
  if (
    ["pencil", "eraser", "laser"].includes(currentTool) &&
    !showPreciseCursor
  ) {
    updateDrawingCursorPosition(e.clientX, e.clientY);
  } else {
    hideDrawingCursor();
  }

  // Quand on ne dessine pas : gestion du survol
  if (!isDrawing) {
    hideDrawingEditHud();
    handleIdleHover(coords, e);
    return;
  }

  // Mode déplacement de borne
  if (isDraggingShapeControl && dragShapeControlLine) {
    handleShapeControlDrag(coords);
    return;
  }

  // Mode déplacement de borne
  if (isDraggingEndpoint && selectedMeasurement && draggedEndpoint) {
    handleEndpointDrag(coords, e);
    return;
  }

  // Mode déplacement de mesure entière
  if (isDraggingMeasurement && selectedMeasurement && dragMeasurementOffset) {
    handleMeasurementDrag(coords);
    return;
  }

  // Mode déplacement de label
  if (isDraggingLabel && dragLabelMeasurement && startPoint) {
    handleLabelDrag(coords);
    return;
  }

  // Stocker la position pour les formes
  if (
    [
      "rectangle",
      "circle",
      "line",
      "arrow",
      "measure",
      "calibrate",
      "protractor",
    ].includes(currentTool)
  ) {
    stabilizerBuffer = [coords];
  }

  // Dispatch selon l'outil actif
  if (currentTool === "pencil") {
    handlePencilMove(coords, drawingCtx, drawingPreviewCtx, drawingPreview);
  } else if (currentTool === "eraser") {
    handleEraserMove(
      coords,
      drawingCtx,
      drawingCanvas,
      drawingPreviewCtx,
      drawingPreview,
    );
  } else if (currentTool === "laser") {
    handleLaserMove(coords);
  } else if (["rectangle", "circle", "line", "arrow"].includes(currentTool)) {
    handleShapeMove(coords);
  } else if (["measure", "calibrate"].includes(currentTool)) {
    handleMeasureToolMove(coords, e);
  } else if (currentTool === "protractor") {
    // Prévisualisation du compas
    if (compassWaitingSecondClick && compassCenter) {
      if (keysState.space) {
        if (!spacePressStartPos) {
          spacePressStartPos = { x: coords.x, y: coords.y };
        } else {
          const offsetX = coords.x - spacePressStartPos.x;
          const offsetY = coords.y - spacePressStartPos.y;
          compassCenter.x += offsetX;
          compassCenter.y += offsetY;
          spacePressStartPos = { x: coords.x, y: coords.y };
        }
      }
      drawCompassPreview(compassCenter, coords);
    }
  }
}

/**
 * Gère le mouseup pour le dessin
 */
function handleDrawingMouseUp(e = null) {
  if (!isDrawing) return;

  isDrawing = false;

  if (isDraggingShapeControl) {
    isDraggingShapeControl = false;
    dragShapeControlLine = null;
    resetDragShapeSession();
    scheduleDrawingMeasurementsRedraw();
    saveDrawingHistory();
    startPoint = null;
    hideDrawingEditHud();

    return;
  }

  // Si on était en mode déplacement de borne
  if (isDraggingEndpoint) {
    isDraggingEndpoint = false;
    selectedMeasurement = null;
    draggedEndpoint = null;
    dragShapeAspectRatio = null;
    resetDragShapeSession();
    scheduleDrawingMeasurementsRedraw();
    saveDrawingHistory();
    startPoint = null;
    hideDrawingEditHud();

    return;
  }

  // Si on était en mode déplacement de mesure entière
  if (isDraggingMeasurement) {
    isDraggingMeasurement = false;
    selectedMeasurement = null;
    dragMeasurementOffset = null;
    dragShapeAspectRatio = null;
    resetDragShapeSession();
  scheduleDrawingMeasurementsRedraw();
    saveDrawingHistory();
    startPoint = null;
    hideDrawingEditHud();

    return;
  }

  // Si on était en mode déplacement de label
  if (isDraggingLabel) {
    // Nettoyer l'offset temporaire utilisé pendant le drag
    if (dragLabelMeasurement && dragLabelMeasurement._originalLabelOffset) {
      delete dragLabelMeasurement._originalLabelOffset;
    }
    isDraggingLabel = false;
    dragLabelMeasurement = null;
    redrawDrawingMeasurements();
    saveDrawingHistory();
    startPoint = null;
    hideDrawingEditHud();

    return;
  }

  const endPoint =
    stabilizerBuffer.length > 0
      ? stabilizerBuffer[stabilizerBuffer.length - 1]
      : startPoint;

  // Pencil avec Shift : finaliser la ligne droite sur le canvas principal
  if (currentTool === "pencil" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      drawingCtx.beginPath();
      drawingCtx.moveTo(lineOrigin.x, lineOrigin.y);
      drawingCtx.lineTo(endPoint.x, endPoint.y);
      drawingCtx.strokeStyle = annotationStyle.color;
      drawingCtx.lineWidth = getActivePencilStrokeSize();
      drawingCtx.lineCap = "round";
      drawingCtx.stroke();
      // Mettre à jour lastDrawnPoint pour une éventuelle continuation
      lastDrawnPoint = { ...endPoint };
    }
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  }

  // Eraser avec Shift : finaliser l'effacement en ligne droite
  if (currentTool === "eraser" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      eraseLineBetweenPoints(lineOrigin, endPoint, drawingCtx, drawingCanvas);
      applyEraserShapeModeAlongStroke(lineOrigin, endPoint, drawingCtx, drawingCanvas);
      lastDrawnPoint = { ...endPoint };
    }
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  }

  // Laser avec Shift : finaliser la ligne droite laser
  if (currentTool === "laser" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      addLaserLineBetweenPoints(lineOrigin, endPoint);
      lastDrawnPoint = { ...endPoint };
    }
    laserShiftPreview = null; // Effacer la preview
  }

  // Laser sans Shift : juste effacer la preview si elle existait
  if (currentTool === "laser" && !keysState.shift) {
    laserShiftPreview = null;
  }

  if (
    ["rectangle", "circle", "line", "arrow"].includes(currentTool) &&
    startPoint
  ) {
    const finalShapeEnd = getShapeCreationEndpoint(
      startPoint,
      endPoint,
      currentTool,
      !!keysState.shift,
      !!keysState.ctrl,
    );
    // Dessiner la forme finale avec les contraintes
    drawFinalShapeConstrained(
      startPoint,
      finalShapeEnd,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "measure" && startPoint && endPoint) {
    // Finaliser la mesure - utiliser shapeEndAtSpacePress si disponible (position avec lock de taille)
    const finalEnd = shapeEndAtSpacePress || endPoint;
    finalizeDrawingMeasurement(startPoint, finalEnd, false);
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "calibrate" && startPoint && endPoint) {
    // Finaliser la calibration - utiliser shapeEndAtSpacePress si disponible (position avec lock de taille)
    const finalEnd = shapeEndAtSpacePress || endPoint;
    finalizeDrawingCalibration(startPoint, finalEnd, false);
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "protractor") {
    // Compas : si on relâche pendant le drag du premier clic ET qu'on a bougé, finaliser
    if (
      compassDragging &&
      compassCenter &&
      lastMousePosition &&
      compassDragMoved
    ) {
      // Calculer le point final basé sur la dernière position de la souris
      finalizeCompass(compassCenter, lastMousePosition);
      // Réinitialiser l'état
      compassCenter = null;
      compassWaitingSecondClick = false;
      compassDragging = false;
      compassDragMoved = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      saveDrawingHistory();
  
      return;
    }
    // Si on est en attente du second clic (mode deux clics) ou pas de mouvement, rester en attente
    if (compassWaitingSecondClick) {
      compassDragging = false; // Le drag est terminé, on passe en mode deux clics
      compassDragMoved = false;
      isDrawing = true; // Garder l'état de dessin actif
      return;
    }
  }

  // Pencil : finaliser le dernier segment de courbe (midpoint → point final)
  if (currentTool === "pencil" && lastDrawnPoint && !keysState.shift) {
    drawingCtx.lineTo(lastDrawnPoint.x, lastDrawnPoint.y);
    drawingCtx.stroke();
  }

  // Cacher l'info de mesure
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) measureInfo.classList.add("hidden");

  // Nettoyer le canvas de preview (efface le repère de retard du stabilisateur)
  if (drawingPreviewCtx && drawingPreview) {
    clearCanvas(drawingPreviewCtx, drawingPreview);
  }

  // Sauvegarder l'état pour undo
  saveDrawingHistory();
  hideDrawingEditHud();

  // Mettre à jour l'état des boutons (notamment le bouton clear)
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");

  // Réinitialiser les variables
  startPoint = null;
  originalStartPoint = null;
  lastDrawnPoint = null;
  wasShiftPressed = false;
  stabilizerBuffer = [];
  spacePressStartPos = null;
  shapeEndAtSpacePress = null;
  measureLockedLength = null; // Réinitialiser le lock de taille

}

/**
 * Gestion tactile
 */
function handleDrawingTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handleDrawingMouseDown({
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
    });
  }
}

function handleDrawingTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handleDrawingMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }
}

function handleDrawingTouchEnd(e) {
  e.preventDefault();
  handleDrawingMouseUp({ clientX: 0, clientY: 0 });
}

