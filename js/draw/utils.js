// ================================================================
// MODULE DE DESSIN ET ANNOTATION (PoseChrono)
// ================================================================
// Ce fichier contient tout le système d'annotation avec :
// - Outils de dessin (crayon, gomme, formes)
// - Outils de mesure et calibration
// - Système de calques séparés
// - Gestion des événements souris/clavier
// ================================================================

const DEBUG = false;
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// FONCTIONS UTILITAIRES

function getDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getPointToSegmentDistance(point, segStart, segEnd) {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return getDistance(point, segStart);
  }

  // Projection du point sur la ligne
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;

  return Math.sqrt(
    (point.x - projX) * (point.x - projX) +
      (point.y - projY) * (point.y - projY),
  );
}

function getPointToQuadraticDistance(point, start, control, end, steps = 24) {
  if (!start || !control || !end) return Infinity;
  let minDist = Infinity;
  let prev = start;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x;
    const y =
      mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y;
    const curr = { x, y };
    const d = getPointToSegmentDistance(point, prev, curr);
    if (d < minDist) minDist = d;
    prev = curr;
  }

  return minDist;
}

function getQuadraticPointAt(start, control, end, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

function getQuadraticMidpointOnCurve(start, control, end) {
  if (!start || !control || !end) return null;
  return getQuadraticPointAt(start, control, end, 0.5);
}

function getQuadraticControlFromMidpoint(start, midpoint, end) {
  if (!start || !midpoint || !end) return null;
  return {
    x: 2 * midpoint.x - 0.5 * (start.x + end.x),
    y: 2 * midpoint.y - 0.5 * (start.y + end.y),
  };
}

function getShapeCurveHandlePoint(line) {
  if (!line || !line.control || !shapeHasCapability(line, "hasControlPoint")) {
    return null;
  }
  return getQuadraticMidpointOnCurve(line.start, line.control, line.end);
}

function isEditableShape(lineOrType) {
  const type =
    typeof lineOrType === "string" ? lineOrType : lineOrType?.type;
  return !!type && !!DRAW_SHAPE_CAPABILITIES[type];
}

const DRAW_SHAPE_CAPABILITIES = Object.freeze({
  "shape-edge": Object.freeze({
    editable: true,
    grouped: true,
    hasEndpoints: true,
    endpointMode: "corners",
    hasControlPoint: true,
    supportsFill: true,
  }),
  "shape-line": Object.freeze({
    editable: true,
    grouped: false,
    hasEndpoints: true,
    endpointMode: "both",
    hasControlPoint: true,
    supportsFill: false,
  }),
  "shape-circle": Object.freeze({
    editable: true,
    grouped: false,
    hasEndpoints: true,
    endpointMode: "single-end",
    hasControlPoint: false,
    supportsFill: true,
  }),
  "shape-arrow": Object.freeze({
    editable: true,
    grouped: false,
    hasEndpoints: true,
    endpointMode: "both",
    hasControlPoint: true,
    supportsFill: false,
  }),
});

function getShapeCapabilities(lineOrType) {
  const type =
    typeof lineOrType === "string" ? lineOrType : lineOrType?.type;
  return type ? DRAW_SHAPE_CAPABILITIES[type] || null : null;
}

function shapeHasCapability(lineOrType, capabilityKey) {
  const capabilities = getShapeCapabilities(lineOrType);
  return !!(capabilities && capabilities[capabilityKey]);
}

function isShapeEditingTool(toolName = currentTool) {
  return (
    rectangleEditMode &&
    (toolName === "rectangle" ||
      toolName === "line" ||
      toolName === "circle" ||
      toolName === "arrow")
  );
}

function isCurveEditingTool(toolName = currentTool) {
  return rectangleEditMode && (toolName === "line" || toolName === "arrow");
}

function generateDrawEntityId(prefix = "shape") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function getPointToEllipseDistance(point, cx, cy, rx, ry, steps = 48) {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) {
    return Infinity;
  }
  let minDist = Infinity;
  let prev = { x: cx + rx, y: cy };
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const curr = {
      x: cx + Math.cos(t) * rx,
      y: cy + Math.sin(t) * ry,
    };
    const d = getPointToSegmentDistance(point, prev, curr);
    if (d < minDist) minDist = d;
    prev = curr;
  }
  return minDist;
}

function interpolatePoints(from, to, stepSize) {
  const points = [];
  const dist = getDistance(from, to);
  const steps = Math.max(1, Math.ceil(dist / stepSize));
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: from.x + dx * t,
      y: from.y + dy * t,
    });
  }
  return points;
}

function constrainToViewport(rect, margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN) {
  let { left, top, width, height } = rect;
  let needsUpdate = false;

  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
    needsUpdate = true;
  }
  if (left < margin) {
    left = margin;
    needsUpdate = true;
  }
  if (top + height > window.innerHeight - margin) {
    top = window.innerHeight - height - margin;
    needsUpdate = true;
  }
  if (top < margin) {
    top = margin;
    needsUpdate = true;
  }

  return { left, top, needsUpdate };
}

/**
 * Crée un debouncer pour limiter les appels de fonction
 */
function createDebouncer() {
  let timeoutId = null;
  return {
    debounce(fn, delay) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(fn, delay);
    },
    cancel() {
      clearTimeout(timeoutId);
      timeoutId = null;
    },
  };
}

const resizeDebouncer = createDebouncer();

const globalEventHandlers = {
  toolbarMouseMove: null,
  toolbarMouseUp: null,
  toolbarResize: null,
  scrollbarMouseMove: null,
  scrollbarMouseUp: null,
};

function cleanupGlobalDrawingEvents() {
  if (globalEventHandlers.toolbarMouseMove) {
    document.removeEventListener(
      "mousemove",
      globalEventHandlers.toolbarMouseMove,
    );
    globalEventHandlers.toolbarMouseMove = null;
  }
  if (globalEventHandlers.toolbarMouseUp) {
    document.removeEventListener("mouseup", globalEventHandlers.toolbarMouseUp);
    globalEventHandlers.toolbarMouseUp = null;
  }
  if (globalEventHandlers.toolbarResize) {
    window.removeEventListener("resize", globalEventHandlers.toolbarResize);
    globalEventHandlers.toolbarResize = null;
  }
  if (globalEventHandlers.scrollbarMouseMove) {
    document.removeEventListener("mousemove", globalEventHandlers.scrollbarMouseMove);
    globalEventHandlers.scrollbarMouseMove = null;
  }
  if (globalEventHandlers.scrollbarMouseUp) {
    document.removeEventListener("mouseup", globalEventHandlers.scrollbarMouseUp);
    globalEventHandlers.scrollbarMouseUp = null;
  }
  // Annuler le debouncer
  resizeDebouncer.cancel();
}

function showDrawingToast(message, type = "info", duration = 3000) {
  // Supprimer le toast existant si présent
  const existing = document.getElementById("drawing-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "drawing-toast";
  toast.className = `drawing-toast drawing-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animation d'entrée
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Auto-suppression
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Applique une contrainte horizontale/verticale à une ligne
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @returns {Object} Point d'arrivée contraint
 */
function applyLineConstraint(start, end) {
  const width = end.x - start.x;
  const height = end.y - start.y;
  if (Math.abs(width) > Math.abs(height)) {
    return { x: end.x, y: start.y }; // Horizontal
  }
  return { x: start.x, y: end.y }; // Vertical
}

function applyLine45Constraint(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...end };
  const angle = Math.atan2(dy, dx);
  const snapStep = Math.PI / 4; // 45 deg
  const snapped = Math.round(angle / snapStep) * snapStep;
  return {
    x: start.x + Math.cos(snapped) * length,
    y: start.y + Math.sin(snapped) * length,
  };
}

function findNearbyEndpointSnap(
  point,
  threshold = 14,
  excludeLineId = null,
  excludeEndpointKey = null,
  options = {},
) {
  const excludeShapeGroupId = options?.excludeShapeGroupId || null;
  let best = null;
  let bestDist = threshold;
  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;
    if (excludeShapeGroupId && line.shapeGroup === excludeShapeGroupId) {
      continue;
    }
    if (excludeLineId && line.id === excludeLineId) {
      if (excludeEndpointKey !== "start") {
        const ds = getDistance(point, line.start);
        if (ds < bestDist) {
          bestDist = ds;
          best = { ...line.start };
        }
      }
      if (excludeEndpointKey !== "end") {
        const de = getDistance(point, line.end);
        if (de < bestDist) {
          bestDist = de;
          best = { ...line.end };
        }
      }
      continue;
    }
    const ds = getDistance(point, line.start);
    if (ds < bestDist) {
      bestDist = ds;
      best = { ...line.start };
    }
    const de = getDistance(point, line.end);
    if (de < bestDist) {
      bestDist = de;
      best = { ...line.end };
    }
  }
  return best;
}

function getSmartLineEndpoint(start, rawEnd, isShift, isCtrl) {
  let next = { ...rawEnd };
  if (isCtrl) {
    const snap = findNearbyEndpointSnap(next, 14);
    if (snap) return snap;
  }
  if (isShift) {
    next = applyLine45Constraint(start, next);
  }
  return next;
}

function getLineMetrics(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return { length, angle };
}

function rotatePointAround(point, center, angleRad) {
  if (!point || !center || !Number.isFinite(angleRad)) return point;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Applique les contraintes Shift et Alt aux formes
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @param {string} tool - Type d'outil (line, arrow, rectangle, circle)
 * @param {boolean} isShift - Contraindre les proportions
 * @param {boolean} isAlt - Dessiner depuis le centre
 * @returns {Object} {drawStart, drawEnd} - Points ajustés
 */
function applyShapeConstraints(
  start,
  end,
  tool,
  isShift = false,
  isAlt = false,
) {
  let drawStart = { ...start };
  let drawEnd = { ...end };
  let width = end.x - start.x;
  let height = end.y - start.y;

  // Shift : contraindre les proportions
  if (isShift) {
    if (tool === "line") {
      drawEnd = applyLine45Constraint(start, end);
    } else if (tool === "arrow") {
      drawEnd = applyLineConstraint(start, end);
    } else if (tool === "rectangle" || tool === "circle") {
      // Carré ou cercle parfait
      const maxSize = Math.max(Math.abs(width), Math.abs(height));
      const signWidth = Math.sign(width) || 1;
      const signHeight = Math.sign(height) || 1;
      drawEnd = {
        x: start.x + maxSize * signWidth,
        y: start.y + maxSize * signHeight,
      };
    }
    // Recalculer après contrainte
    width = drawEnd.x - start.x;
    height = drawEnd.y - start.y;
  }

  // Alt : dessiner depuis le centre
  if (isAlt) {
    drawStart = {
      x: start.x - width,
      y: start.y - height,
    };
  }

  return { drawStart, drawEnd };
}

/**
 * Applique le style de trait standard au contexte
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {string} color - Couleur du trait
 * @param {number} size - Épaisseur du trait
 */
function applyStrokeStyle(
  ctx,
  color = annotationStyle.color,
  size = annotationStyle.size,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/**
 * Dessine une forme sur le canvas
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @param {string} tool - Type de forme (rectangle, circle, line, arrow)
 */
function drawShapeOnCanvas(ctx, start, end, tool) {
  switch (tool) {
    case "rectangle":
      ctx.beginPath();
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.stroke();
      break;
    case "circle": {
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    case "arrow":
      drawArrowOnCanvas(ctx, start, end);
      break;
  }
}

/**
 * Dessine une flèche sur le canvas
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 */
function drawArrowOnCanvas(ctx, start, end, headScale = 1, doubleHead = false) {
  const headLength = Math.max(4, DRAWING_CONSTANTS.ARROW_HEAD_LENGTH * headScale);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  // Ligne principale
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Pointe de flèche
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  if (doubleHead) {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(
      start.x + headLength * Math.cos(angle - Math.PI / 6),
      start.y + headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(
      start.x + headLength * Math.cos(angle + Math.PI / 6),
      start.y + headLength * Math.sin(angle + Math.PI / 6),
    );
  }
  ctx.stroke();
}


// Multiplicateur pour le rapporteur (rayon = calibrationUnit * multiplier)
let protractorMultiplier = 1;

/**
 * Calcule un point stabilisé avec l'algorithme "Pulling String" (corde élastique)
 *
 * Le trait suit la souris avec un retard proportionnel au lissage :
 * - Plus le lissage est élevé (0-100%), plus la "corde" est longue (0-50 pixels de retard)
 * - Le trait ne bouge que quand la souris s'éloigne suffisamment du dernier point dessiné
 * - Résultat : courbes beaucoup plus lisses et naturelles
 *
 * @param {Object} rawPoint - Le point brut de la souris {x, y}
 * @param {Object} lastPoint - Le dernier point dessiné {x, y}
 * @returns {Object|null} Le point stabilisé {x, y}, ou null si la souris n'a pas assez bougé
 */
function calculateStabilizedPoint(rawPoint, lastPoint) {
  if (!lastPoint) return rawPoint;

  // Calcul de la distance entre le dernier point dessiné et la position brute
  const dx = rawPoint.x - lastPoint.x;
  const dy = rawPoint.y - lastPoint.y;
  const distance = getDistance(lastPoint, rawPoint);

  // La "longueur de corde" dépend de la force du stabilisateur
  // Force 0 = corde de 0 (réponse instantanée)
  // Force 1 = corde longue (beaucoup de retard/lissage)
  const stringLength = stabilizerStrength * DRAWING_CONSTANTS.STABILIZER_MAX_RETARD;

  if (distance <= stringLength) {
    // La souris n'a pas assez bougé, on ne dessine pas encore
    return null;
  }

  // Calculer le point sur la ligne entre lastPoint et rawPoint
  // à une distance de stringLength depuis rawPoint
  const ratio = (distance - stringLength) / distance;

  // Interpolation
  const smoothedX = lastPoint.x + dx * ratio;
  const smoothedY = lastPoint.y + dy * ratio;

  return { x: smoothedX, y: smoothedY };
}

/**
 * Version simple pour le laser (moyenne pondérée seulement)
 */
function calculateLaserStabilizedPoint() {
  if (stabilizerBuffer.length === 0) return { x: 0, y: 0 };
  if (stabilizerBuffer.length === 1) return stabilizerBuffer[0];

  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;

  // Pondération : les points récents ont plus de poids
  stabilizerBuffer.forEach((point, index) => {
    const weight = index + 1; // Linéaire simple
    sumX += point.x * weight;
    sumY += point.y * weight;
    totalWeight += weight;
  });

  return {
    x: sumX / totalWeight,
    y: sumY / totalWeight,
  };
}


/**
 * Trouve une borne de mesure à une position donnée
 */
function findEndpointAt(
  coords,
  threshold = DRAWING_CONSTANTS.ENDPOINT_THRESHOLD,
) {
  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;
    const caps = getShapeCapabilities(line.type);

    // Cercle editable: une seule poignée (endpoint "end")
    if (caps?.endpointMode === "single-end") {
      if (getDistance(coords, line.end) < threshold) {
        return { line, endpoint: "end" };
      }
      continue;
    }

    if (getDistance(coords, line.start) < threshold) {
      return { line, endpoint: "start" };
    }
    if (getDistance(coords, line.end) < threshold) {
      return { line, endpoint: "end" };
    }
  }
  return null;
}

function findEditableShapeControlAt(
  coords,
  threshold = 14,
  options = {},
) {
  const selectedOnly = options.selectedOnly !== false;
  for (const line of measurementLines) {
    if (!line || !line.control || !shapeHasCapability(line, "hasControlPoint")) {
      continue;
    }
    if (selectedOnly && typeof isIndividualShapeSelected === "function") {
      const isSelected =
        shapeHasCapability(line, "grouped")
          ? (typeof isShapeEdgeSelected === "function" && isShapeEdgeSelected(line))
          : isIndividualShapeSelected(line);
      if (!isSelected) continue;
    }
    const handlePoint = getShapeCurveHandlePoint(line);
    if (handlePoint && getDistance(coords, handlePoint) < threshold) {
      return line;
    }
  }
  return null;
}

/**
 * Trouve un label de mesure à une position donnée (measure, compass ou calibrate)
 */
function findLabelAt(coords) {
  for (const line of measurementLines) {
    if (!line || !line._labelBounds) continue;
    // Accepter les types measure, compass et calibrate
    if (
      line.type !== "measure" &&
      line.type !== "compass" &&
      line.type !== "calibrate"
    )
      continue;

    const bounds = line._labelBounds;
    if (
      coords.x >= bounds.x &&
      coords.x <= bounds.x + bounds.width &&
      coords.y >= bounds.y &&
      coords.y <= bounds.y + bounds.height
    ) {
      return line;
    }
  }
  return null;
}

/**
 * Trouve une ligne de mesure à une position donnée
 */
function findMeasurementLineAt(
  coords,
  threshold = DRAWING_CONSTANTS.HIT_THRESHOLD,
) {
  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;

    let dist;
    if ((line.type === "shape-line" || line.type === "shape-edge" || line.type === "shape-arrow") && line.control) {
      dist = getPointToQuadraticDistance(
        coords,
        line.start,
        line.control,
        line.end,
      );
    } else if (line.type === "shape-circle") {
      const minX = Math.min(line.start.x, line.end.x);
      const maxX = Math.max(line.start.x, line.end.x);
      const minY = Math.min(line.start.y, line.end.y);
      const maxY = Math.max(line.start.y, line.end.y);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rx = Math.max(1, (maxX - minX) / 2);
      const ry = Math.max(1, (maxY - minY) / 2);
      dist = getPointToEllipseDistance(coords, cx, cy, rx, ry);
    } else {
      dist = getPointToSegmentDistance(coords, line.start, line.end);
    }
    if (dist < threshold) return line;
  }
  return null;
}

function findDrawingHitTarget(
  coords,
  options = {},
) {
  if (!coords) return null;
  const {
    endpointThreshold = 15,
    lineThreshold = 15,
    controlThreshold = 14,
    includeControl = true,
    includeEndpoints = true,
    includeLabels = true,
    includeLines = true,
    selectedControlsOnly = true,
    includeEditableLabels = false,
  } = options;

  const hitCacheKey = JSON.stringify({
    x: Math.round(coords.x * 2) / 2,
    y: Math.round(coords.y * 2) / 2,
    endpointThreshold,
    lineThreshold,
    controlThreshold,
    includeControl,
    includeEndpoints,
    includeLabels,
    includeLines,
    selectedControlsOnly,
    includeEditableLabels,
    linesCount: measurementLines.length,
    selectedId: selectedMeasurement?.id || null,
    selectedGroup: selectedMeasurement?.shapeGroup || null,
    tool: currentTool,
    editMode: rectangleEditMode ? 1 : 0,
    frame: Math.floor((typeof performance !== "undefined" ? performance.now() : Date.now()) / 16),
  });
  if (!findDrawingHitTarget._cache) {
    findDrawingHitTarget._cache = { key: "", value: null };
  }
  if (findDrawingHitTarget._cache.key === hitCacheKey) {
    return findDrawingHitTarget._cache.value;
  }

  let result = null;
  if (includeControl) {
    const controlLine = findEditableShapeControlAt(coords, controlThreshold, {
      selectedOnly: selectedControlsOnly,
    });
    if (controlLine) {
      result = { kind: "control", line: controlLine };
      findDrawingHitTarget._cache = { key: hitCacheKey, value: result };
      return result;
    }
  }

  if (includeEndpoints) {
    const endpointHit = findEndpointAt(coords, endpointThreshold);
    if (endpointHit) {
      result = {
        kind: "endpoint",
        line: endpointHit.line,
        endpoint: endpointHit.endpoint,
      };
      findDrawingHitTarget._cache = { key: hitCacheKey, value: result };
      return result;
    }
  }

  if (includeLabels) {
    const labelHit = findLabelAt(coords);
    if (labelHit) {
      const isEditable = isEditableShape(labelHit);
      if (!isEditable || includeEditableLabels) {
        result = { kind: "label", line: labelHit };
        findDrawingHitTarget._cache = { key: hitCacheKey, value: result };
        return result;
      }
    }
  }

  if (includeLines) {
    const lineHit = findMeasurementLineAt(coords, lineThreshold);
    if (lineHit) {
      result = { kind: "line", line: lineHit };
      findDrawingHitTarget._cache = { key: hitCacheKey, value: result };
      return result;
    }
  }

  findDrawingHitTarget._cache = { key: hitCacheKey, value: null };
  return null;
}

/**
 * Calcule le facteur d'échelle pour les éléments visuels des mesures
 */
function getMeasureScaleFactor(canvas) {
  if (!canvas) return 1;
  // Ratio entre la taille interne du canvas et sa taille d'affichage
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return 1;
  return canvas.width / rect.width;
}

/**
 * Dessine une ligne lissée
 */
function drawSmoothLine(ctx, start, end, color, lineWidth, lineCap = "round") {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = lineCap;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

/**
 * Dessine un cercle lissé avec remplissage optionnel
 */
function drawSmoothCircle(
  ctx,
  x,
  y,
  radius,
  strokeColor,
  lineWidth,
  fillColor = null,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Dessine un point de terminaison (borne) de mesure
 */
function drawEndpoint(ctx, x, y, color, scaleFactor = 1) {
  const radius = DRAWING_CONSTANTS.ENDPOINT_RADIUS * scaleFactor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();
}

/**
 * Dessine un trait perpendiculaire à l'extrémité d'une mesure
 */
function drawEndpointTick(
  ctx,
  point,
  otherPoint,
  color,
  lineWidth,
  scaleFactor = 1,
) {
  const dx = otherPoint.x - point.x;
  const dy = otherPoint.y - point.y;
  const len = getDistance(point, otherPoint);
  if (len === 0) return;

  // Vecteur perpendiculaire normalisé
  const perpX = -dy / len;
  const perpY = dx / len;

  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_LARGE * scaleFactor;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(point.x - perpX * tickLength, point.y - perpY * tickLength);
  ctx.lineTo(point.x + perpX * tickLength, point.y + perpY * tickLength);
  ctx.stroke();
}

/**
 * Dessine une ligne avec des bornes aux extrémités
 */
function drawLineWithEndpoints(
  ctx,
  start,
  end,
  color,
  lineWidth,
  showEndpoints = true,
) {
  // Ligne principale
  drawSmoothLine(ctx, start, end, color, lineWidth);

  // Bornes perpendiculaires
  if (showEndpoints) {
    drawEndpointTick(ctx, start, end, color, lineWidth);
    drawEndpointTick(ctx, end, start, color, lineWidth);
  }
}
