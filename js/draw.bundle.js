// PoseChrono Drawing Module - Bundled from js/draw/
// Generated: 2026-02-14T14:32:35.953Z

// ================================================================
// MODULE: utils.js
// ================================================================

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
function buildShapeEdgeGroupPath(ctx, edgeLineOrGroupId) {
  if (!ctx) return false;
  const shapeGroupId =
    typeof edgeLineOrGroupId === "string"
      ? edgeLineOrGroupId
      : edgeLineOrGroupId?.shapeGroup;
  if (!shapeGroupId) return false;

  const groupLines = measurementLines.filter(
    (line) => line.type === "shape-edge" && line.shapeGroup === shapeGroupId,
  );
  if (groupLines.length === 0) return false;

  const corners = ["a", "b", "c", "d", "a"];
  const getEdge = (fromCorner, toCorner) =>
    groupLines.find(
      (line) =>
        (line.startCorner === fromCorner && line.endCorner === toCorner) ||
        (line.startCorner === toCorner && line.endCorner === fromCorner),
    );

  const segments = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const fromCorner = corners[i];
    const toCorner = corners[i + 1];
    const edge = getEdge(fromCorner, toCorner);
    if (!edge) return false;
    const forward =
      edge.startCorner === fromCorner && edge.endCorner === toCorner;
    segments.push({
      edge,
      start: forward ? edge.start : edge.end,
      end: forward ? edge.end : edge.start,
    });
  }

  if (segments.length === 0) return false;

  ctx.beginPath();
  ctx.moveTo(segments[0].start.x, segments[0].start.y);
  segments.forEach(({ edge, end }) => {
    if (edge.control) {
      ctx.quadraticCurveTo(edge.control.x, edge.control.y, end.x, end.y);
    } else {
      ctx.lineTo(end.x, end.y);
    }
  });
  ctx.closePath();
  return true;
}

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
  options = {},
) {
  const prioritizeSelected = options.prioritizeSelected !== false;
  const selectionBiasPx =
    Number.isFinite(options.selectionBiasPx) ? Math.max(0, options.selectionBiasPx) : 3;
  let bestSelected = null;
  let bestSelectedDist = threshold;
  let bestAny = null;
  let bestAnyDist = threshold;

  const isLineSelected = (line) => {
    if (!line || !isEditableShape(line)) return false;
    if (shapeHasCapability(line, "grouped")) {
      return typeof isShapeEdgeSelected === "function" && isShapeEdgeSelected(line);
    }
    return typeof isIndividualShapeSelected === "function" && isIndividualShapeSelected(line);
  };

  const registerHit = (line, endpointKey, dist) => {
    if (!(dist < threshold)) return;
    if (dist < bestAnyDist) {
      bestAnyDist = dist;
      bestAny = { line, endpoint: endpointKey };
    }
    if (prioritizeSelected && isLineSelected(line) && dist < bestSelectedDist) {
      bestSelectedDist = dist;
      bestSelected = { line, endpoint: endpointKey };
    }
  };

  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;
    const caps = getShapeCapabilities(line.type);

    // Cercle editable: une seule poignée (endpoint "end")
    if (caps?.endpointMode === "single-end") {
      registerHit(line, "end", getDistance(coords, line.end));
      continue;
    }

    registerHit(line, "start", getDistance(coords, line.start));
    registerHit(line, "end", getDistance(coords, line.end));
  }
  if (!prioritizeSelected || !bestSelected) return bestAny;
  if (!bestAny) return bestSelected;
  return bestSelectedDist <= bestAnyDist + selectionBiasPx ? bestSelected : bestAny;
}

function findEditableShapeControlAt(
  coords,
  threshold = 14,
  options = {},
) {
  const selectedOnly = options.selectedOnly !== false;
  const prioritizeSelected = options.prioritizeSelected !== false;
  const selectionBiasPx =
    Number.isFinite(options.selectionBiasPx) ? Math.max(0, options.selectionBiasPx) : 3;
  let bestSelected = null;
  let bestSelectedDist = threshold;
  let bestAny = null;
  let bestAnyDist = threshold;
  for (const line of measurementLines) {
    if (!line || !line.control || !shapeHasCapability(line, "hasControlPoint")) {
      continue;
    }
    const isSelected =
      shapeHasCapability(line, "grouped")
        ? (typeof isShapeEdgeSelected === "function" && isShapeEdgeSelected(line))
        : (typeof isIndividualShapeSelected === "function" && isIndividualShapeSelected(line));
    if (selectedOnly && !isSelected) continue;
    const handlePoint = getShapeCurveHandlePoint(line);
    const dist = handlePoint ? getDistance(coords, handlePoint) : Infinity;
    if (!(dist < threshold)) continue;
    if (dist < bestAnyDist) {
      bestAnyDist = dist;
      bestAny = line;
    }
    if (prioritizeSelected && isSelected && dist < bestSelectedDist) {
      bestSelectedDist = dist;
      bestSelected = line;
    }
  }
  if (!prioritizeSelected || !bestSelected) return bestAny;
  if (!bestAny) return bestSelected;
  return bestSelectedDist <= bestAnyDist + selectionBiasPx ? bestSelected : bestAny;
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
    const endpointHit = findEndpointAt(coords, endpointThreshold, {
      prioritizeSelected: true,
    });
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


// ================================================================
// MODULE: state.js
// ================================================================

// ================================================================
// DRAWING MANAGER - Encapsulation de l'état et de la logique
// ================================================================

class DrawingContext {
  constructor(type) {
    this.type = type; // 'normal' ou 'zoom'
    this.canvas = null;
    this.ctx = null;
    this.preview = null;
    this.previewCtx = null;
    this.measures = null;
    this.measuresCtx = null;
    this.lightbox = null;
    this.lightboxCtx = null;
    this.toolbar = null;
    this.targetImage = null;
    this.overlay = null;
  }

  get isZoom() { return this.type === 'zoom'; }
  get isNormal() { return this.type === 'normal'; }
}

class DrawingManager {
  constructor() {
    this.normal = new DrawingContext('normal');
    this.zoom = new DrawingContext('zoom');
    this.current = this.normal;
    
    // État partagé entre les deux contextes
    this.state = {
      currentTool: 'pencil',
      isDrawing: false,
      isActive: false,
      startPoint: null,
      lastDrawnPoint: null,
      wasShiftPressed: false,
      calibrationUnit: null,
      showPreciseCursor: false,
      lastMousePosition: { x: 0, y: 0 },
      wasOutsideCanvas: false,
      currentImageSrc: null,
      shapeSelection: {
        id: null,
        groupId: null,
        ids: [],
        groupIds: [],
      },
      shapeEditSession: {
        scaleSnapshot: null,
        circleSpaceBase: null,
        rotateSnapshot: null,
        multiSelectionSnapshot: null,
      },
    };
    
    // État des mesures (partagé)
    this.measurements = {
      lines: [], // [{id, start: {x,y}, end: {x,y}, type: 'measure'|'calibrate'}]
      selected: null,
      
      // Drag des bornes
      isDraggingEndpoint: false,
      draggedEndpoint: null, // 'start' ou 'end'
      hoveredEndpoint: null,
      
      // Drag de la mesure entière
      isDraggingMeasurement: false,
      dragOffset: null,
      
      // Drag du label
      isDraggingLabel: false,
      dragLabelMeasurement: null,
      
      // Configuration d'affichage
      visible: true,
      showCalibrateLine: true, // Afficher le segment de calibration
      lineWidth: DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH || 3,
      color: DRAWING_CONSTANTS.DEFAULT_MEASURE_COLOR,
      showSizeLabels: DRAWING_CONSTANTS.DEFAULT_SHOW_SIZE_LABELS,
      graduationType: DRAWING_CONSTANTS.DEFAULT_GRADUATION_TYPE,
      graduationSize: DRAWING_CONSTANTS.DEFAULT_GRADUATION_SIZE,
      labelSize: DRAWING_CONSTANTS.DEFAULT_MEASURE_LABEL_SIZE,
      
      // Options de proportions
      proportionsConfig: {
        showCenter: true,
        showThirds: true,
        showQuarters: false,
        showLabels: true,
        colorCenter: "#fbbf24",
        colorThirds: "#3b82f6",
        colorQuarters: "#a855f7",
      },
    };
    
    // Stabilisateur
    this.stabilizer = {
      enabled: typeof CONFIG !== "undefined" ? CONFIG.enableStabilizerByDefault : true,
      strength: 0.2, // 0 = pas de lissage, 1 = lissage maximum
      bufferSize: DRAWING_CONSTANTS.STABILIZER_BUFFER_SIZE,
      buffer: [],
    };
    
    // Laser
    this.laser = {
      points: [],
      animationId: null,
      shiftPreview: null,
    };
    
    // Table lumineuse
    this.lightbox = {
      enabled: false,
      opacity: typeof CONFIG !== "undefined" ? CONFIG.defaultLightboxOpacity : 0.5,
    };
    
    // Historique
    this.history = {
      drawing: [],
      index: -1,
      maxSize: DRAWING_CONSTANTS.MAX_HISTORY,
    };
  }

  getContext(type) {
    return type === 'zoom' ? this.zoom : this.normal;
  }

  setContext(type) {
    this.current = this.getContext(type);
  }

  get canvas() { return this.current.canvas; }
  get ctx() { return this.current.ctx; }
  get preview() { return this.current.preview; }
  get previewCtx() { return this.current.previewCtx; }
  get measures() { return this.current.measures; }
  get measuresCtx() { return this.current.measuresCtx; }
  get toolbar() { return this.current.toolbar; }
  get targetImage() { return this.current.targetImage; }
  get isZoom() { return this.current.isZoom; }
}

// Instance globale
const drawingManager = new DrawingManager();

// ================================================================
// LEGACY ALIASES — À MIGRER VERS drawingManager.*
// ================================================================
// Ces variables existent pour compatibilité avec le code existant.
// Tout nouveau code doit utiliser drawingManager.canvas, drawingManager.ctx, etc.
// Migration progressive : remplacer les usages directs par drawingManager.*
// puis supprimer ces alias et syncDrawingContext().
let drawingCanvas, drawingCtx, drawingPreview, drawingPreviewCtx;
let drawingMeasures, drawingMeasuresCtx, drawingLightboxCanvas, drawingLightboxCtx;
let drawingToolbar, targetImageElement;

// Fonction pour synchroniser les variables legacy avec le contexte courant
function syncDrawingContext() {
  const ctx = drawingManager.current;
  drawingCanvas = ctx.canvas;
  drawingCtx = ctx.ctx;
  drawingPreview = ctx.preview;
  drawingPreviewCtx = ctx.previewCtx;
  drawingMeasures = ctx.measures;
  drawingMeasuresCtx = ctx.measuresCtx;
  drawingLightboxCanvas = ctx.lightbox;
  drawingLightboxCtx = ctx.lightboxCtx;
  drawingToolbar = ctx.toolbar;
  targetImageElement = ctx.targetImage;
}

// Remplacer setContext pour synchroniser automatiquement
const originalSetContext = drawingManager.setContext.bind(drawingManager);
drawingManager.setContext = function(type) {
  originalSetContext(type);
  syncDrawingContext();
  // Reset compass state on context switch
  compassCenter = null;
  compassWaitingSecondClick = false;
  compassDragging = false;
  compassDragMoved = false;
};

// Fonction utilitaire
function withContext(contextType, fn) {
  const previous = drawingManager.current;
  drawingManager.setContext(contextType);
  try {
    return fn(drawingManager.current);
  } finally {
    drawingManager.current = previous;
    syncDrawingContext();
  }
}

// ================================================================
// ÉTAT PRINCIPAL DU DESSIN (legacy - alias vers DrawingManager)
// ================================================================
// Ces objets sont des références vers l'état du DrawingManager
// pour maintenir la compatibilité avec le code existant
const drawState = drawingManager.state;
const measureState = drawingManager.measurements;
const stabilizerState = drawingManager.stabilizer;
const laserState = drawingManager.laser;
const historyState = drawingManager.history;
const lightboxState = drawingManager.lightbox;

// ================================================================
// CONFIGURATION DU STYLE D'ANNOTATION
// ================================================================
const annotationStyle = {
  color: "#ff3333",
  size:
    typeof CONFIG !== "undefined" && CONFIG.defaultDrawingSize
      ? CONFIG.defaultDrawingSize
      : 4,
};

// ================================================================
// RÉFÉRENCES DOM DU MODE DESSIN
// ================================================================
const drawingDOM = {
  overlay: null,
  canvas: null,
  measures: null,
  preview: null,
  lightboxCanvas: null,
  toolbar: null,
  targetImage: null,
  resizeObserver: null,
  // Éléments UI cachés pour les hot paths (mousemove, animations)
  measureInfo: null,
  cursor: null,
  unitInfo: null,
  unitValue: null,
  totalDistanceInfo: null,
  totalDistanceValue: null,
};

const drawingStateCache = new Map();

// ================================================================
// ÉTAT DES TOUCHES MODIFICATEURS
// ================================================================
const keysState = {
  shift: false,
  alt: false,
  ctrl: false,
  space: false,
  s: false,
  q: false,
};

const RECTANGLE_EDIT_STORAGE_KEY = "posechrono_rectangle_edit_mode";
function loadRectangleEditMode() {
  try {
    const raw = localStorage.getItem(RECTANGLE_EDIT_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch (_) {
    return true;
  }
}

let rectangleEditMode = loadRectangleEditMode();
function saveRectangleEditMode() {
  try {
    localStorage.setItem(RECTANGLE_EDIT_STORAGE_KEY, rectangleEditMode ? "1" : "0");
  } catch (_) {}
}

const SHAPE_SAFE_SELECT_STORAGE_KEY = "posechrono_shape_safe_select_mode";
function loadShapeSafeSelectMode() {
  try {
    const raw = localStorage.getItem(SHAPE_SAFE_SELECT_STORAGE_KEY);
    if (raw === null) return false;
    return raw === "1";
  } catch (_) {
    return false;
  }
}

let shapeSafeSelectMode = loadShapeSafeSelectMode();
function saveShapeSafeSelectMode() {
  try {
    localStorage.setItem(
      SHAPE_SAFE_SELECT_STORAGE_KEY,
      shapeSafeSelectMode ? "1" : "0",
    );
  } catch (_) {}
}

const ERASER_SHAPE_MODE_STORAGE_KEY = "posechrono_eraser_shape_mode";
function loadEraserShapeMode() {
  try {
    const raw = localStorage.getItem(ERASER_SHAPE_MODE_STORAGE_KEY);
    if (raw === "keep-vector" || raw === "partial-raster") return raw;
    return "partial-raster";
  } catch (_) {
    return "partial-raster";
  }
}

let eraserShapeMode = loadEraserShapeMode();
function saveEraserShapeMode() {
  try {
    localStorage.setItem(ERASER_SHAPE_MODE_STORAGE_KEY, eraserShapeMode);
  } catch (_) {}
}

// updateStylusStateFromEvent et resetStylusStrokeState supprimées (no-op)
function getActivePencilStrokeSize() {
  return annotationStyle.size;
}

// ================================================================
// ALIASES POUR COMPATIBILITÉ (seront progressivement supprimés)
// ================================================================
// Ces getters/setters maintiennent la compatibilité tout en synchronisant
// automatiquement avec l'état du DrawingManager
function _getDrawState() { return drawingManager.state; }
function _getMeasureState() { return drawingManager.measurements; }
function _getStabilizerState() { return drawingManager.stabilizer; }
function _getLaserState() { return drawingManager.laser; }

Object.defineProperties(window, {
  // drawState aliases
  currentTool: { 
    get() { return _getDrawState().currentTool; },
    set(v) { _getDrawState().currentTool = v; }
  },
  isDrawing: { 
    get() { return _getDrawState().isDrawing; },
    set(v) { _getDrawState().isDrawing = v; }
  },
  startPoint: { 
    get() { return _getDrawState().startPoint; },
    set(v) { _getDrawState().startPoint = v; }
  },
  lastDrawnPoint: { 
    get() { return _getDrawState().lastDrawnPoint; },
    set(v) { _getDrawState().lastDrawnPoint = v; }
  },
  wasShiftPressed: { 
    get() { return _getDrawState().wasShiftPressed; },
    set(v) { _getDrawState().wasShiftPressed = v; }
  },
  calibrationUnit: { 
    get() { return _getDrawState().calibrationUnit; },
    set(v) { _getDrawState().calibrationUnit = v; }
  },
  showPreciseCursor: { 
    get() { return _getDrawState().showPreciseCursor; },
    set(v) { _getDrawState().showPreciseCursor = v; }
  },
  
  // measureState aliases
  measurementLines: { 
    get() { return _getMeasureState().lines; },
    set(v) { _getMeasureState().lines = v; }
  },
  selectedMeasurement: { 
    get() { return _getMeasureState().selected; },
    set(v) { _getMeasureState().selected = v; }
  },
  isDraggingEndpoint: { 
    get() { return _getMeasureState().isDraggingEndpoint; },
    set(v) { _getMeasureState().isDraggingEndpoint = v; }
  },
  draggedEndpoint: { 
    get() { return _getMeasureState().draggedEndpoint; },
    set(v) { _getMeasureState().draggedEndpoint = v; }
  },
  hoveredEndpointInfo: { 
    get() { return _getMeasureState().hoveredEndpoint; },
    set(v) { _getMeasureState().hoveredEndpoint = v; }
  },
  isDraggingMeasurement: { 
    get() { return _getMeasureState().isDraggingMeasurement; },
    set(v) { _getMeasureState().isDraggingMeasurement = v; }
  },
  dragMeasurementOffset: { 
    get() { return _getMeasureState().dragOffset; },
    set(v) { _getMeasureState().dragOffset = v; }
  },
  isDraggingLabel: { 
    get() { return _getMeasureState().isDraggingLabel; },
    set(v) { _getMeasureState().isDraggingLabel = v; }
  },
  dragLabelMeasurement: { 
    get() { return _getMeasureState().dragLabelMeasurement; },
    set(v) { _getMeasureState().dragLabelMeasurement = v; }
  },
  measureGraduationType: { 
    get() { return _getMeasureState().graduationType; },
    set(v) { _getMeasureState().graduationType = v; }
  },
  measureGraduationSize: { 
    get() { return _getMeasureState().graduationSize; },
    set(v) { _getMeasureState().graduationSize = v; }
  },
  measureLabelSize: { 
    get() { return _getMeasureState().labelSize; },
    set(v) { _getMeasureState().labelSize = v; }
  },
  measurementsVisible: { 
    get() { return _getMeasureState().visible; },
    set(v) { _getMeasureState().visible = v; }
  },
  measureColor: { 
    get() { return _getMeasureState().color; },
    set(v) { _getMeasureState().color = v; }
  },
  showMeasureSizeLabels: { 
    get() { return _getMeasureState().showSizeLabels; },
    set(v) { _getMeasureState().showSizeLabels = v; }
  },
  
  // stabilizerState aliases
  stabilizerEnabled: { 
    get() { return _getStabilizerState().enabled; },
    set(v) { _getStabilizerState().enabled = v; }
  },
  stabilizerStrength: { 
    get() { return _getStabilizerState().strength; },
    set(v) { _getStabilizerState().strength = v; }
  },
  stabilizerBufferSize: { 
    get() { return _getStabilizerState().bufferSize; },
    set(v) { _getStabilizerState().bufferSize = v; }
  },
  stabilizerBuffer: { 
    get() { return _getStabilizerState().buffer; },
    set(v) { _getStabilizerState().buffer = v; }
  },
  
  // laserState aliases
  laserPoints: { 
    get() { return _getLaserState().points; },
    set(v) { _getLaserState().points = v; }
  },
  laserAnimationId: { 
    get() { return _getLaserState().animationId; },
    set(v) { _getLaserState().animationId = v; }
  },
  laserShiftPreview: { 
    get() { return _getLaserState().shiftPreview; },
    set(v) { _getLaserState().shiftPreview = v; }
  },
});

// Constantes
const LASER_FADE_DURATION = DRAWING_CONSTANTS.LASER_FADE_DURATION;
const LASER_COLOR = DRAWING_CONSTANTS.LASER_COLOR;
let measureProportionsConfig = measureState.proportionsConfig;
let isDrawingModeActive = false;
let drawingOverlay = null;
let canvasResizeObserver = null;

// historyState aliases (getters/setters pour synchronisation)
Object.defineProperties(window, {
  drawingHistory: {
    get() { return drawingManager.history.drawing; },
    set(v) { drawingManager.history.drawing = v; }
  },
  drawingHistoryIndex: {
    get() { return drawingManager.history.index; },
    set(v) { drawingManager.history.index = v; }
  }
});


// ================================================================
// MODULE: zoom-manager.js
// ================================================================

// ================================================================
// ZOOM MANAGER - Gestion centralisée du zoom/pan/rotation
// ================================================================
const ZoomManager = {
  // État interne
  _state: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0, // En degrés
    minScale: DRAWING_CONSTANTS.MIN_SCALE,
    maxScale: DRAWING_CONSTANTS.MAX_SCALE,
    zoomStep: 0.1,
    // Pan
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0,
    // Rotation
    isRotating: false,
    rotateStartAngle: 0, // Angle au début du drag (degrés)
    rotateCenterX: 0, // Centre de rotation (screen coords)
    rotateCenterY: 0,
    rotateStartMouseAngle: 0, // Angle souris au début du drag (radians)
    // Inertie du pan
    panSamples: [], // [{x, y, time}]
    inertiaAnimId: null,
  },

  // Getters
  get scale() {
    return this._state.scale;
  },
  get offsetX() {
    return this._state.offsetX;
  },
  get offsetY() {
    return this._state.offsetY;
  },
  get rotation() {
    return this._state.rotation;
  },
  get isPanning() {
    return this._state.isPanning;
  },
  get isRotating() {
    return this._state.isRotating;
  },

  // Setters avec mise à jour des aliases globaux pour compatibilité
  _updateAliases() {
    canvasZoomScale = this._state.scale;
    canvasZoomOffsetX = this._state.offsetX;
    canvasZoomOffsetY = this._state.offsetY;
  },

  // Zoom relatif (pour molette ou Ctrl+/-)
  // screenX, screenY : position du curseur par rapport au centre de l'écran (en pixels)
  zoom(delta, screenX, screenY) {
    if (!this._state.isPanning) this._setTransition(true);
    const oldScale = this._state.scale;
    const newScale = Math.max(
      this._state.minScale,
      Math.min(this._state.maxScale, oldScale + delta),
    );

    if (newScale === oldScale) return false;

    // Le facteur de changement d'échelle
    const deltaScale = newScale / oldScale;

    // Compensation : le point sous le curseur doit rester fixe
    this._state.offsetX -= screenX * (deltaScale - 1);
    this._state.offsetY -= screenY * (deltaScale - 1);
    this._state.scale = newScale;

    // Limiter les offsets pour garder l'image visible
    this._clampOffsets();

    this._updateAliases();
    this._applyTransform();
    return true;
  },

  // Obtenir le canvas via DrawingManager (découplage des globales)
  _getCanvas() {
    return this._isZoomMode()
      ? drawingManager.getContext("zoom").canvas
      : drawingManager.getContext("normal").canvas;
  },

  // Calculer l'offset maximum pour un axe donné
  _getMaxOffset(axis) {
    const canvas = this._getCanvas();
    if (!canvas) return 0;
    const viewportSize = axis === "x" ? window.innerWidth : window.innerHeight;
    const imageSize =
      (axis === "x" ? canvas.width : canvas.height) * this._state.scale;
    return Math.max(
      0,
      (imageSize - viewportSize * DRAWING_CONSTANTS.ZOOM_VIEWPORT_CLAMP_FACTOR) / 2,
    );
  },

  // Pan libre, pas de clamping
  _clampOffsets() {
    // Intentionnellement vide : pan libre sans limitation
  },

  // Zoom avec delta positif/négatif (pour raccourcis)
  zoomIn() {
    // Zoom vers le centre du conteneur
    const container = this._getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (this._isZoomMode()) {
      this.zoom(this._state.zoomStep, 0, 0);
    } else {
      this.zoom(this._state.zoomStep, rect.width / 2, rect.height / 2);
    }
  },

  zoomOut() {
    // Zoom vers le centre du conteneur
    const container = this._getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (this._isZoomMode()) {
      this.zoom(-this._state.zoomStep, 0, 0);
    } else {
      this.zoom(-this._state.zoomStep, rect.width / 2, rect.height / 2);
    }
  },

  // Définir le zoom directement
  setZoom(scale, offsetX, offsetY) {
    this._state.scale = Math.max(
      this._state.minScale,
      Math.min(this._state.maxScale, scale),
    );
    this._state.offsetX = offsetX;
    this._state.offsetY = offsetY;
    this._updateAliases();
    this._applyTransform();
  },

  // Réinitialiser zoom, pan ET rotation
  reset() {
    this._stopInertia();
    this._setTransition(false);
    this._state.scale = 1;
    this._state.offsetX = 0;
    this._state.offsetY = 0;
    this._state.rotation = 0;
    this._state.isPanning = false;
    this._state.isRotating = false;
    this._updateAliases();
    this._applyTransform();
  },

  // ================================================================
  // PAN avec inertie
  // ================================================================

  // Démarrer le pan
  startPan(startX, startY) {
    this._stopInertia();
    this._setTransition(false);
    this._state.isPanning = true;
    this._state.panStartX = startX;
    this._state.panStartY = startY;
    this._state.panStartOffsetX = this._state.offsetX;
    this._state.panStartOffsetY = this._state.offsetY;
    this._state.panSamples = [{ x: startX, y: startY, time: performance.now() }];
  },

  // Mettre à jour le pan
  pan(currentX, currentY) {
    if (!this._state.isPanning) return;
    this._state.offsetX =
      this._state.panStartOffsetX + (currentX - this._state.panStartX);
    this._state.offsetY =
      this._state.panStartOffsetY + (currentY - this._state.panStartY);
    // Limiter les offsets pour garder l'image visible
    this._clampOffsets();
    this._updateAliases();
    this._applyTransform();

    // Enregistrer un échantillon pour l'inertie
    const now = performance.now();
    const samples = this._state.panSamples;
    samples.push({ x: currentX, y: currentY, time: now });
    // Garder seulement les N derniers échantillons
    const maxSamples = DRAWING_CONSTANTS.PAN_VELOCITY_SAMPLES;
    if (samples.length > maxSamples) {
      samples.splice(0, samples.length - maxSamples);
    }
  },

  // Terminer le pan (avec inertie optionnelle)
  endPan() {
    if (!this._state.isPanning) return;
    this._state.isPanning = false;

    // Calculer la vélocité à partir des échantillons
    const samples = this._state.panSamples;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.time - first.time;
      if (dt > 0 && dt < 200) { // Seulement si le mouvement est récent
        const vx = (last.x - first.x) / (dt / 16.67); // Vélocité en px/frame
        const vy = (last.y - first.y) / (dt / 16.67);
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > DRAWING_CONSTANTS.PAN_INERTIA_MIN_VELOCITY) {
          this._startInertia(vx, vy);
          return;
        }
      }
    }

    this._setTransition(true);
  },

  _startInertia(vx, vy) {
    this._stopInertia();
    const friction = DRAWING_CONSTANTS.PAN_INERTIA_FRICTION;
    const minVel = DRAWING_CONSTANTS.PAN_INERTIA_MIN_VELOCITY;
    let velX = vx;
    let velY = vy;

    const step = () => {
      velX *= friction;
      velY *= friction;

      if (Math.abs(velX) < minVel && Math.abs(velY) < minVel) {
        this._state.inertiaAnimId = null;
        return;
      }

      this._state.offsetX += velX;
      this._state.offsetY += velY;
      this._clampOffsets();
      this._updateAliases();
      this._applyTransform();

      this._state.inertiaAnimId = requestAnimationFrame(step);
    };

    this._state.inertiaAnimId = requestAnimationFrame(step);
  },

  _stopInertia() {
    if (this._state.inertiaAnimId) {
      cancelAnimationFrame(this._state.inertiaAnimId);
      this._state.inertiaAnimId = null;
    }
  },

  // ================================================================
  // ROTATION
  // ================================================================

  // Démarrer la rotation (Shift+Space+clic)
  startRotate(clientX, clientY) {
    this._stopInertia();
    this._setTransition(false);
    this._state.isRotating = true;

    // Centre de rotation = centre du conteneur à l'écran
    const container = this._getContainer();
    if (container) {
      const rect = container.getBoundingClientRect();
      this._state.rotateCenterX = rect.left + rect.width / 2;
      this._state.rotateCenterY = rect.top + rect.height / 2;
    } else {
      this._state.rotateCenterX = window.innerWidth / 2;
      this._state.rotateCenterY = window.innerHeight / 2;
    }

    // Angle de la souris par rapport au centre (en radians)
    this._state.rotateStartMouseAngle = Math.atan2(
      clientY - this._state.rotateCenterY,
      clientX - this._state.rotateCenterX,
    );
    this._state.rotateStartAngle = this._state.rotation;
  },

  // Mettre à jour la rotation
  rotate(clientX, clientY) {
    if (!this._state.isRotating) return;

    const currentMouseAngle = Math.atan2(
      clientY - this._state.rotateCenterY,
      clientX - this._state.rotateCenterX,
    );

    const deltaAngle = (currentMouseAngle - this._state.rotateStartMouseAngle) * (180 / Math.PI);
    let newRotation = this._state.rotateStartAngle + deltaAngle;

    // Normaliser entre -180 et 180
    while (newRotation > 180) newRotation -= 360;
    while (newRotation < -180) newRotation += 360;

    // Snap à 0° si proche (pour faciliter le retour à la position initiale)
    const snapThreshold = DRAWING_CONSTANTS.ROTATION_SNAP_THRESHOLD;
    if (Math.abs(newRotation) < snapThreshold) {
      newRotation = 0;
    }

    this._state.rotation = newRotation;
    this._applyTransform();
  },

  // Terminer la rotation
  endRotate() {
    this._state.isRotating = false;
    this._setTransition(true);
  },

  // ================================================================
  // SCROLLBARS
  // ================================================================

  // Cache pour le conteneur principal (évite querySelector répétés)
  _mainContainer: null,

  // Éléments scrollbar
  _scrollbars: { h: null, v: null, trackH: null, trackV: null },
  _isDraggingScrollbar: false,
  _scrollbarDragStart: { x: 0, y: 0, ratioX: 0, ratioY: 0 },

  // Créer les barres de défilement
  _createScrollbars() {
    if (this._scrollbars.trackV || !CONFIG.enableZoomScrollbars) return; // Déjà créées ou désactivé

    // Calculer la position selon la sidebar
    const margin = DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MARGIN;
    const sidebarWidth = state.showSidebar ? DRAWING_CONSTANTS.ZOOM_SIDEBAR_WIDTH : 0;
    const vScrollbarRight = margin + sidebarWidth;

    // Barre VERTICALE - positionnée à droite de l'écran
    this._scrollbars.trackV = document.createElement("div");
    this._scrollbars.trackV.className = "zoom-scrollbar-v-track";
    this._scrollbars.trackV.style.cssText = `
      position: fixed;
      top: ${margin}px;
      right: ${vScrollbarRight}px;
      width: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_WIDTH}px;
      height: calc(100vh - ${margin * 2}px);
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_TRACK_OPACITY});
      border-radius: 3px;
      pointer-events: auto;
      cursor: pointer;
      z-index: 1000;
    `;

    this._scrollbars.v = document.createElement("div");
    this._scrollbars.v.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THUMB_OPACITY});
      border-radius: 3px;
      cursor: grab;
      transition: background 0.2s;
      min-height: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MIN_THUMB}px;
    `;
    this._scrollbars.trackV.appendChild(this._scrollbars.v);
    document.body.appendChild(this._scrollbars.trackV);

    // Barre HORIZONTALE - collée au bord inférieur
    const hScrollbarWidth = window.innerWidth - sidebarWidth - margin * 3;

    this._scrollbars.trackH = document.createElement("div");
    this._scrollbars.trackH.className = "zoom-scrollbar-h-track";
    this._scrollbars.trackH.style.cssText = `
      position: fixed;
      bottom: ${margin}px;
      left: ${margin}px;
      width: ${hScrollbarWidth}px;
      height: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_WIDTH}px;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_TRACK_OPACITY});
      border-radius: 3px;
      pointer-events: auto;
      cursor: pointer;
      z-index: 1000;
    `;

    // Thumb horizontal
    this._scrollbars.h = document.createElement("div");
    this._scrollbars.h.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THUMB_OPACITY});
      border-radius: 3px;
      cursor: grab;
      transition: background 0.2s;
      min-width: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MIN_THUMB}px;
    `;
    this._scrollbars.trackH.appendChild(this._scrollbars.h);
    document.body.appendChild(this._scrollbars.trackH);

    // Événements
    this._setupScrollbarEvents();
  },

  // Supprimer les barres de défilement
  _removeScrollbars() {
    if (this._scrollbars.trackV) {
      this._scrollbars.trackV.remove();
      this._scrollbars.trackV = null;
      this._scrollbars.v = null;
    }
    if (this._scrollbars.trackH) {
      this._scrollbars.trackH.remove();
      this._scrollbars.trackH = null;
      this._scrollbars.h = null;
    }
  },

  // Configurer les événements des scrollbars
  _setupScrollbarEvents() {
    const handleDragStart = (e, isHorizontal) => {
      e.preventDefault();
      e.stopPropagation();
      this._setTransition(false);
      this._isDraggingScrollbar = isHorizontal ? "h" : "v";
      // Stocker la position initiale du thumb (en ratio 0-1)
      this._scrollbarDragStart.ratioX = this._getScrollRatioX();
      this._scrollbarDragStart.ratioY = this._getScrollRatioY();
      // Stocker la position initiale de la souris
      this._scrollbarDragStart.x = e.clientX;
      this._scrollbarDragStart.y = e.clientY;
      e.target.style.cursor = "grabbing";
    };

    this._scrollbars.h.addEventListener("mousedown", (e) =>
      handleDragStart(e, true),
    );
    this._scrollbars.v.addEventListener("mousedown", (e) =>
      handleDragStart(e, false),
    );

    // Click sur les tracks (page up/down)
    this._scrollbars.trackH.addEventListener("mousedown", (e) => {
      if (e.target === this._scrollbars.h) return;
      e.preventDefault();
      const rect = this._scrollbars.trackH.getBoundingClientRect();
      const clickRatio = (e.clientX - rect.left) / rect.width;
      const currentRatio = this._getScrollRatioX() + 0.5; // convertir de -0.5..0.5 à 0..1
      // Déplacer d'une "page" vers le click
      const direction = clickRatio > currentRatio ? 1 : -1;
      const pageSize = DRAWING_CONSTANTS.SCROLL_PAGE_SIZE; // 20% par click
      this._scrollToRatio(
        Math.max(0, Math.min(1, currentRatio + direction * pageSize)),
        null,
      );
    });

    this._scrollbars.trackV.addEventListener("mousedown", (e) => {
      if (e.target === this._scrollbars.v) return;
      e.preventDefault();
      const rect = this._scrollbars.trackV.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      const currentRatio = this._getScrollRatioY() + 0.5; // convertir de -0.5..0.5 à 0..1
      const direction = clickRatio > currentRatio ? 1 : -1;
      const pageSize = DRAWING_CONSTANTS.SCROLL_PAGE_SIZE;
      this._scrollToRatio(
        null,
        Math.max(0, Math.min(1, currentRatio + direction * pageSize)),
      );
    });

    // Drag global - le thumb suit la souris (handlers stockés pour cleanup)
    globalEventHandlers.scrollbarMouseMove = (e) => {
      if (!this._isDraggingScrollbar) return;

      if (this._isDraggingScrollbar === "h") {
        const trackRect = this._scrollbars.trackH.getBoundingClientRect();
        const deltaPixels = e.clientX - this._scrollbarDragStart.x;
        const deltaRatio = deltaPixels / trackRect.width;
        const newRatio = this._scrollbarDragStart.ratioX + deltaRatio;
        this._scrollToRatio(newRatio + 0.5, null);
      } else {
        const trackRect = this._scrollbars.trackV.getBoundingClientRect();
        const deltaPixels = e.clientY - this._scrollbarDragStart.y;
        const deltaRatio = deltaPixels / trackRect.height;
        const newRatio = this._scrollbarDragStart.ratioY + deltaRatio;
        this._scrollToRatio(null, newRatio + 0.5);
      }
    };
    document.addEventListener("mousemove", globalEventHandlers.scrollbarMouseMove);

    globalEventHandlers.scrollbarMouseUp = () => {
      if (this._isDraggingScrollbar) {
        if (this._scrollbars.h) this._scrollbars.h.style.cursor = "grab";
        if (this._scrollbars.v) this._scrollbars.v.style.cursor = "grab";
        this._isDraggingScrollbar = false;
        this._setTransition(true);
      }
    };
    document.addEventListener("mouseup", globalEventHandlers.scrollbarMouseUp);
  },

  // Obtenir le ratio de scroll actuel (-0.5 à 0.5, 0 = centré)
  _getScrollRatioX() {
    const maxOffsetX = this._getMaxOffset("x");
    if (maxOffsetX === 0) return 0;
    return this._state.offsetX / (2 * maxOffsetX); // -0.5 à 0.5
  },

  _getScrollRatioY() {
    const maxOffsetY = this._getMaxOffset("y");
    if (maxOffsetY === 0) return 0;
    return this._state.offsetY / (2 * maxOffsetY); // -0.5 à 0.5
  },

  // Scroll à un ratio donné (0-1)
  // ratio 0 = début (gauche/haut), ratio 1 = fin (droite/bas)
  _scrollToRatio(ratioX, ratioY) {
    const maxOffsetX = this._getMaxOffset("x");
    const maxOffsetY = this._getMaxOffset("y");

    if (ratioX !== null) {
      this._state.offsetX = -(ratioX - 0.5) * 2 * maxOffsetX;
    }
    if (ratioY !== null) {
      this._state.offsetY = -(ratioY - 0.5) * 2 * maxOffsetY;
    }

    this._clampOffsets();
    this._updateAliases();
    this._applyTransform();
  },

  // Mettre à jour la position selon la sidebar
  _updateScrollbarPosition() {
    const margin = DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MARGIN;
    const sidebarWidth = state.showSidebar ? DRAWING_CONSTANTS.ZOOM_SIDEBAR_WIDTH : 0;

    if (this._scrollbars.trackV) {
      this._scrollbars.trackV.style.right = `${margin + sidebarWidth}px`;
    }

    if (this._scrollbars.trackH) {
      const hScrollbarWidth = window.innerWidth - sidebarWidth - margin * 3;
      this._scrollbars.trackH.style.width = `${hScrollbarWidth}px`;
    }
  },

  // Mettre à jour la position et taille des thumbs
  _updateScrollbars() {
    if (!this._scrollbars.h) return;

    const canvas = this._getCanvas();
    if (!canvas) return;

    const scale = this._state.scale;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;

    // Taille relative du thumb (viewport / image)
    const thumbWidth = Math.min(1, viewportWidth / imageWidth);
    const thumbHeight = Math.min(1, viewportHeight / imageHeight);

    // Position (0-1) en utilisant les mêmes méthodes que le drag
    const ratioX = this._getScrollRatioX() + 0.5; // convertir -0.5..0.5 à 0..1
    const ratioY = this._getScrollRatioY() + 0.5;

    // Cacher si pas de scroll nécessaire
    const needsScroll = scale > DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THRESHOLD;
    this._scrollbars.trackH.style.opacity = needsScroll ? "1" : "0";
    this._scrollbars.trackV.style.opacity = needsScroll ? "1" : "0";

    if (needsScroll) {
      // Appliquer taille et position
      this._scrollbars.h.style.width = `${thumbWidth * 100}%`;
      this._scrollbars.h.style.left = `${ratioX * (100 - thumbWidth * 100)}%`;
      this._scrollbars.v.style.height = `${thumbHeight * 100}%`;
      this._scrollbars.v.style.top = `${ratioY * (100 - thumbHeight * 100)}%`;
    }
  },

  // ================================================================
  // CONTENEUR & UTILITAIRES
  // ================================================================

  // Obtenir le conteneur à transformer
  _getContainer() {
    if (zoomDrawingOverlay) return zoomDrawingOverlay;
    if (!this._mainContainer) {
      this._mainContainer = document.querySelector(".image-wrapper");
    }
    return this._mainContainer;
  },

  // Vérifier si on est en mode zoom
  _isZoomMode() {
    return !!zoomDrawingOverlay;
  },

  // Réinitialiser le cache du conteneur (appelé quand on change de mode)
  _resetContainerCache() {
    this._mainContainer = null;
  },

  // Gestion de l'animation de zoom (CSS transition)
  _setTransition(enabled) {
    if (!CONFIG.zoomAnimated) return;
    const container = this._getContainer();
    if (!container) return;
    const val = enabled
      ? `transform ${DRAWING_CONSTANTS.ZOOM_ANIMATION_DURATION_MS}ms ease-out`
      : "none";
    container.style.transition = val;
    if (this._isZoomMode() && zoomTargetImage) {
      zoomTargetImage.style.transition = val;
    }
  },

  // Appliquer la transformation CSS
  _applyTransform() {
    const { scale, offsetX, offsetY, rotation } = this._state;
    const container = this._getContainer();
    if (!container) return;

    // Construire la transformation selon le mode
    // Ordre : translate → rotate → scale
    const rotateStr = rotation !== 0 ? ` rotate(${rotation}deg)` : "";
    let transform;
    if (this._isZoomMode()) {
      transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))${rotateStr} scale(${scale})`;
    } else {
      transform = `translate(${offsetX}px, ${offsetY}px)${rotateStr} scale(${scale})`;
    }

    container.style.transform = transform;
    container.style.transformOrigin = "center center";

    // Gestion de la classe zoom-active (uniquement pertinent pour le mode principal)
    const isTransformed = scale !== 1 || rotation !== 0;
    if (!this._isZoomMode() && isTransformed) {
      container.classList.add("zoom-active");
    } else if (!this._isZoomMode()) {
      container.classList.remove("zoom-active");
    }

    // Mode zoom : synchroniser aussi l'image cible
    if (this._isZoomMode() && zoomTargetImage) {
      zoomTargetImage.style.transform = `translate(${offsetX}px, ${offsetY}px)${rotateStr} scale(${scale})`;
      zoomTargetImage.style.transformOrigin = "center center";
    }

    // Gérer les scrollbars
    if (scale > DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THRESHOLD) {
      this._createScrollbars();
      this._updateScrollbarPosition();
      this._updateScrollbars();
    } else {
      this._removeScrollbars();
    }

    // Mettre à jour les indicateurs
    updateZoomIndicator();
  },
};


// ================================================================
// MODULE: canvas.js
// ================================================================

/**
 * Configure les dimensions d'un canvas pour correspondre à une image avec object-fit: contain
 * @param {HTMLImageElement} imgElement - L'élément image
 * @returns {Object} { displayWidth, displayHeight, naturalWidth, naturalHeight }
 */
function calculateCanvasDimensions(imgElement) {
  const imgRect = imgElement.getBoundingClientRect();
  const naturalWidth = imgElement.naturalWidth;
  const naturalHeight = imgElement.naturalHeight;
  const naturalRatio = naturalWidth / naturalHeight;
  const containerRatio = imgRect.width / imgRect.height;

  let displayWidth, displayHeight;
  if (naturalRatio > containerRatio) {
    displayWidth = imgRect.width;
    displayHeight = imgRect.width / naturalRatio;
  } else {
    displayHeight = imgRect.height;
    displayWidth = imgRect.height * naturalRatio;
  }

  return { displayWidth, displayHeight, naturalWidth, naturalHeight };
}

// ================================================================
// DRAWING OVERLAY MODE - Fonctions principales
// ================================================================

/**
 * Active le mode dessin en overlay sur l'image actuelle
 */

/**
 * Configure les dimensions des canvas pour correspondre à l'image
 */
function setupDrawingCanvasDimensions() {
  if (!targetImageElement || !drawingOverlay) return;

  // Attendre que l'image soit chargée
  if (!targetImageElement.complete) {
    targetImageElement.onload = setupDrawingCanvasDimensions;
    return;
  }

  // Obtenir les dimensions naturelles de l'image
  const naturalWidth = targetImageElement.naturalWidth;
  const naturalHeight = targetImageElement.naturalHeight;

  // Obtenir les dimensions et position affichées de l'image
  const imageRect = targetImageElement.getBoundingClientRect();
  const displayWidth = imageRect.width;
  const displayHeight = imageRect.height;

  // Obtenir la position du wrapper parent
  const wrapper = targetImageElement.parentElement;
  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculer l'offset de l'image par rapport au wrapper
  const offsetX = imageRect.left - wrapperRect.left;
  const offsetY = imageRect.top - wrapperRect.top;

  // Positionner l'overlay exactement sur l'image
  drawingOverlay.style.left = offsetX + "px";
  drawingOverlay.style.top = offsetY + "px";
  drawingOverlay.style.width = displayWidth + "px";
  drawingOverlay.style.height = displayHeight + "px";

  // Configurer chaque canvas
  const canvases = [
    drawingCanvas,
    drawingMeasures,
    drawingPreview,
    drawingLightboxCanvas,
  ];

  canvases.forEach((canvas) => {
    if (canvas) {
      // Résolution interne = dimensions naturelles (pour la qualité)
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;

      // Taille d'affichage = dimensions affichées de l'image
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";
    }
  });

  debugLog(
    "Canvas dimensions:",
    naturalWidth,
    "x",
    naturalHeight,
    "affichées:",
    displayWidth,
    "x",
    displayHeight,
    "offset:",
    offsetX,
    offsetY,
  );
}

/**
 * Configure le ResizeObserver pour gérer le redimensionnement
 */
function setupCanvasResizeObserver() {
  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
  }

  canvasResizeObserver = new ResizeObserver((entries) => {
    if (!isDrawingModeActive) return;

    for (const entry of entries) {
      if (entry.target === targetImageElement) {
        // Sauvegarder l'état du canvas
        const savedState = drawingCanvas ? drawingCanvas.toDataURL() : null;
        const savedMeasures = drawingMeasures
          ? drawingMeasures.toDataURL()
          : null;

        // Mettre à jour les dimensions
        setupDrawingCanvasDimensions();

        // Restaurer l'état
        if (savedState && drawingCtx) {
          const img = new Image();
          img.onload = () => {
            drawingCtx.drawImage(
              img,
              0,
              0,
              drawingCanvas.width,
              drawingCanvas.height,
            );
          };
          img.src = savedState;
        }
        if (savedMeasures && drawingMeasuresCtx) {
          const img = new Image();
          img.onload = () => {
            drawingMeasuresCtx.drawImage(
              img,
              0,
              0,
              drawingMeasures.width,
              drawingMeasures.height,
            );
          };
          img.src = savedMeasures;
        }
      }
    }
  });

  if (targetImageElement) {
    canvasResizeObserver.observe(targetImageElement);
  }

  // Gérer aussi le redimensionnement de la fenêtre
  window.addEventListener("resize", handleDrawingWindowResize);
}

/**
 * Gère le redimensionnement de la fenêtre
 */
function handleDrawingWindowResize() {
  if (!isDrawingModeActive) return;

  resizeDebouncer.debounce(() => {
    if (targetImageElement) {
      const savedState = drawingCanvas ? drawingCanvas.toDataURL() : null;
      setupDrawingCanvasDimensions();
      if (savedState && drawingCtx) {
        const img = new Image();
        img.onload = () => {
          drawingCtx.drawImage(
            img,
            0,
            0,
            drawingCanvas.width,
            drawingCanvas.height,
          );
        };
        img.src = savedState;
      }
    }
  }, DRAWING_CONSTANTS.RESIZE_DEBOUNCE_MS);
}

/**
 * Efface tous les canvas du mode overlay
 */
function clearAllDrawingCanvases(context = null) {
  const contexts = context ? [drawingManager.getContext(context)] : [drawingManager.normal, drawingManager.zoom];
  contexts.forEach(ctx => {
    if (ctx.ctx && ctx.canvas) clearCanvas(ctx.ctx, ctx.canvas);
    if (ctx.measuresCtx && ctx.measures) clearCanvas(ctx.measuresCtx, ctx.measures);
    if (ctx.previewCtx && ctx.preview) clearCanvas(ctx.previewCtx, ctx.preview);
    if (ctx.lightboxCtx && ctx.lightbox) clearCanvas(ctx.lightboxCtx, ctx.lightbox);
  });
}

// Curseurs SVG mis en cache (constantes, le SVG ne change jamais)
const CACHED_CURSORS = (() => {
  const deleteSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.9)" stroke="white" stroke-width="1.5"/><line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const cycleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960"><circle cx="480" cy="-480" r="420" fill="rgba(94, 234, 212, 0.9)" stroke="white" stroke-width="40"/><path d="m482-200 114-113-114-113-42 42 43 43q-28 1-54.5-9T381-381q-20-20-30.5-46T340-479q0-17 4.5-34t12.5-33l-44-44q-17 25-25 53t-8 57q0 38 15 75t44 66q29 29 65 43.5t74 15.5l-38 38 42 42Zm165-170q17-25 25-53t8-57q0-38-14.5-75.5T622-622q-29-29-65.5-43T482-679l38-39-42-42-114 113 114 113 42-42-44-44q27 0 55 10.5t48 30.5q20 20 30.5 46t10.5 52q0 17-4.5 34T603-414l44 44Z" fill="white"/></svg>`;
  const duplicateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(34, 197, 94, 0.9)" stroke="white" stroke-width="1.5"/><line x1="12" y1="7" x2="12" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  return {
    delete: `url("data:image/svg+xml,${encodeURIComponent(deleteSvg)}") 12 12, pointer`,
    cycle: `url("data:image/svg+xml,${encodeURIComponent(cycleSvg)}") 12 12, pointer`,
    duplicate: `url("data:image/svg+xml,${encodeURIComponent(duplicateSvg)}") 12 12, copy`,
  };
})();

function getDeleteCursor() {
  return CACHED_CURSORS.delete;
}

function getCycleCursor() {
  return CACHED_CURSORS.cycle;
}

function getDuplicateCursor() {
  return CACHED_CURSORS.duplicate;
}

/**
 * Met à jour le curseur de duplication quand Alt est pressé
 */
function updateAltDuplicateCursor() {
  if (!drawingPreview || !keysState.alt) return;

  // Utiliser la dernière position connue de la souris
  const rect = drawingPreview.getBoundingClientRect();
  const coords = {
    x:
      ((lastMousePosition.x - rect.left) * (drawingCanvas?.width || 1)) /
      rect.width,
    y:
      ((lastMousePosition.y - rect.top) * (drawingCanvas?.height || 1)) /
      rect.height,
  };

  const lineHit = findMeasurementLineAt(coords, 20);
  if (lineHit) {
    // Pas de duplication pour les calibrations
    if (lineHit.type === "calibrate") {
      drawingPreview.style.cursor = "not-allowed";
    } else {
      drawingPreview.style.cursor = getDuplicateCursor();
    }
  }
}

/**
 * Convertit les coordonnées de la souris en coordonnées canvas.
 * Prend en compte la rotation et le zoom CSS du conteneur.
 */
function getDrawingCoordinates(e, context = null) {
  const ctx = context ? drawingManager.getContext(context) : drawingManager.current;
  if (!ctx.preview || !ctx.canvas) return { x: 0, y: 0 };

  const rotation = ZoomManager.rotation;

  if (rotation === 0) {
    // Pas de rotation : calcul rapide classique
    const rect = ctx.preview.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const scaleX = ctx.canvas.width / rect.width;
    const scaleY = ctx.canvas.height / rect.height;
    return { x: relX * scaleX, y: relY * scaleY };
  }

  // Avec rotation : getBoundingClientRect() donne l'AABB (bounding box englobant)
  // qui est agrandi par la rotation → les coordonnées rect.left/top sont fausses.
  // On passe par le centre (qui reste correct) + rotation inverse.

  const rect = ctx.preview.getBoundingClientRect();
  const centerScreenX = rect.left + rect.width / 2;
  const centerScreenY = rect.top + rect.height / 2;

  // Vecteur souris → centre (en espace écran, inclut le zoom)
  const dx = e.clientX - centerScreenX;
  const dy = e.clientY - centerScreenY;

  // Rotation inverse pour passer de l'espace écran à l'espace local
  const rad = -rotation * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Taille d'affichage réelle = taille CSS × zoom scale
  // (style.width est la taille non-scalée, le zoom est appliqué par le parent)
  const zoomScale = ZoomManager.scale;
  const cssWidth = parseFloat(ctx.preview.style.width) || ctx.preview.offsetWidth;
  const cssHeight = parseFloat(ctx.preview.style.height) || ctx.preview.offsetHeight;
  const displayWidth = cssWidth * zoomScale;
  const displayHeight = cssHeight * zoomScale;

  // Convertir de coordonnées centrées vers coordonnées top-left
  const relX = localX + displayWidth / 2;
  const relY = localY + displayHeight / 2;

  // Convertir en coordonnées canvas internes
  const scaleX = ctx.canvas.width / displayWidth;
  const scaleY = ctx.canvas.height / displayHeight;

  return { x: relX * scaleX, y: relY * scaleY };
}

// ================================================================
// ZOOM ET PAN DU CANVAS (type logiciel de dessin)
// ================================================================

/**
 * Applique le zoom et le pan aux éléments (image + canvas)
 * Délégué au ZoomManager
 */
function applyCanvasTransform() {
  ZoomManager._applyTransform();
}

/**
 * Gère le zoom du canvas avec la molette (centré sur la souris)
 * @param {WheelEvent} e - L'événement wheel
 */
let _zoomRAFId = null;
let _zoomDeltaAccum = 0;
let _zoomLastScreenX = 0;
let _zoomLastScreenY = 0;

function isBlockingModalOpenForWheel() {
  // Si le helper global existe, il est la source de verite prioritaire.
  if (typeof getTopOpenModal === "function") {
    try {
      if (getTopOpenModal()) return true;
    } catch (_) {}
  }

  // Fallback defensif pour les modals connus.
  const selectors = [
    "#hotkeys-modal",
    ".hotkey-capture-overlay",
    ".hotkeys-warning-overlay",
    ".timeline-day-modal",
    ".modal-overlay",
    "#tags-modal:not(.hidden)",
    "#session-plans-modal:not(.hidden)",
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    // ignorer les elements detachés/invisibles
    if (!document.body.contains(el)) continue;
    const style = window.getComputedStyle(el);
    if (style.display !== "none" && style.visibility !== "hidden") {
      return true;
    }
  }

  return false;
}

function handleCanvasZoom(e) {
  if (isBlockingModalOpenForWheel()) {
    return;
  }

  e.preventDefault();

  // Position relative au centre réel du conteneur (pas au centre de la fenêtre)
  const container = ZoomManager._getContainer();
  if (container) {
    const rect = container.getBoundingClientRect();
    _zoomLastScreenX = e.clientX - (rect.left + rect.width / 2);
    _zoomLastScreenY = e.clientY - (rect.top + rect.height / 2);
  } else {
    _zoomLastScreenX = e.clientX - window.innerWidth / 2;
    _zoomLastScreenY = e.clientY - window.innerHeight / 2;
  }
  _zoomDeltaAccum += -e.deltaY;

  // Batch les events wheel par frame pour éviter les recalculs redondants
  if (!_zoomRAFId) {
    _zoomRAFId = requestAnimationFrame(() => {
      const delta =
        _zoomDeltaAccum *
        DRAWING_CONSTANTS.ZOOM_WHEEL_SENSITIVITY *
        ZoomManager.scale;
      ZoomManager.zoom(delta, _zoomLastScreenX, _zoomLastScreenY);
      _zoomDeltaAccum = 0;
      _zoomRAFId = null;
    });
  }
}

function resetCanvasZoomPan() {
  ZoomManager.reset();
}

function handleCanvasPanStart(e) {
  if (e.button !== 1) return; // Clic molette uniquement
  e.preventDefault();
  ZoomManager.startPan(e.clientX, e.clientY);
  if (drawingPreview) drawingPreview.style.cursor = "grabbing";
}

/**
 * Gère le mouvement de pan
 * @param {MouseEvent} e - L'événement mousemove
 */
function handleCanvasPanMove(e) {
  if (!ZoomManager.isPanning) return;
  e.preventDefault();
  ZoomManager.pan(e.clientX, e.clientY);
}

function handleCanvasPanEnd() {
  if (!ZoomManager.isPanning) return;
  ZoomManager.endPan();
  const preview = zoomDrawingPreview || drawingPreview;
  if (keysState.space && keysState.shift && preview) {
    // Shift+Space encore enfoncé → mode rotation
    preview.style.cursor = "alias";
  } else if (keysState.space && preview) {
    // Space encore enfoncé → rester en mode grab
    preview.style.cursor = "grab";
  } else {
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
  }
}

/**
 * Démarre le pan via Space+clic gauche
 */
function handleSpacePanStart(e) {
  e.preventDefault();
  ZoomManager.startPan(e.clientX, e.clientY);
  const preview = zoomDrawingPreview || drawingPreview;
  if (preview) preview.style.cursor = "grabbing";
}

/**
 * Démarre la rotation via Shift+Space+clic gauche
 */
function handleRotateStart(e) {
  e.preventDefault();
  ZoomManager.startRotate(e.clientX, e.clientY);
  const preview = zoomDrawingPreview || drawingPreview;
  if (preview) preview.style.cursor = "alias"; // Curseur rotation
}

/**
 * Met à jour la rotation
 */
function handleRotateMove(e) {
  if (!ZoomManager.isRotating) return;
  e.preventDefault();
  ZoomManager.rotate(e.clientX, e.clientY);
}

/**
 * Termine la rotation
 */
function handleRotateEnd() {
  if (!ZoomManager.isRotating) return;
  ZoomManager.endRotate();
  const preview = zoomDrawingPreview || drawingPreview;
  if (keysState.space && keysState.shift && preview) {
    preview.style.cursor = "alias";
  } else if (keysState.space && preview) {
    preview.style.cursor = "grab";
  } else {
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
  }
}

function handleGlobalMouseUp(e) {

  // Si on était en train de dessiner, arrêter le dessin
  if (isDrawing && e.button === 0) {
    handleDrawingMouseUp(e);
    return;
  }

}

function resetDrawingStateOnEnter() {
  wasOutsideCanvas = false;
  // Mettre à jour le curseur quand on rentre dans le canvas
  updateDrawingCursor();
  // Si on était en train de dessiner, réinitialiser l'état
  if (isDrawing) {
    lastDrawnPoint = null;
    wasShiftPressed = false;
    stabilizerBuffer = []; // Vider le buffer du stabilisateur
  }
}

function handleDrawingMouseLeave(e, previewCanvas, drawingCanvas, drawingCtx) {
  if (ZoomManager.isPanning) {
    handleCanvasPanEnd();
  }
  // Marquer qu'on est sorti du canvas
  wasOutsideCanvas = true;
  // Si on était en train de dessiner, dessiner jusqu'au bord
  if (isDrawing && lastDrawnPoint) {
    // Calculer où le curseur est maintenant (hors canvas)
    const rect = previewCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleX = drawingCanvas.width / rect.width;
    const scaleY = drawingCanvas.height / rect.height;
    const cursorCanvasX = mouseX * scaleX;
    const cursorCanvasY = mouseY * scaleY;

    // Calculer l'intersection avec le bord
    const edge = getEdgeIntersection(
      lastDrawnPoint,
      { x: cursorCanvasX, y: cursorCanvasY },
      drawingCanvas.width,
      drawingCanvas.height,
    );

    if (edge && drawingCtx) {
      // Dessiner jusqu'au bord
      interpolateLine(
        drawingCtx,
        lastDrawnPoint,
        edge,
        annotationStyle.size * 0.5,
      );
      lastDrawnPoint = { ...edge };
    }
  }
  // Cacher le curseur mais ne pas arrêter le dessin
  hideDrawingCursor();
}


/**
 * Met à jour l'état des boutons selon le contexte (main ou zoom)
 * @param {string} context - "main" pour drawing-toolbar, "zoom" pour zoom-drawing-toolbar
 */
function updateDrawingButtonStates(context = "main") {
  const isMain = context === "main";

  // Sélecteurs selon le contexte
  const protractorSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="protractor"]'
    : '#zoom-drawing-toolbar [data-tool="protractor"]';
  const clearMeasurementsSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="clear-measurements"]'
    : '#zoom-drawing-toolbar [data-tool="clear-measurements"]';
  const clearSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="clear"]'
    : '#zoom-drawing-toolbar [data-tool="clear"]';
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");

  // État
  const hasValidCalibration = calibrationUnit && calibrationUnit > 0;
  const hasMeasurements = measurementLines.some(
    (line) => !isEditableShape(line.type),
  );
  const hasDrawingContent = !isCanvasBlank(drawingCanvas);
  const hasShapeEdges = measurementLines.some(
    (line) => isEditableShape(line.type),
  );

  // Protractor : nécessite une calibration valide (> 0px)
  const protractorBtn = document.querySelector(protractorSelector);
  if (protractorBtn) {
    protractorBtn.classList.toggle("disabled", !hasValidCalibration);
    protractorBtn.style.opacity = hasValidCalibration ? "1" : "0.3";
    protractorBtn.style.pointerEvents = hasValidCalibration ? "auto" : "none";
  }

  // Clear-measurements : nécessite au moins une mesure
  const clearMeasurementsBtn = document.querySelector(
    clearMeasurementsSelector,
  );
  if (clearMeasurementsBtn) {
    clearMeasurementsBtn.classList.toggle("disabled", !hasMeasurements);
    clearMeasurementsBtn.style.opacity = hasMeasurements ? "1" : "0.3";
    clearMeasurementsBtn.style.pointerEvents = hasMeasurements
      ? "auto"
      : "none";
  }

  // Clear : contenu raster OU rectangles vectoriels
  const clearBtn = document.querySelector(clearSelector);
  if (clearBtn) {
    const canClear = hasDrawingContent || hasShapeEdges;
    clearBtn.classList.toggle("disabled", !canClear);
    clearBtn.style.opacity = canClear ? "1" : "0.3";
    clearBtn.style.pointerEvents = canClear ? "auto" : "none";
  }

  // Masquer unit-info si calibration invalide (0px) - uniquement pour le contexte main
  if (isMain && unitInfo && !hasValidCalibration) {
    unitInfo.classList.add("hidden");
  }
}

/**
 * @deprecated Utilisez updateDrawingButtonStates("main") à la place
 */
function updateDrawingProtractorButtonState() {
  updateDrawingButtonStates("main");
}

/**
 * Modifie la taille de l'outil de dessin
 * @param {number} delta - Valeur à ajouter (positif ou négatif)
 */
function changeDrawingSize(delta) {
  const newSize = Math.max(1, Math.min(50, annotationStyle.size + delta));
  if (newSize === annotationStyle.size) return;

  annotationStyle.size = newSize;

  // Mettre à jour les sliders si présents
  const drawingSizeInput = document.getElementById("drawing-size");
  const zoomSizeInput = document.getElementById("zoom-drawing-size");
  if (drawingSizeInput) drawingSizeInput.value = newSize;
  if (zoomSizeInput) zoomSizeInput.value = newSize;

  // Mettre à jour le curseur
  updateDrawingCursor();

  // Afficher un toast avec la nouvelle taille
  showDrawingToast(`${i18next.t("draw.toasts.size")}: ${newSize}`, "info", 800);
}

/**
 * Crée le curseur personnalisé pour le mode overlay
 */
function createDrawingCursor() {
  let cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "drawing-cursor";
    cursor.style.borderColor = annotationStyle.color;
    document.body.appendChild(cursor);
  }
  updateDrawingCursor();
}

/**
 * Met à jour l'apparence du curseur
 */
function updateDrawingCursor() {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor || !drawingPreview) return;

  const isPencilOrEraser = currentTool === "pencil" || currentTool === "eraser";
  const isLaser = currentTool === "laser";
  const isShapeTool = ["rectangle", "circle", "line", "arrow"].includes(
    currentTool,
  );
  const isMeasureTool = ["measure", "calibrate", "protractor"].includes(
    currentTool,
  );

  // Mode CapsLock : curseur précis (croix) au lieu de la prévisualisation
  if (showPreciseCursor && isPencilOrEraser) {
    cursor.style.display = "none";
    drawingPreview.style.cursor = "crosshair";
    return;
  }

  // Outils de forme et mesure : curseur crosshair
  if (isShapeTool || isMeasureTool) {
    cursor.style.display = "none";
    drawingPreview.style.cursor = "crosshair";
    return;
  }

  // Mode prévisualisation : cacher le curseur par défaut, afficher le cercle
  if (isPencilOrEraser || isLaser) {
    drawingPreview.style.cursor = "none";
  } else {
    drawingPreview.style.cursor = "";
    cursor.style.display = "none";
    return;
  }

  // Calculer le ratio d'affichage (taille écran / taille canvas)
  const rect = drawingPreview.getBoundingClientRect();
  const scaleX = rect.width / drawingPreview.width;

  // Taille visuelle = taille du pinceau (lineWidth) * ratio d'affichage
  const visualSize = annotationStyle.size * scaleX;
  cursor.style.width =
    Math.max(visualSize, DRAWING_CONSTANTS.MIN_CURSOR_SIZE) + "px";
  cursor.style.height =
    Math.max(visualSize, DRAWING_CONSTANTS.MIN_CURSOR_SIZE) + "px";

  if (currentTool === "eraser") {
    cursor.style.borderColor = "#ffffff";
    cursor.style.background = "rgba(255,255,255,0.2)";
  } else if (currentTool === "laser") {
    cursor.style.borderColor = LASER_COLOR;
    cursor.style.background = "rgba(255, 0, 0, 0.3)";
  } else {
    cursor.style.borderColor = annotationStyle.color;
    cursor.style.background = "transparent";
  }
}

/**
 * Met à jour la position du curseur
 */
function updateDrawingCursorPosition(x, y) {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor) return;

  cursor.style.left = x + "px";
  cursor.style.top = y + "px";
  cursor.style.display = "block";
}

/**
 * Cache le curseur personnalisé
 */
function hideDrawingCursor() {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.style.display = "none";
}


// ================================================================
// MODULE: history.js
// ================================================================

// Aliases globaux pour compatibilité (maintenus pour l'existant)
let canvasZoomScale = ZoomManager.scale;
let canvasZoomOffsetX = ZoomManager.offsetX;
let canvasZoomOffsetY = ZoomManager.offsetY;
let currentDrawingImageSrc = drawState.currentImageSrc;

// lightboxState aliases (getters/setters)
Object.defineProperties(window, {
  lightboxEnabled: {
    get() { return drawingManager.lightbox.enabled; },
    set(v) { drawingManager.lightbox.enabled = v; }
  },
  lightboxOpacity: {
    get() { return drawingManager.lightbox.opacity; },
    set(v) { drawingManager.lightbox.opacity = v; }
  }
});

let spacePressStartPos = null;
let shapeEndAtSpacePress = null;
let shapeOffset = null;
let lastMousePosition = { x: 0, y: 0 };
let wasOutsideCanvas = false;
let compassCenter = null;
let compassWaitingSecondClick = false;
let compassDragging = false;
let compassDragMoved = false;

/**
 * Met à jour les tooltips des boutons de la barre d'outils avec les raccourcis dynamiques
 */
function updateDrawingTooltips() {
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};

  const exportBtn = document.getElementById("annotation-export");
  const lightboxBtn = document.getElementById("annotation-lightbox-btn");
  const closeBtn = document.getElementById("annotation-close");
  const pencilBtn = document.querySelector(
    '.annotation-tool[data-tool="pencil"]',
  );

  if (exportBtn && hk.DRAWING_EXPORT) {
    exportBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.export", { hotkey: `Ctrl+${hk.DRAWING_EXPORT.toUpperCase()}` }));
  }

  // Tooltip du crayon avec indication du clic droit pour le stabilisateur
  if (pencilBtn) {
    const shortcut = (hk.DRAWING_TOOL_PENCIL || "P").toUpperCase();
    pencilBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.pencilWithStabilizer", { hotkey: shortcut }));
  }

  if (lightboxBtn && hk.DRAWING_LIGHTBOX) {
    lightboxBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.lightboxWithKey", { hotkey: hk.DRAWING_LIGHTBOX }));
  }

  if (closeBtn && hk.DRAWING_CLOSE) {
    closeBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.closeWithKey", { hotkey: hk.DRAWING_CLOSE }));
  }
}


function updateLightboxButtonIcon() {
  const lightboxBtn = document.getElementById("annotation-lightbox-btn");
  if (!lightboxBtn || typeof ICONS === "undefined") return;
  lightboxBtn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;
}

const MAX_HISTORY = DRAWING_CONSTANTS.MAX_HISTORY;

// Variables actives pour le déplacement avec espace
let originalStartPoint = null;
let measureLockedLength = null; // Longueur verrouillée avec Shift pendant la création
let isDraggingShapeControl = false;
let dragShapeControlLine = null;
let dragShapeAspectRatio = null;
const shapeSelectionState =
  drawState.shapeSelection ||
  (drawState.shapeSelection = { id: null, groupId: null, ids: [], groupIds: [] });
if (!Array.isArray(shapeSelectionState.ids)) {
  shapeSelectionState.ids = shapeSelectionState.id ? [shapeSelectionState.id] : [];
}
if (!Array.isArray(shapeSelectionState.groupIds)) {
  shapeSelectionState.groupIds = shapeSelectionState.groupId ? [shapeSelectionState.groupId] : [];
}
let selectedShapeIds = new Set(shapeSelectionState.ids);
let selectedShapeGroupIds = new Set(shapeSelectionState.groupIds);
let selectedShapeId = shapeSelectionState.id ?? null;
let selectedShapeGroupId = shapeSelectionState.groupId ?? null;
let drawingEditHud = null;
const dragShapeSession =
  drawState.shapeEditSession ||
  (drawState.shapeEditSession = {
    scaleSnapshot: null,
    circleSpaceBase: null,
    rotateSnapshot: null,
    multiSelectionSnapshot: null,
  });
let drawingModeHint = null;
let drawingSelectionHud = null;
let drawingHudStack = null;
let drawingHudStackResizeBound = false;
let drawingHudSidebarObserver = null;

function resetDragShapeSession() {
  dragShapeSession.scaleSnapshot = null;
  dragShapeSession.circleSpaceBase = null;
  dragShapeSession.rotateSnapshot = null;
  dragShapeSession.multiSelectionSnapshot = null;
}

function getDrawingHudRightOffsetPx() {
  const baseOffset = 18;
  const sidebarVisible = typeof state !== "undefined" ? !!state.showSidebar : false;
  const sidebarWidth = sidebarVisible
    ? Number(DRAWING_CONSTANTS?.ZOOM_SIDEBAR_WIDTH || 95)
    : 0;
  return `${baseOffset + sidebarWidth}px`;
}

function updateDrawingHudStackOffset() {
  const stack =
    (drawingHudStack && document.body.contains(drawingHudStack)
      ? drawingHudStack
      : document.getElementById("drawing-hud-stack"));
  if (!stack) return;
  stack.style.setProperty("--drawing-hud-right-offset", getDrawingHudRightOffsetPx());
}

function ensureDrawingHudStack() {
  if (drawingHudStack && document.body.contains(drawingHudStack)) {
    updateDrawingHudStackOffset();
    return drawingHudStack;
  }
  drawingHudStack = document.createElement("div");
  drawingHudStack.id = "drawing-hud-stack";
  drawingHudStack.className = "drawing-hud-stack";
  document.body.appendChild(drawingHudStack);
  updateDrawingHudStackOffset();

  if (!drawingHudStackResizeBound) {
    drawingHudStackResizeBound = true;
    window.addEventListener("resize", updateDrawingHudStackOffset);
  }

  if (!drawingHudSidebarObserver) {
    const sidebarEl = document.querySelector(".sidebar");
    if (sidebarEl && typeof MutationObserver !== "undefined") {
      drawingHudSidebarObserver = new MutationObserver(() => {
        updateDrawingHudStackOffset();
      });
      drawingHudSidebarObserver.observe(sidebarEl, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
  }

  return drawingHudStack;
}

function ensureDrawingHudChip(currentNode, id, variantClass) {
  if (currentNode && document.body.contains(currentNode)) {
    ensureDrawingHudStack();
    updateDrawingHudStackOffset();
    return currentNode;
  }
  const stack = ensureDrawingHudStack();
  const node = document.createElement("div");
  node.id = id;
  node.className = `drawing-hud-chip ${variantClass}`;
  stack.appendChild(node);
  return node;
}

function ensureDrawingSelectionHud() {
  drawingSelectionHud = ensureDrawingHudChip(
    drawingSelectionHud,
    "drawing-selection-hud",
    "drawing-hud-chip--selection",
  );
  return drawingSelectionHud;
}

function hideDrawingSelectionHud() {
  if (drawingSelectionHud) drawingSelectionHud.classList.remove("is-visible");
}

function getSelectedEditableShapeLines() {
  const lines = [];
  const seenIds = new Set();
  measurementLines.forEach((line) => {
    if (!isEditableShape(line)) return;
    const isSelected =
      shapeHasCapability(line, "grouped")
        ? !!line.shapeGroup && selectedShapeGroupIds.has(line.shapeGroup)
        : selectedShapeIds.has(line.id);
    if (!isSelected || seenIds.has(line.id)) return;
    seenIds.add(line.id);
    lines.push(line);
  });
  return lines;
}

function updateDrawingSelectionHud() {
  const count = selectedShapeIds.size + selectedShapeGroupIds.size;
  if (count <= 0) {
    hideDrawingSelectionHud();
    return;
  }
  const hud = ensureDrawingSelectionHud();
  const text =
    typeof i18next !== "undefined"
      ? i18next.t("drawing.hints.selectionCount", {
          count,
          defaultValue: "{{count}} selected",
        })
      : `${count} selected`;
  hud.textContent = text;
  updateDrawingHudStackOffset();
  hud.classList.add("is-visible");
}

function syncEditableShapeSelectionState() {
  shapeSelectionState.ids = Array.from(selectedShapeIds);
  shapeSelectionState.groupIds = Array.from(selectedShapeGroupIds);
  selectedShapeId =
    selectedShapeIds.size === 1 && selectedShapeGroupIds.size === 0
      ? shapeSelectionState.ids[0]
      : null;
  selectedShapeGroupId =
    selectedShapeGroupIds.size === 1 && selectedShapeIds.size === 0
      ? shapeSelectionState.groupIds[0]
      : null;
  shapeSelectionState.id = selectedShapeId;
  shapeSelectionState.groupId = selectedShapeGroupId;
  updateDrawingSelectionHud();
}

function hasEditableShapeSelection() {
  return selectedShapeIds.size > 0 || selectedShapeGroupIds.size > 0;
}

function clearEditableShapeSelection() {
  selectedShapeIds.clear();
  selectedShapeGroupIds.clear();
  syncEditableShapeSelectionState();
  resetDragShapeSession();
}

function isShapeLineSelected(line) {
  return (
    !!line &&
    line.type === "shape-line" &&
    selectedShapeIds.has(line.id)
  );
}

function isShapeCircleSelected(line) {
  return (
    !!line &&
    line.type === "shape-circle" &&
    selectedShapeIds.has(line.id)
  );
}

function isShapeArrowSelected(line) {
  return (
    !!line &&
    line.type === "shape-arrow" &&
    selectedShapeIds.has(line.id)
  );
}

function isIndividualShapeSelected(line) {
  return (
    !!line &&
    isEditableShape(line) &&
    !shapeHasCapability(line, "grouped") &&
    selectedShapeIds.has(line.id)
  );
}

function isShapeEdgeSelected(line) {
  return (
    !!line &&
    shapeHasCapability(line, "grouped") &&
    !!line.shapeGroup &&
    selectedShapeGroupIds.has(line.shapeGroup)
  );
}

function selectEditableShape(line, options = {}) {
  const add = !!options.add;
  if (!line) return false;
  if (isEditableShape(line) && !shapeHasCapability(line, "grouped")) {
    if (!add) {
      selectedShapeIds.clear();
      selectedShapeGroupIds.clear();
    }
    selectedShapeIds.add(line.id);
    syncEditableShapeSelectionState();
    redrawDrawingMeasurements();
    return true;
  }
  if (shapeHasCapability(line, "grouped") && line.shapeGroup) {
    if (!add) {
      selectedShapeIds.clear();
      selectedShapeGroupIds.clear();
    }
    selectedShapeGroupIds.add(line.shapeGroup);
    syncEditableShapeSelectionState();
    redrawDrawingMeasurements();
    return true;
  }
  return false;
}

function syncEditableShapeSelection() {
  const availableShapeIds = new Set();
  const availableShapeGroupIds = new Set();
  measurementLines.forEach((line) => {
    if (!isEditableShape(line)) return;
    if (shapeHasCapability(line, "grouped") && line.shapeGroup) {
      availableShapeGroupIds.add(line.shapeGroup);
      return;
    }
    if (!shapeHasCapability(line, "grouped") && line.id) {
      availableShapeIds.add(line.id);
    }
  });

  selectedShapeIds = new Set(
    Array.from(selectedShapeIds).filter((id) => availableShapeIds.has(id)),
  );
  selectedShapeGroupIds = new Set(
    Array.from(selectedShapeGroupIds).filter((groupId) =>
      availableShapeGroupIds.has(groupId),
    ),
  );
  syncEditableShapeSelectionState();
}

function invertEditableShapeSelection() {
  const availableShapeIds = new Set();
  const availableShapeGroupIds = new Set();
  measurementLines.forEach((line) => {
    if (!isEditableShape(line)) return;
    if (shapeHasCapability(line, "grouped") && line.shapeGroup) {
      availableShapeGroupIds.add(line.shapeGroup);
      return;
    }
    if (!shapeHasCapability(line, "grouped") && line.id) {
      availableShapeIds.add(line.id);
    }
  });

  const nextIds = new Set();
  const nextGroups = new Set();
  availableShapeIds.forEach((id) => {
    if (!selectedShapeIds.has(id)) nextIds.add(id);
  });
  availableShapeGroupIds.forEach((groupId) => {
    if (!selectedShapeGroupIds.has(groupId)) nextGroups.add(groupId);
  });

  selectedShapeIds = nextIds;
  selectedShapeGroupIds = nextGroups;
  syncEditableShapeSelectionState();
  resetDragShapeSession();
  redrawDrawingMeasurements();
  return hasEditableShapeSelection();
}

function ensureDrawingEditHud() {
  if (drawingEditHud && document.body.contains(drawingEditHud)) return drawingEditHud;
  drawingEditHud = document.createElement("div");
  drawingEditHud.id = "drawing-edit-hud";
  drawingEditHud.style.position = "fixed";
  drawingEditHud.style.zIndex = "11050";
  drawingEditHud.style.pointerEvents = "none";
  drawingEditHud.style.padding = "6px 9px";
  drawingEditHud.style.borderRadius = "8px";
  drawingEditHud.style.background = "rgba(12, 16, 22, 0.92)";
  drawingEditHud.style.border = "1px solid rgba(255,255,255,0.14)";
  drawingEditHud.style.color = "#e9efff";
  drawingEditHud.style.fontSize = "12px";
  drawingEditHud.style.fontWeight = "600";
  drawingEditHud.style.letterSpacing = "0.2px";
  drawingEditHud.style.display = "none";
  document.body.appendChild(drawingEditHud);
  return drawingEditHud;
}

function updateDrawingEditHudFromLine(line, clientX = null, clientY = null) {
  if (!line || !line.start || !line.end) return;
  const hud = ensureDrawingEditHud();
  const { length, angle } = getLineMetrics(line.start, line.end);
  hud.textContent = `${Math.round(length)} px | ${Math.round(angle)} deg`;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    hud.style.left = `${Math.round(clientX + 14)}px`;
    hud.style.top = `${Math.round(clientY + 14)}px`;
  }
  hud.style.display = "block";
}

function updateDrawingEditHudFromPoints(start, end, clientX = null, clientY = null) {
  if (!start || !end) return;
  updateDrawingEditHudFromLine({ start, end }, clientX, clientY);
}

function hideDrawingEditHud() {
  if (drawingEditHud) drawingEditHud.style.display = "none";
}

function ensureDrawingModeHint() {
  drawingModeHint = ensureDrawingHudChip(
    drawingModeHint,
    "drawing-mode-hint",
    "drawing-hud-chip--hint",
  );
  return drawingModeHint;
}

function showDrawingModeHint(text) {
  if (!text) return;
  const hint = ensureDrawingModeHint();
  hint.textContent = text;
  updateDrawingHudStackOffset();
  hint.classList.add("is-visible");
}

function hideDrawingModeHint() {
  if (drawingModeHint) drawingModeHint.classList.remove("is-visible");
}

// ================================================================
// HELPERS PARTAGÉS DRAWING/ZOOM MODE (Phase 6.4)
// ================================================================

function cloneMeasurementLines(lines) {
  return structuredClone(Array.isArray(lines) ? lines : []);
}

function normalizeHistorySnapshot(entry) {
  if (typeof entry === "string") {
    return {
      canvasDataURL: entry,
      measurementLines: [],
      calibrationUnit: null,
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      canvasDataURL: null,
      measurementLines: [],
      calibrationUnit: null,
    };
  }

  return {
    canvasDataURL: entry.canvasDataURL || null,
    measurementLines: cloneMeasurementLines(entry.measurementLines),
    calibrationUnit: Number.isFinite(Number(entry.calibrationUnit))
      ? Number(entry.calibrationUnit)
      : null,
  };
}

function cloneHistorySnapshot(entry) {
  const normalized = normalizeHistorySnapshot(entry);
  return {
    canvasDataURL: normalized.canvasDataURL,
    measurementLines: cloneMeasurementLines(normalized.measurementLines),
    calibrationUnit: normalized.calibrationUnit,
  };
}

function cloneDrawingHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => cloneHistorySnapshot(entry));
}

function buildCurrentHistorySnapshot() {
  const hasCanvas = drawingCanvas && !isCanvasBlank(drawingCanvas);
  return {
    canvasDataURL: hasCanvas ? drawingCanvas.toDataURL() : null,
    measurementLines: cloneMeasurementLines(measurementLines),
    calibrationUnit: Number.isFinite(Number(calibrationUnit))
      ? Number(calibrationUnit)
      : null,
  };
}

function applyHistorySnapshot(snapshot) {
  const normalized = normalizeHistorySnapshot(snapshot);
  measurementLines = cloneMeasurementLines(normalized.measurementLines);
  calibrationUnit = normalized.calibrationUnit;

  const finalizeState = () => {
    redrawDrawingMeasurements();
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  };

  if (!drawingCtx || !drawingCanvas) {
    finalizeState();
    return;
  }

  if (!normalized.canvasDataURL) {
    clearCanvas(drawingCtx, drawingCanvas);
    finalizeState();
    return;
  }

  const img = new Image();
  img.onload = () => {
    // Swap atomique: on efface seulement quand la nouvelle image est prête,
    // pour éviter le scintillement visuel pendant undo/redo.
    clearCanvas(drawingCtx, drawingCanvas);
    drawingCtx.drawImage(img, 0, 0);
    finalizeState();
  };
  img.onerror = () => {
    console.warn("undo/redo: failed to load snapshot image");
    clearCanvas(drawingCtx, drawingCanvas);
    finalizeState();
  };
  img.src = normalized.canvasDataURL;
}

/**
 * Restaure l'état de dessin depuis un cache
 * @param {Object} savedState - État sauvegardé (canvasDataURL, measuresDataURL, etc.)
 * @param {CanvasRenderingContext2D} mainCtx - Contexte du canvas principal
 * @param {CanvasRenderingContext2D} measuresCtx - Contexte du canvas de mesures
 * @returns {Promise<boolean>} true si restauré avec succès
 */
async function restoreDrawingState(savedState, mainCtx, measuresCtx) {
  if (!savedState) {
    debugLog("restoreDrawingState: pas d'état à restaurer");
    return false;
  }

  debugLog("restoreDrawingState: restauration...", {
    hasCanvasData: !!savedState.canvasDataURL,
    measurementLines: savedState.measurementLines?.length,
    calibrationUnit: savedState.calibrationUnit,
  });

  // Restaurer les données non-image immédiatement
  measurementLines = cloneMeasurementLines(savedState.measurementLines);
  calibrationUnit = Number.isFinite(Number(savedState.calibrationUnit))
    ? Number(savedState.calibrationUnit)
    : null;
  drawingHistory = cloneDrawingHistory(savedState.history);
  const restoredIndex = Number.isInteger(savedState.historyIndex)
    ? savedState.historyIndex
    : drawingHistory.length - 1;
  drawingHistoryIndex = Math.max(
    -1,
    Math.min(restoredIndex, drawingHistory.length - 1),
  );

  // Restaurer le canvas principal depuis l'URL base64
  if (savedState.canvasDataURL) {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        clearCanvas(mainCtx, mainCtx.canvas);
        mainCtx.drawImage(
          img,
          0,
          0,
          mainCtx.canvas.width,
          mainCtx.canvas.height,
        );
        resolve();
      };
      img.onerror = () =>
        reject(new Error("Failed to load canvas image data"));
      img.src = savedState.canvasDataURL;
    });
  }

  // Les mesures sont redessinées dynamiquement, pas besoin de restaurer le canvas
  redrawDrawingMeasurements();
  updateDrawingUnitInfo();
  updateDrawingTotalDistance();
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");

  return true;
}

/**
 * Sauvegarde l'état de dessin dans un cache
 * @param {Map} cache - Cache de stockage (drawingStateCache ou zoomDrawingStateCache)
 * @param {string} imageSrc - Clé d'identification de l'image
 * @param {HTMLCanvasElement} mainCanvas - Canvas principal
 * @param {HTMLCanvasElement} measuresCanvas - Canvas de mesures
 * @param {CanvasRenderingContext2D} mainCtx - Contexte du canvas principal
 * @param {CanvasRenderingContext2D} measuresCtx - Contexte du canvas de mesures
 * @returns {boolean} true si sauvegardé, false sinon
 */
function saveDrawingState(
  cache,
  imageSrc,
  mainCanvas,
  measuresCanvas,
  mainCtx,
  measuresCtx,
) {
  debugLog("saveDrawingState: ENTRÉE dans la fonction");

  try {
    if (!imageSrc || !mainCanvas || !measuresCanvas) {
      debugLog("saveDrawingState: paramètres manquants", {
        imageSrc: !!imageSrc,
        mainCanvas: !!mainCanvas,
        measuresCanvas: !!measuresCanvas,
      });
      return false;
    }

    // Vérifier s'il y a du contenu à sauvegarder (dessin ou mesures)
    const hasDrawingContent = !isCanvasBlank(mainCanvas);
    const hasMeasures = measurementLines.length > 0;

    debugLog(
      "saveDrawingState: hasDrawing=",
      hasDrawingContent,
      "hasMeasures=",
      hasMeasures,
      "measurementLines=",
      measurementLines.length,
    );

    if (!hasDrawingContent && !hasMeasures) {
      // Important: si l'état courant est vide, il faut supprimer l'ancienne
      // entrée du cache, sinon un ancien dessin réapparaît à la réouverture.
      cache.delete(imageSrc);
      debugLog("saveDrawingState: rien à sauvegarder, cache entry removed");
      return false;
    }

    cache.set(imageSrc, {
      // Sauvegarder en base64 pour pouvoir redimensionner à la restauration
      canvasDataURL: hasDrawingContent ? mainCanvas.toDataURL() : null,
      // Les mesures sont stockées en coordonnées et redessinées dynamiquement
      measurementLines: structuredClone(measurementLines),
      calibrationUnit: calibrationUnit,
      history: cloneDrawingHistory(drawingHistory),
      historyIndex: drawingHistoryIndex,
    });

    debugLog("saveDrawingState: SUCCÈS, cache size =", cache.size);
    return true;
  } catch (error) {
    debugLog("saveDrawingState: ERREUR", error);
    console.error("saveDrawingState error:", error);
    return false;
  }
}

/**
 * Vérifie si un canvas est vide (tous les pixels transparents)
 */
function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Vérifier par échantillonnage (plus rapide que tout vérifier)
  for (let i = 3; i < data.length; i += 400) {
    if (data[i] !== 0) return false;
  }
  return true;
}

/**
 * Initialise un état de dessin vierge
 */
function initFreshDrawingState() {
  drawingHistory = [];
  drawingHistoryIndex = -1;
  measurementLines = [];
  calibrationUnit = null;

  // Sauvegarder l'état vide initial pour permettre undo du premier trait
  // (sera fait après que les canvas soient initialisés)
}


/**
 * Efface le canvas de dessin
 */
function clearDrawingCanvas() {
  let changed = false;
  clearEditableShapeSelection();
  hideDrawingEditHud();

  if (drawingCtx && drawingCanvas) {
    clearCanvas(drawingCtx, drawingCanvas);
    changed = true;
  }

  // Le bouton clear supprime aussi les formes vectorielles (rectangle + ligne editable)
  const before = measurementLines.length;
  measurementLines = measurementLines.filter(
    (line) => !isEditableShape(line),
  );
  if (measurementLines.length !== before) {
    changed = true;
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
  }

  if (changed) {
    saveDrawingHistory();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  }
}

/**
 * Efface les mesures
 */
function clearDrawingMeasurements() {
  if (drawingMeasuresCtx && drawingMeasures) {
    hideDrawingEditHud();
    clearCanvas(drawingMeasuresCtx, drawingMeasures);
    // Conserver les formes vectorielles editables pour que seul "clear" les efface.
    measurementLines = measurementLines.filter(
      (line) => isEditableShape(line),
    );
    redrawDrawingMeasurements();
    calibrationUnit = null;

    // Cacher les infos
    const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
    if (unitInfo) unitInfo.classList.add("hidden");
    const totalDistance = document.getElementById(
      "drawing-total-distance-info",
    );
    if (totalDistance) totalDistance.classList.add("hidden");

    // Mettre à jour les boutons pour les deux contextes
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  }
}



/**
 * Sauvegarde l'état pour undo/redo (historique local)
 */
function saveDrawingHistory() {
  if (!drawingCanvas) return;

  // Supprimer les états futurs si on a fait undo
  if (drawingHistoryIndex < drawingHistory.length - 1) {
    drawingHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
  }

  drawingHistory.push(buildCurrentHistorySnapshot());
  drawingHistoryIndex++;

  // Limiter la taille de l'historique
  if (drawingHistory.length > MAX_HISTORY) {
    drawingHistory.shift();
    drawingHistoryIndex--;
  }
}

/**
 * Annule la dernière action
 */
function undoDrawing() {
  if (drawingHistoryIndex <= 0) return;

  drawingHistoryIndex--;
  const snapshot = drawingHistory[drawingHistoryIndex];
  applyHistorySnapshot(snapshot);
}

/**
 * Refait la dernière action annulée
 */
function redoDrawing() {
  if (drawingHistoryIndex >= drawingHistory.length - 1) return;

  drawingHistoryIndex++;
  const snapshot = drawingHistory[drawingHistoryIndex];
  applyHistorySnapshot(snapshot);
}


// ================================================================
// MODULE: measurements.js
// ================================================================

/**
 * Dessine les subdivisions sur une ligne de calibration
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} subdivisions - Nombre de subdivisions (2=moitié, 3=tiers, 4=quarts)
 * @param {string} color - Couleur
 * @param {number} gradSize - Multiplicateur de taille
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawCalibrateSubdivisions(
  ctx,
  start,
  end,
  subdivisions,
  color,
  gradSize = 1,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);

  if (distance < DRAWING_CONSTANTS.MIN_DISTANCE_RULER || subdivisions < 2) return;

  // Vecteur unitaire et perpendicuaire
  const ux = dx / distance;
  const uy = dy / distance;
  const perpX = -uy;
  const perpY = ux;

  // Taille des graduations (proportionnelle à l'épaisseur du trait)
  const lineWidthFactor = baseLineWidth / DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH;
  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_LARGE * gradSize * lineWidthFactor;
  const smallTickLength = DRAWING_CONSTANTS.TICK_LENGTH_SMALL * gradSize * lineWidthFactor;

  ctx.strokeStyle = color;
  ctx.lineCap = "round";

  // Dessiner les subdivisions
  for (let i = 1; i < subdivisions; i++) {
    const ratio = i / subdivisions;
    const posX = start.x + dx * ratio;
    const posY = start.y + dy * ratio;

    // Graduation plus grande pour le milieu (quand subdivisions est pair)
    const isMiddle = subdivisions % 2 === 0 && i === subdivisions / 2;
    const currentTickLength = isMiddle ? tickLength : smallTickLength;
    const currentLineWidth = (isMiddle ? 2.5 : 2) * gradSize * lineWidthFactor;

    ctx.lineWidth = currentLineWidth;
    ctx.beginPath();
    ctx.moveTo(
      posX - perpX * currentTickLength,
      posY - perpY * currentTickLength,
    );
    ctx.lineTo(
      posX + perpX * currentTickLength,
      posY + perpY * currentTickLength,
    );
    ctx.stroke();
  }
}

/**
 * Dessine des graduations sur une ligne de mesure (marques pour chaque unité)
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} unitPixels - Taille d'une unité en pixels
 * @param {string} color - Couleur
 * @param {number} gradSize - Multiplicateur de taille
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawMeasureGraduations(
  ctx,
  start,
  end,
  unitPixels,
  color,
  gradSize = null,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);
  if (distance === 0) return;

  // Vecteur unitaire dans la direction de la ligne
  const ux = dx / distance;
  const uy = dy / distance;

  // Vecteur perpendiculaire
  const perpX = -uy;
  const perpY = ux;

  // Taille des graduations (applique le multiplicateur de config individuelle ou globale)
  const sizeMultiplier = gradSize ?? measureGraduationSize;
  const lineWidthFactor = baseLineWidth / DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH;
  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_MEDIUM * sizeMultiplier * lineWidthFactor;

  // Dessiner une graduation à chaque unité
  const numUnits = Math.floor(distance / unitPixels);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * sizeMultiplier * lineWidthFactor;
  ctx.lineCap = "round";

  for (let i = 1; i <= numUnits; i++) {
    // Position sur la ligne à i unités du début
    const posX = start.x + ux * unitPixels * i;
    const posY = start.y + uy * unitPixels * i;

    // Dessiner le trait perpendiculaire
    ctx.beginPath();
    ctx.moveTo(posX - perpX * tickLength, posY - perpY * tickLength);
    ctx.lineTo(posX + perpX * tickLength, posY + perpY * tickLength);
    ctx.stroke();
  }
}

/**
 * Dessine des marqueurs de proportions sur une ligne de mesure
 * Affiche : milieu, tiers, quarts selon la configuration
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} gradSize - Multiplicateur de taille
 * @param {Object} propConfig - Configuration des proportions
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawMeasureProportions(
  ctx,
  start,
  end,
  gradSize = null,
  propConfig = null,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);

  // Ne pas dessiner si la ligne est trop courte
  if (distance < DRAWING_CONSTANTS.MIN_DISTANCE_PROPORTIONS) return;

  // Vecteur perpendiculaire normalisé
  const perpX = -dy / distance;
  const perpY = dx / distance;

  // Config individuelle ou globale
  const config = propConfig ?? measureProportionsConfig;

  // Construire la liste des proportions selon la configuration (avec couleurs personnalisées)
  const proportions = [];

  // Milieu (½)
  if (config.showCenter) {
    proportions.push({
      ratio: 0.5,
      tickLength: 14,
      lineWidth: 2.5,
      propColor: config.colorCenter,
      label: "½",
    });
  }

  // Tiers (⅓, ⅔)
  if (config.showThirds) {
    proportions.push({
      ratio: 1 / 3,
      tickLength: 10,
      lineWidth: 2,
      propColor: config.colorThirds,
      label: "⅓",
    });
    proportions.push({
      ratio: 2 / 3,
      tickLength: 10,
      lineWidth: 2,
      propColor: config.colorThirds,
      label: "⅔",
    });
  }

  // Quarts (¼, ¾) - exclure le milieu déjà affiché
  if (config.showQuarters) {
    proportions.push({
      ratio: 0.25,
      tickLength: 7,
      lineWidth: 1.5,
      propColor: config.colorQuarters,
      label: "¼",
    });
    proportions.push({
      ratio: 0.75,
      tickLength: 7,
      lineWidth: 1.5,
      propColor: config.colorQuarters,
      label: "¾",
    });
  }

  // Si aucune proportion n'est activée, ne rien dessiner
  if (proportions.length === 0) return;

  ctx.lineCap = "round";

  // Appliquer le multiplicateur de taille (individuel ou global)
  const sizeMultiplier = gradSize ?? measureGraduationSize;

  // Facteur basé sur l'épaisseur du trait (base = 3px)
  const lineWidthFactor = baseLineWidth / 3;

  proportions.forEach(({ ratio, tickLength, lineWidth, propColor, label }) => {
    const posX = start.x + dx * ratio;
    const posY = start.y + dy * ratio;

    // Appliquer le multiplicateur de taille ET le facteur d'épaisseur
    const scaledTickLength = tickLength * sizeMultiplier * lineWidthFactor;
    const scaledLineWidth = lineWidth * sizeMultiplier * lineWidthFactor;

    // Dessiner le trait
    ctx.strokeStyle = propColor;
    ctx.lineWidth = scaledLineWidth;
    ctx.beginPath();
    ctx.moveTo(
      posX - perpX * scaledTickLength,
      posY - perpY * scaledTickLength,
    );
    ctx.lineTo(
      posX + perpX * scaledTickLength,
      posY + perpY * scaledTickLength,
    );
    ctx.stroke();

    // Dessiner le label avec fond pour meilleure lisibilité (si activé)
    if (config.showLabels && distance > DRAWING_CONSTANTS.MIN_DISTANCE_LABELS) {
      const fontSize = Math.round(12 * sizeMultiplier);
      ctx.font = `bold ${fontSize}px sans-serif`;

      // Décaler le label beaucoup plus loin du trait pour éviter chevauchement
      const labelOffset = scaledTickLength + 15 + fontSize;
      const labelX = posX + perpX * labelOffset;
      const labelY = posY + perpY * labelOffset;

      // Fond semi-transparent pour le label
      const textMetrics = ctx.measureText(label);
      const padding = 4;
      const bgWidth = textMetrics.width + padding * 2;
      const bgHeight = fontSize + padding * 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(
        labelX - bgWidth / 2,
        labelY - bgHeight / 2,
        bgWidth,
        bgHeight,
      );

      // Texte
      ctx.fillStyle = propColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX, labelY);
    }
  });
}

// ================================================================
// HELPERS POUR redrawDrawingMeasurements() - Phase 6.2
// ================================================================

/**
 * Dessine une ligne de type compass
 */
function renderCompassLine(ctx, line, scaleFactor, hoverPoint, hoverThreshold) {
  const compassColor =
    line.config?.color ||
    (typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR
      : "#f59e0b");
  const defaultLineWidth =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_LINE_WIDTH
      : 2;
  // Utiliser la config individuelle ou la valeur par défaut
  const compassLineWidth = line.config?.lineWidth ?? defaultLineWidth;
  const compassLabelSize = line.config?.labelSize ?? measureLabelSize;
  const compassGradSize = line.config?.graduationSize ?? measureGraduationSize;
  const compassShowLabel = line.config?.showLabel ?? true;
  const compassSubdivisions = line.config?.subdivisions || 0;

  // Segment principal
  drawSmoothLine(
    ctx,
    line.start,
    line.end,
    compassColor,
    compassLineWidth * scaleFactor,
    "butt",
  );

  // Déterminer borne survolée
  const scaledThreshold = hoverThreshold * scaleFactor;
  let hoveredEndpoint = null;
  if (hoverPoint) {
    const distStart = getDistance(hoverPoint, line.start);
    const distEnd = getDistance(hoverPoint, line.end);
    if (distStart < scaledThreshold) hoveredEndpoint = "start";
    else if (distEnd < scaledThreshold) hoveredEndpoint = "end";
  }

  // Bornes
  if (hoveredEndpoint === "start") {
    drawEndpoint(ctx, line.start.x, line.start.y, compassColor, scaleFactor);
  } else {
    drawEndpointTick(
      ctx,
      line.start,
      line.end,
      compassColor,
      compassLineWidth * scaleFactor * compassGradSize,
      scaleFactor,
    );
  }
  if (hoveredEndpoint === "end") {
    drawEndpoint(ctx, line.end.x, line.end.y, compassColor, scaleFactor);
  } else {
    drawEndpointTick(
      ctx,
      line.end,
      line.start,
      compassColor,
      compassLineWidth * scaleFactor * compassGradSize,
      scaleFactor,
    );
  }

  // Subdivisions
  if (compassSubdivisions >= 2) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const len = getDistance(line.start, line.end);
    if (len === 0) return;
    const perpX = -dy / len;
    const perpY = dx / len;
    const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_SMALL * scaleFactor * compassGradSize;

    for (let i = 1; i < compassSubdivisions; i++) {
      const ratio = i / compassSubdivisions;
      const px = line.start.x + dx * ratio;
      const py = line.start.y + dy * ratio;

      ctx.strokeStyle = compassColor;
      ctx.lineWidth = compassLineWidth * scaleFactor * 0.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px - perpX * tickLength, py - perpY * tickLength);
      ctx.lineTo(px + perpX * tickLength, py + perpY * tickLength);
      ctx.stroke();
    }
  }

  // Label
  if (compassShowLabel) {
    renderCompassLabel(ctx, line, scaleFactor, compassColor, compassLabelSize);
  }
}

/**
 * Dessine un label de mesure/calibration/compass (logique commune)
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} line - Ligne avec start, end, labelOffset, _labelBounds
 * @param {number} scaleFactor - Facteur d'échelle
 * @param {string} labelText - Texte à afficher
 * @param {number} labelSize - Multiplicateur de taille du label
 */
function renderMeasurementLabel(ctx, line, scaleFactor, labelText, labelSize) {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len = getDistance(line.start, line.end);
  if (len === 0) return;

  const perpX = -dy / len;
  const perpY = dx / len;

  const fontSize = Math.round(DRAWING_CONSTANTS.LABEL_FONT_SIZE * scaleFactor * labelSize);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const textMetrics = ctx.measureText(labelText);
  const padding = DRAWING_CONSTANTS.LABEL_PADDING * scaleFactor * labelSize;
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = Math.round(DRAWING_CONSTANTS.LABEL_BOX_HEIGHT * scaleFactor * labelSize);

  const defaultOffset = DRAWING_CONSTANTS.LABEL_PERP_OFFSET * scaleFactor * Math.max(1, labelSize * 0.8);
  const midX = (line.start.x + line.end.x) / 2;
  const midY = (line.start.y + line.end.y) / 2;
  let labelX = midX + perpX * defaultOffset;
  let labelY = midY + perpY * defaultOffset;

  if (line.labelOffset) {
    labelX += line.labelOffset.x;
    labelY += line.labelOffset.y;
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(labelX - boxWidth / 2, labelY - boxHeight / 2, boxWidth, boxHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(labelText, labelX, labelY);

  line._labelBounds = {
    x: labelX - boxWidth / 2,
    y: labelY - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
  };
}

/**
 * Dessine le label d'un compass
 */
function renderCompassLabel(ctx, line, scaleFactor, color, labelSize) {
  const multiplier = line.config?.multiplier || line.multiplier || 1;
  const unitsLabel = typeof i18next !== "undefined" ? i18next.t("drawing.unit") : "u";
  renderMeasurementLabel(ctx, line, scaleFactor, `${multiplier}${unitsLabel}`, labelSize);
}

function getShapeGroupBoundsFromEdge(edgeLine) {
  if (!edgeLine?.shapeGroup) return null;
  const groupLines = measurementLines.filter(
    (line) => line.type === "shape-edge" && line.shapeGroup === edgeLine.shapeGroup,
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

function getShapeFillStyle(shapeConfig, fallbackStroke) {
  if (!shapeConfig?.fillEnabled) return null;
  const fillOpacity = Math.min(0.9, Math.max(0.05, shapeConfig.fillOpacity ?? 0.2));
  const baseColor = shapeConfig.fillColor || shapeConfig.color || fallbackStroke || "#ff3333";
  return { color: baseColor, opacity: fillOpacity };
}

function drawArrowHeadFromTo(ctx, from, to, headLength) {
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

/**
 * Dessine une ligne de type measure ou calibrate
 */
function renderMeasureLine(ctx, line, scaleFactor, hoverPoint, hoverThreshold) {
  const isShape = isEditableShape(line);
  const isShapeEdge = shapeHasCapability(line, "grouped");
  const isShapeLine = line.type === "shape-line";
  const isShapeCircle = line.type === "shape-circle";
  const isShapeArrow = line.type === "shape-arrow";
  const shapeSelected =
    isShapeEdge
      ? isShapeEdgeSelected(line)
      : isIndividualShapeSelected(line);
  const ctrlShapeMode = isShapeEditingTool(currentTool) && !!keysState.ctrl;
  const draggingSameShape =
    isDraggingEndpoint &&
    selectedMeasurement &&
    ((selectedMeasurement.type === "shape-edge" &&
      line.type === "shape-edge" &&
      selectedMeasurement.shapeGroup &&
      line.shapeGroup === selectedMeasurement.shapeGroup) ||
      selectedMeasurement.id === line.id);
  const suppressShapeHandles = ctrlShapeMode && !draggingSameShape;
  const color =
    line.type === "calibrate"
      ? (line.config?.color ?? "#10b981")
      : isShape
        ? (line.config?.color ?? annotationStyle.color)
        : (line.config?.color ?? measureColor);
  const lineWidth =
    line.type === "calibrate"
      ? (line.config?.lineWidth ?? 3)
      : isShape
        ? (line.config?.lineWidth ?? annotationStyle.size)
        : (line.config?.lineWidth ?? measureState.lineWidth);
  const hasShapeSelection =
    typeof hasEditableShapeSelection === "function" &&
    hasEditableShapeSelection();
  const selectedOpacity =
    isShape && hasShapeSelection && !shapeSelected ? 0.42 : 1;
  const fillStyle = getShapeFillStyle(line.config, color);

  if (isShape) {
    ctx.save();
    ctx.globalAlpha = selectedOpacity;
  }

  if (
    isShapeEdge &&
    line.startCorner === "a" &&
    line.endCorner === "b" &&
    fillStyle
  ) {
    if (buildShapeEdgeGroupPath(ctx, line)) {
      ctx.save();
      ctx.fillStyle = fillStyle.color;
      ctx.globalAlpha = fillStyle.opacity;
      ctx.fill();
      ctx.restore();
    }
  }

  if (isShapeLine && line.control) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.quadraticCurveTo(
      line.control.x,
      line.control.y,
      line.end.x,
      line.end.y,
    );
    ctx.stroke();
  } else if (isShapeCircle) {
    const minX = Math.min(line.start.x, line.end.x);
    const maxX = Math.max(line.start.x, line.end.x);
    const minY = Math.min(line.start.y, line.end.y);
    const maxY = Math.max(line.start.y, line.end.y);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(1, (maxX - minX) / 2);
    const ry = Math.max(1, (maxY - minY) / 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (fillStyle) {
      ctx.save();
      ctx.fillStyle = fillStyle.color;
      ctx.globalAlpha = fillStyle.opacity;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isShapeArrow) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    const headScale = line.config?.arrowHeadSize ?? 1.15;
    const headLength = Math.max(4, DRAWING_CONSTANTS.ARROW_HEAD_LENGTH * headScale);
    if (line.control) {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.quadraticCurveTo(
        line.control.x,
        line.control.y,
        line.end.x,
        line.end.y,
      );
      ctx.stroke();
      drawArrowHeadFromTo(ctx, line.control, line.end, headLength);
      if (line.config?.arrowDoubleHead) {
        drawArrowHeadFromTo(ctx, line.control, line.start, headLength);
      }
    } else {
      drawArrowOnCanvas(
        ctx,
        line.start,
        line.end,
        headScale,
        !!line.config?.arrowDoubleHead,
      );
    }
    ctx.restore();
  } else if (isShapeEdge && line.control) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.quadraticCurveTo(
      line.control.x,
      line.control.y,
      line.end.x,
      line.end.y,
    );
    ctx.stroke();
  } else {
    drawSmoothLine(ctx, line.start, line.end, color, lineWidth, "butt");
  }

  // Les poignées (bornes) doivent rester lisibles, sans opacité réduite.
  if (isShape) {
    ctx.restore();
  }

  // Subdivisions calibrate
  if (line.type === "calibrate") {
    const subdivisions = line.config?.subdivisions ?? 0;
    const gradSize = line.config?.graduationSize ?? measureGraduationSize;
    if (subdivisions > 0) {
      drawCalibrateSubdivisions(
        ctx,
        line.start,
        line.end,
        subdivisions,
        color,
        gradSize,
        lineWidth,
      );
    }
  }

  // Graduations measure
  if (line.type === "measure") {
    const gradType = line.config?.graduationType ?? measureGraduationType;
    const gradSize = line.config?.graduationSize ?? measureGraduationSize;
    if (gradType === "units" && calibrationUnit && calibrationUnit > 0) {
      drawMeasureGraduations(
        ctx,
        line.start,
        line.end,
        calibrationUnit,
        color,
        gradSize,
        lineWidth,
      );
    } else if (gradType === "proportions") {
      const propConfig =
        line.config?.proportionsConfig ?? measureProportionsConfig;
      drawMeasureProportions(
        ctx,
        line.start,
        line.end,
        gradSize,
        propConfig,
        lineWidth,
      );
    }
  }

  // Bornes
  const scaledThreshold = hoverThreshold * scaleFactor;
  let hoveredEndpoint = null;
  if (hoverPoint) {
    if (isShapeCircle) {
      const distEnd = getDistance(hoverPoint, line.end);
      if (distEnd < scaledThreshold) hoveredEndpoint = "end";
    } else {
      const distStart = getDistance(hoverPoint, line.start);
      const distEnd = getDistance(hoverPoint, line.end);
      if (distStart < scaledThreshold) hoveredEndpoint = "start";
      else if (distEnd < scaledThreshold) hoveredEndpoint = "end";
    }
  }

  if (isShapeEdge || isShapeLine || isShapeCircle || isShapeArrow) {
    if (suppressShapeHandles) {
      // Ctrl (mode creation shape): aucun handle affiche.
      // Ctrl pendant drag d'endpoint: seulement la shape active continue d'etre rendue.
      return;
    }
    // Pas de ticks pour les rectangles éditables: évite les dépassements/croisements visuels.
    // Rectangle: bornes visibles uniquement au survol quand l'edition de forme est active.
    if (isShapeEdge || isShapeCircle) {
      const isShapeToolContext =
        (isShapeEdge && currentTool === "rectangle") ||
        (isShapeCircle && currentTool === "circle");
      if (rectangleEditMode && isShapeToolContext) {
        const endpointDragOnThisShape =
          isDraggingEndpoint &&
          selectedMeasurement &&
          selectedMeasurement.id === line.id;
        if (isShapeCircle) {
          if (hoveredEndpoint === "end" || endpointDragOnThisShape || shapeSelected) {
            drawEndpoint(ctx, line.end.x, line.end.y, color, scaleFactor);
          }
        } else {
          const draggingRectangleCorner =
            isDraggingEndpoint &&
            selectedMeasurement &&
            selectedMeasurement.type === "shape-edge" &&
            selectedMeasurement.shapeGroup === line.shapeGroup;
          const activeCornerKey = draggingRectangleCorner
            ? (draggedEndpoint === "start"
                ? selectedMeasurement.startCorner
                : selectedMeasurement.endCorner)
            : null;
          if (hoveredEndpoint === "start" || endpointDragOnThisShape) {
            if (!draggingRectangleCorner || activeCornerKey === line.startCorner) {
              drawEndpoint(ctx, line.start.x, line.start.y, color, scaleFactor);
            }
          }
          if (hoveredEndpoint === "end" || endpointDragOnThisShape) {
            if (!draggingRectangleCorner || activeCornerKey === line.endCorner) {
              drawEndpoint(ctx, line.end.x, line.end.y, color, scaleFactor);
            }
          }
        }
      }
    } else {
      // Ligne: bornes visibles si selectionnee, ou au survol.
      const endpointDragOnThisShape =
        isDraggingEndpoint &&
        selectedMeasurement &&
        selectedMeasurement.id === line.id;
      const ctrlSnapSingleEndpoint =
        !!keysState.ctrl &&
        endpointDragOnThisShape &&
        (draggedEndpoint === "start" || draggedEndpoint === "end");
      const showStart =
        hoveredEndpoint === "start" ||
        (endpointDragOnThisShape &&
          (!ctrlSnapSingleEndpoint || draggedEndpoint === "start"));
      const showEnd =
        hoveredEndpoint === "end" ||
        (endpointDragOnThisShape &&
          (!ctrlSnapSingleEndpoint || draggedEndpoint === "end"));
      if (showStart) {
        drawEndpoint(ctx, line.start.x, line.start.y, color, scaleFactor);
      }
      if (showEnd) {
        drawEndpoint(ctx, line.end.x, line.end.y, color, scaleFactor);
      }
    }

    if (
      (isShapeLine || isShapeArrow || isShapeEdge) &&
      line.control &&
      (currentTool === "line" || currentTool === "arrow" || currentTool === "rectangle") &&
      rectangleEditMode
    ) {
      const controlHandlePoint = getShapeCurveHandlePoint(line) || line.control;
      const controlHover = hoverPoint
        ? getDistance(hoverPoint, controlHandlePoint) < scaledThreshold
        : false;
      const controlActive =
        isDraggingShapeControl &&
        dragShapeControlLine &&
        dragShapeControlLine.id === line.id;
      const hideControlDuringCtrlEndpointSnap =
        keysState.ctrl &&
        isDraggingEndpoint &&
        selectedMeasurement &&
        selectedMeasurement.id === line.id;
      if (hideControlDuringCtrlEndpointSnap) {
        // En snap endpoint (Ctrl), on masque le handle de courbure.
      } else if (!controlHover && !controlActive) {
        // Handle discret: visible uniquement au survol / drag actif.
      } else {
      drawEndpoint(
        ctx,
        controlHandlePoint.x,
        controlHandlePoint.y,
        controlHover ? "#6ea8ff" : color,
        controlHover ? scaleFactor * 1.05 : scaleFactor * 0.9,
      );
      }
    }
  } else {
    if (hoveredEndpoint === "start") {
      drawEndpoint(ctx, line.start.x, line.start.y, color, scaleFactor);
    } else {
      drawEndpointTick(ctx, line.start, line.end, color, lineWidth, scaleFactor);
    }

    if (hoveredEndpoint === "end") {
      drawEndpoint(ctx, line.end.x, line.end.y, color, scaleFactor);
    } else {
      drawEndpointTick(ctx, line.end, line.start, color, lineWidth, scaleFactor);
    }
  }

  // Label measure
  const lineShowLabels = line.config?.showSizeLabels ?? showMeasureSizeLabels;
  if (line.type === "measure" && lineShowLabels) {
    renderMeasureLabel(ctx, line, scaleFactor, color);
  }

  // Label calibrate
  const calibShowLabel =
    line.config?.showLabel !== false && showMeasureSizeLabels;
  if (line.type === "calibrate" && calibShowLabel) {
    renderCalibrateLabel(ctx, line, scaleFactor);
  }
}

/**
 * Dessine le label d'une mesure
 */
function renderMeasureLabel(ctx, line, scaleFactor, color) {
  const distance = getDistance(line.start, line.end);
  if (distance === 0) return;
  const labelText = calibrationUnit
    ? `${(distance / calibrationUnit).toFixed(2)}u`
    : `${Math.round(distance)}px`;
  const labelSize = line.config?.labelSize ?? measureLabelSize;
  renderMeasurementLabel(ctx, line, scaleFactor, labelText, labelSize);
}

/**
 * Dessine le label d'une calibration (1u)
 */
function renderCalibrateLabel(ctx, line, scaleFactor) {
  const unitsLabel = typeof i18next !== "undefined" ? i18next.t("drawing.unit") : "u";
  const labelSize = line.config?.labelSize ?? measureLabelSize;
  renderMeasurementLabel(ctx, line, scaleFactor, `1${unitsLabel}`, labelSize);
}

/**
 * Redessine toutes les mesures sur le canvas du mode overlay
 * Utilise les helpers Phase 6.2 pour le rendu par type
 */
function _renderDrawingMeasurementsNow(hoverPoint = null, hoverThreshold = 15) {
  if (!drawingMeasuresCtx || !drawingMeasures) return;
  syncEditableShapeSelection();

  const scaleFactor = getMeasureScaleFactor(drawingMeasures);

  clearCanvas(drawingMeasuresCtx, drawingMeasures);

  if (!measurementsVisible || measurementLines.length === 0) return;

  measurementLines.forEach((line) => {
    if (!line || !line.start || !line.end) return;

    // Ignorer la ligne calibrate si showCalibrateLine est false
    if (line.type === "calibrate" && !measureState.showCalibrateLine) return;

    // Ancien type protractor (cercle) - compatibilité
    if (line.type === "protractor") {
      drawSmoothCircle(
        drawingMeasuresCtx,
        line.start.x,
        line.start.y,
        line.radius,
        "#f59e0b",
        2 * scaleFactor,
        "rgba(245, 158, 11, 0.1)",
      );
      drawEndpoint(
        drawingMeasuresCtx,
        line.start.x,
        line.start.y,
        "#f59e0b",
        scaleFactor,
      );
      return;
    }

    // Compass
    if (line.type === "compass") {
      renderCompassLine(
        drawingMeasuresCtx,
        line,
        scaleFactor,
        hoverPoint,
        hoverThreshold,
      );
      return;
    }

    // Measure ou Calibrate
    renderMeasureLine(
      drawingMeasuresCtx,
      line,
      scaleFactor,
      hoverPoint,
      hoverThreshold,
    );
  });

  updateDrawingTotalDistance();
}

let _measureRedrawRafId = null;
let _measureRedrawPendingPoint = null;
let _measureRedrawPendingThreshold = 15;

function scheduleDrawingMeasurementsRedraw(hoverPoint = null, hoverThreshold = 15) {
  _measureRedrawPendingPoint = hoverPoint;
  _measureRedrawPendingThreshold = hoverThreshold;
  if (_measureRedrawRafId) return;
  _measureRedrawRafId = requestAnimationFrame(() => {
    _measureRedrawRafId = null;
    _renderDrawingMeasurementsNow(
      _measureRedrawPendingPoint,
      _measureRedrawPendingThreshold,
    );
  });
}

function redrawDrawingMeasurements(hoverPoint = null, hoverThreshold = 15) {
  _renderDrawingMeasurementsNow(hoverPoint, hoverThreshold);
}

/**
 * Dessine la prévisualisation d'une mesure
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {string} tool - Outil actuel (measure/calibrate)
 * @param {Object} options - Options : isShift (contrainte H/V), lockedLength (longueur verrouillée)
 */
function drawMeasurePreview(start, end, tool, { isShift = false, lockedLength = null } = {}) {
  if (!drawingPreviewCtx || !drawingPreview) return;

  clearCanvas(drawingPreviewCtx, drawingPreview);

  // Appliquer la contrainte Shift (horizontal/vertical) si demandé
  const drawEnd = isShift ? applyLineConstraint(start, end) : { ...end };

  const color =
    tool === "calibrate"
      ? "#10b981"
      : tool === "measure"
        ? measureColor
        : annotationStyle.color;

  // Ligne avec bornes
  drawLineWithEndpoints(drawingPreviewCtx, start, drawEnd, color, 2, true);

  // Dessiner les graduations selon la configuration
  if (tool === "measure") {
    if (
      measureGraduationType === "units" &&
      calibrationUnit &&
      calibrationUnit > 0
    ) {
      drawMeasureGraduations(
        drawingPreviewCtx,
        start,
        drawEnd,
        calibrationUnit,
        color,
      );
    } else if (measureGraduationType === "proportions") {
      drawMeasureProportions(drawingPreviewCtx, start, drawEnd);
    }
  }

  // Afficher la distance
  const distance = getDistance(start, drawEnd);

  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo && drawingCanvas) {
    measureInfo.classList.remove("hidden");
    measureInfo.style.left = (drawEnd.x / drawingCanvas.width) * 100 + "%";
    measureInfo.style.top = (drawEnd.y / drawingCanvas.height) * 100 - 5 + "%";

    const text = (tool === "measure" && calibrationUnit)
      ? `${(distance / calibrationUnit).toFixed(2)}u`
      : `${Math.round(distance)}px`;

    if (lockedLength !== null) {
      const lockIcon =
        '<svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 -960 960 960" width="12px" fill="currentColor" style="vertical-align: middle; margin-left: 2px;"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>';
      measureInfo.innerHTML = `${text}${lockIcon}`;
    } else {
      measureInfo.textContent = text;
    }
  }
}

/**
 * Dessine la prévisualisation du compas (outil protractor)
 * Affiche un cercle de rayon = unité calibrée centré sur le point,
 * et un segment montrant l'orientation choisie par la souris
 */
function drawCompassPreview(center, mousePos) {
  if (!drawingPreviewCtx || !drawingPreview || !calibrationUnit) return;

  clearCanvas(drawingPreviewCtx, drawingPreview);

  const radius = calibrationUnit * protractorMultiplier;

  // Récupérer les constantes de configuration
  const compassColor =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR
      : "#f59e0b";
  const previewFillOpacity =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_PREVIEW_FILL_OPACITY
      : 0.05;

  // Calculer l'angle entre le centre et la position de la souris
  const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x);

  // Calculer le point final du segment sur le cercle
  const endPoint = {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };

  // Dessiner le fond du cercle avec légère opacité
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  drawingPreviewCtx.fillStyle = `rgba(245, 158, 11, ${previewFillOpacity})`;
  drawingPreviewCtx.fill();

  // Dessiner le contour du cercle (en pointillés pour indiquer que c'est une preview)
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  drawingPreviewCtx.strokeStyle = "rgba(245, 158, 11, 0.4)";
  drawingPreviewCtx.lineWidth = 1;
  drawingPreviewCtx.setLineDash([5, 5]);
  drawingPreviewCtx.stroke();
  drawingPreviewCtx.setLineDash([]);

  // Dessiner le segment du compas (ligne du centre vers le point sur le cercle)
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.moveTo(center.x, center.y);
  drawingPreviewCtx.lineTo(endPoint.x, endPoint.y);
  drawingPreviewCtx.strokeStyle = compassColor;
  drawingPreviewCtx.lineWidth = 2;
  drawingPreviewCtx.stroke();

  // Dessiner les bornes (centre et extrémité)
  drawEndpoint(drawingPreviewCtx, center.x, center.y, compassColor);
  drawEndpoint(drawingPreviewCtx, endPoint.x, endPoint.y, compassColor);

  // Afficher l'info de distance
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) {
    measureInfo.classList.remove("hidden");
    const unitsLabel =
      i18next.t("drawing.units");
    measureInfo.textContent = `${Math.round(radius)}px (${protractorMultiplier} ${unitsLabel})`;
  }
}

/**
 * Finalise le compas : crée une mesure-compas (segment de longueur = unité calibrée)
 */
function finalizeCompass(center, mousePos) {
  if (!calibrationUnit || calibrationUnit <= 0) {
    showDrawingToast(
      i18next.t("drawing.calibrationRequired"),
      "warning",
    );
    return;
  }

  const radius = calibrationUnit * protractorMultiplier;

  // Calculer l'angle entre le centre et la position de la souris
  const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x);

  // Calculer le point final du segment sur le cercle
  const endPoint = {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };

  // Créer une mesure de type "compass" (similaire à measure mais avec le radius stocké)
  measurementLines.push({
    id: Date.now(),
    start: { ...center },
    end: endPoint,
    type: "compass",
    radius: radius,
    multiplier: protractorMultiplier,
  });

  redrawDrawingMeasurements();

  // Cacher l'info de mesure
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) measureInfo.classList.add("hidden");
}

/**
 * Finalise une mesure de distance (mode overlay)
 */
function finalizeDrawingMeasurement(start, end, isShift = false) {
  // Appliquer la contrainte Shift (horizontal/vertical)
  const finalEnd = isShift ? applyLineConstraint(start, end) : { ...end };

  measurementLines.push({
    id: Date.now(),
    start: { ...start },
    end: finalEnd,
    type: "measure",
    color: measureState.color,
    lineWidth: measureState.lineWidth,
  });

  redrawDrawingMeasurements();
  updateDrawingTotalDistance();
  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
}

/**
 * Finalise la calibration (mode overlay)
 */
function finalizeDrawingCalibration(start, end, isShift = false) {
  // Appliquer la contrainte Shift (horizontal/vertical)
  const finalEnd = isShift ? applyLineConstraint(start, end) : { ...end };
  const distance = getDistance(start, finalEnd);

  // Supprimer l'ancienne calibration
  measurementLines = measurementLines.filter(
    (line) => line.type !== "calibrate",
  );

  calibrationUnit = distance;

  // Rendre le segment visible par défaut lors de la création
  measureState.showCalibrateLine = true;

  measurementLines.push({
    id: Date.now(),
    start: { ...start },
    end: finalEnd,
    type: "calibrate",
  });

  // Mettre à jour la taille de toutes les mesures compass existantes
  resizeCompassLines(distance);

  redrawDrawingMeasurements();

  // Mettre à jour l'affichage de l'info d'unité (respecte showUnitInfo)
  updateDrawingUnitInfo();

  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
}

/**
 * Met à jour l'affichage des infos d'unité (mode overlay)
 */
function updateDrawingUnitInfo() {
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
  const unitValue = drawingDOM.unitValue || document.getElementById("drawing-unit-value");
  if (!unitInfo || !unitValue) return;

  if (calibrationUnit && calibrationUnit > 0) {
    unitInfo.classList.remove("hidden");
    unitValue.textContent = `${Math.round(calibrationUnit)}px`;
  } else {
    unitInfo.classList.add("hidden");
  }
}

/**
 * Supprime toutes les lignes de calibration et de compas
 */
function removeCalibrateAndCompass() {
  measurementLines = measurementLines.filter(
    (line) => line.type !== "calibrate" && line.type !== "compass",
  );
}

/**
 * Redimensionne toutes les lignes compas à la longueur donnée
 * Conserve l'origine et la direction de chaque ligne
 * @param {number} newLength - Nouvelle longueur en pixels
 */
function resizeCompassLines(newLength) {
  if (newLength <= 0) return;
  measurementLines.forEach((line) => {
    if (line.type === "compass") {
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const currentLength = getDistance(line.start, line.end);
      if (currentLength > 0) {
        const normalizedDx = dx / currentLength;
        const normalizedDy = dy / currentLength;
        line.end = {
          x: line.start.x + normalizedDx * newLength,
          y: line.start.y + normalizedDy * newLength,
        };
      }
    }
  });
}

/**
 * Met à jour le total des distances (mode overlay)
 */
function updateDrawingTotalDistance() {
  const totalDistance = drawingDOM.totalDistanceInfo || document.getElementById("drawing-total-distance-info");
  const totalValue = drawingDOM.totalDistanceValue || document.getElementById("drawing-total-distance-value");
  if (!totalDistance || !totalValue) return;

  const measureLines = measurementLines.filter(
    (line) => line.type === "measure",
  );
  if (measureLines.length === 0) {
    totalDistance.classList.add("hidden");
    return;
  }

  let total = 0;
  measureLines.forEach((line) => {
    const dist = Math.sqrt(
      Math.pow(line.end.x - line.start.x, 2) +
        Math.pow(line.end.y - line.start.y, 2),
    );
    total += dist;
  });

  totalDistance.classList.remove("hidden");
  if (calibrationUnit && calibrationUnit > 0) {
    const units = (total / calibrationUnit).toFixed(2);
    const unitsLabel =
      i18next.t("drawing.units");
    totalValue.textContent = `${Math.round(total)}px (${i18next.t("draw.toasts.ie")} ${units} ${unitsLabel})`;
  } else {
    totalValue.textContent = `${Math.round(total)}px`;
  }
}


// ================================================================
// MODULE: toolbar.js
// ================================================================

// FACTORY TOOLBAR

const TOOL_DEFINITIONS = {
  pencil: { icon: "PENCIL", tooltip: () => i18next.t("draw.tools.pencil", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_PENCIL.toUpperCase() }), hasStabilizerMenu: true },
  eraser: { icon: "ERASER", tooltip: () => i18next.t("draw.tools.eraser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ERASER.toUpperCase() }), hasEraserMenu: true },
  laser: { icon: "LASER_POINTER", tooltip: () => i18next.t("draw.tools.laser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LASER }) },
  line: {
    icon: "LINE",
    tooltip: () =>
      i18next.t("draw.tools.line", {
        hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LINE.toUpperCase(),
      }),
    hasRectangleMenu: true,
  },
  arrow: {
    icon: "ARROW",
    tooltip: () => i18next.t("draw.tools.arrow", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ARROW.toUpperCase() }),
    hasRectangleMenu: true,
  },
  rectangle: {
    icon: "RECTANGLE",
    tooltip: () =>
      i18next.t("draw.tools.rectangle", {
        hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_RECTANGLE.toUpperCase(),
      }),
    hasRectangleMenu: true,
  },
  circle: {
    icon: "CIRCLE",
    tooltip: () => i18next.t("draw.tools.circle", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_CIRCLE.toUpperCase() }),
    hasRectangleMenu: true,
  },
  measure: {
    icon: "MEASURE",
    tooltip: () => i18next.t("draw.tools.measure", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_MEASURE.toUpperCase() }),
    hasMeasureMenu: true,
  },
  calibrate: {
    icon: "CALIBRATE",
    tooltip: () => i18next.t("draw.tools.calibrate", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_CALIBRATE.toUpperCase() }),
    hasCalibrateMenu: true,
  },
  protractor: { icon: "PROTRACTOR", tooltip: () => i18next.t("draw.tools.protractor", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_PROTRACTOR }) },
};

/**
 * Crée un bouton d'outil avec sa configuration
 * @param {string} toolId - L'identifiant de l'outil
 * @param {Object} options - Options de création
 * @param {string} options.btnClass - Classe CSS du bouton
 * @param {Function} options.onSelect - Callback de sélection
 * @param {string} [options.activeClass] - Classe pour l'état actif
 * @returns {HTMLButtonElement}
 */
function createToolButton(toolId, options) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return null;

  const { btnClass, onSelect, activeClass = "active" } = options;
  const isActive = toolId === "pencil";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${btnClass} ${isActive ? activeClass : ""}`.trim();
  btn.setAttribute("data-tool", toolId);
  btn.setAttribute("data-tooltip", typeof def.tooltip === "function" ? def.tooltip() : def.tooltip);
  btn.innerHTML = ICONS[def.icon];

  btn.onclick = () => onSelect(toolId, btn);

  // Menus contextuels spécifiques
  if (def.hasStabilizerMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showStabilizerMenu(e.clientX, e.clientY);
    };
  }
  if (def.hasEraserMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showEraserToolMenu(e.clientX, e.clientY);
    };
  }
  if (def.hasMeasureMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showMeasureConfig();
    };
  }
  if (def.hasCalibrateMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      const calibrateLine = measurementLines.find(
        (line) => line.type === "calibrate",
      );
      if (calibrateLine) {
        showCalibrateIndividualConfig(calibrateLine, e.clientX, e.clientY);
      } else {
        showDrawingToast(
          i18next.t("draw.toasts.noUnitDefined"),
          "info",
        );
      }
    };
  }
  if (def.hasRectangleMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showRectangleToolMenu(e.clientX, e.clientY);
    };
  }
  return btn;
}

/**
 * Crée tous les boutons d'outils pour une toolbar
 * @param {Object} options - Options de création
 * @param {string} options.btnClass - Classe CSS des boutons
 * @param {HTMLElement} options.toolbar - Élément toolbar pour la sélection
 * @param {string} options.toolSelector - Sélecteur CSS pour les boutons d'outils
 * @returns {Object} Map des boutons par toolId
 */
function createAllToolButtons(options) {
  const { btnClass, toolbar, toolSelector } = options;
  const tools = {};

  const onSelect = (toolId, btn) => {
    toolbar
      .querySelectorAll(toolSelector)
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = toolId;
    if (!["line", "rectangle", "circle", "arrow"].includes(toolId)) {
      clearEditableShapeSelection();
      redrawDrawingMeasurements();
    }
    hideDrawingEditHud();
    updateDrawingCursor();
  };

  Object.keys(TOOL_DEFINITIONS).forEach((toolId) => {
    tools[toolId] = createToolButton(toolId, { btnClass, onSelect });
  });

  return tools;
}

/**
 * Crée les boutons d'action (clear, clearMeasurements)
 * @param {string} btnClass - Classe CSS des boutons
 * @returns {Object} Map des boutons
 */
function createActionButtons(btnClass) {
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = btnClass;
  clearBtn.setAttribute("data-tool", "clear");
  clearBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearDrawing"));
  clearBtn.innerHTML = ICONS.CLEAR;
  clearBtn.onclick = () => clearDrawingCanvas();

  const clearMeasurementsBtn = document.createElement("button");
  clearMeasurementsBtn.type = "button";
  clearMeasurementsBtn.className = btnClass;
  clearMeasurementsBtn.setAttribute("data-tool", "clear-measurements");
  clearMeasurementsBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearMeasurements"));
  clearMeasurementsBtn.innerHTML = ICONS.TRASH_RAYURES;
  clearMeasurementsBtn.onclick = () => clearDrawingMeasurements();

  return { clear: clearBtn, clearMeasurements: clearMeasurementsBtn };
}

/**
 * Crée les inputs couleur et taille
 * @param {Object} options - Options de style
 * @returns {Object} { colorInput, sizeInput }
 */
function createStyleInputs(options = {}) {
  const { colorClass = "", sizeClass = "" } = options;

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = options.colorId || "drawing-color";
  colorInput.value = annotationStyle.color;
  colorInput.className = colorClass;
  colorInput.setAttribute("data-tooltip", i18next.t("draw.config.color"));
  colorInput.oninput = (e) => {
    annotationStyle.color = e.target.value;
  };

  const sizeInput = document.createElement("input");
  sizeInput.type = "range";
  sizeInput.id = options.sizeId || "drawing-size";
  sizeInput.min = "1";
  sizeInput.max = "50";
  sizeInput.value = annotationStyle.size;
  sizeInput.className = sizeClass;
  sizeInput.title = i18next.t("draw.sliders.size");
  sizeInput.oninput = (e) => {
    annotationStyle.size = parseInt(e.target.value);
    updateDrawingCursor();
  };

  return { colorInput, sizeInput };
}

/**
 * Crée le bouton table lumineuse
 * @param {Object} options - Options
 * @param {string} options.btnClass - Classe CSS
 * @param {string} options.context - "main" ou "zoom"
 * @returns {HTMLButtonElement}
 */
function createLightboxButton(options) {
  const { btnClass, context = "main" } = options;
  const updateFn =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;
  const menuFn =
    context === "zoom"
      ? (x, y) => showLightboxMenu(x, y, "zoom")
      : showDrawingLightboxMenu;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = context === "zoom" ? "zoom-lightbox-btn" : "drawing-lightbox-btn";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.lightbox"));
  btn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;

  btn.onclick = (e) => {
    if (e.button === 2 || e.ctrlKey) {
      menuFn(e.clientX, e.clientY);
    } else {
      lightboxEnabled = !lightboxEnabled;
      updateFn();
      btn.innerHTML = lightboxEnabled
        ? ICONS.LIGHT_TABLE_OFF
        : ICONS.LIGHT_TABLE_ON;
      btn.classList.toggle("active", lightboxEnabled);
    }
  };
  btn.oncontextmenu = (e) => {
    e.preventDefault();
    menuFn(e.clientX, e.clientY);
  };

  return btn;
}

/**
 * Crée le bouton export
 * @param {Object} options - Options
 * @param {string} options.btnClass - Classe CSS
 * @param {string} options.context - "main" ou "zoom"
 * @returns {HTMLButtonElement}
 */
function createExportButton(options) {
  const { btnClass, context = "main" } = options;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = context === "zoom" ? "zoom-export-btn" : "drawing-export";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.export", { hotkey: `Ctrl+${CONFIG.HOTKEYS.DRAWING_EXPORT.toUpperCase()}` }));
  btn.innerHTML = ICONS.EXPORT;
  btn.onclick = () =>
    context === "zoom" ? showExportModal("zoom") : showDrawingExportOptions();

  return btn;
}

/**
 * Crée l'indicateur de zoom avec bouton de réinitialisation
 * @returns {HTMLElement} Container avec l'indicateur
 */
function createZoomIndicator() {
  const container = document.createElement("div");
  container.className = "zoom-indicator-container";

  const label = document.createElement("div");
  label.className = "zoom-indicator-label";
  label.textContent = i18next.t("draw.zoom.label");

  const valueRow = document.createElement("div");
  valueRow.className = "zoom-indicator-value-row";

  const value = document.createElement("span");
  value.className = "zoom-indicator-value";
  value.id = "zoom-indicator-value";
  value.textContent = "100%";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "zoom-indicator-reset";
  resetBtn.innerHTML = "⟲";
  resetBtn.setAttribute(
    "data-tooltip",
    i18next.t("draw.buttons.resetZoom"),
  );

  valueRow.appendChild(value);
  valueRow.appendChild(resetBtn);

  container.appendChild(label);
  container.appendChild(valueRow);

  resetBtn.onclick = resetCanvasZoomPan;

  return container;
}

/**
 * Met à jour l'affichage du niveau de zoom
 * Met à jour tous les indicateurs présents (mode principal et mode zoom)
 */
function updateZoomIndicator() {
  const indicators = document.querySelectorAll(".zoom-indicator-value");
  const zoomText = Math.round(ZoomManager.scale * 100) + "%";
  const rotation = ZoomManager.rotation;
  const rotText = rotation !== 0 ? ` ${Math.round(rotation)}°` : "";
  indicators.forEach((indicator) => {
    indicator.textContent = zoomText + rotText;
  });
}

function createCloseButton(options) {
  const { btnClass, onClose } = options;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "drawing-close";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.closeWithKey", { hotkey: CONFIG.HOTKEYS.DRAWING_CLOSE }));
  btn.innerHTML = ICONS.CLOSE;
  btn.onclick = onClose;

  return btn;
}

// Marqueur séparateur pour la drawing-toolbar
const DIVIDER = { type: "divider" };

function populateDrawingToolbar() {
  if (!drawingToolbar) return;

  // Vider le contenu existant
  drawingToolbar.innerHTML = "";

  // Créer les outils avec les helpers partagés
  const toolElements = createAllToolButtons({
    btnClass: "annotation-tool",
    toolbar: drawingToolbar,
    toolSelector: ".annotation-tool[data-tool]",
  });

  // Boutons d'action
  const actionBtns = createActionButtons("annotation-tool");

  // Inputs
  const { colorInput, sizeInput } = createStyleInputs({
    colorId: "drawing-color",
    sizeId: "drawing-size",
  });

  // Boutons spéciaux
  const lightboxBtn = createLightboxButton({
    btnClass: "annotation-tool",
    context: "main",
  });
  const exportBtn = createExportButton({
    btnClass: "annotation-tool",
    context: "main",
  });
  const closeBtn = createCloseButton({
    btnClass: "annotation-btn-close",
    onClose: closeDrawingMode,
  });

  // ============================================================
  // LAYOUT DE LA DRAWING-TOOLBAR
  // DIVIDER pour ajouter un séparateur visuel
  // ============================================================
  const toolbarLayout = [
    // Outils de dessin
    toolElements.pencil,
    toolElements.eraser,
    toolElements.laser,
    toolElements.line,
    toolElements.arrow,
    toolElements.rectangle,
    toolElements.circle,
    actionBtns.clear,
    DIVIDER,
    toolElements.measure,
    toolElements.calibrate,
    toolElements.protractor,
    actionBtns.clearMeasurements,
    DIVIDER,
    colorInput,
    sizeInput,
    DIVIDER,
    lightboxBtn,
    exportBtn,
    DIVIDER,
    ...(CONFIG.enableZoomInDrawingMode ? [createZoomIndicator()] : []),
    closeBtn,
  ];

  // ============================================================
  // ASSEMBLAGE (ne pas modifier)
  // ============================================================
  toolbarLayout.forEach((item) => {
    if (item === DIVIDER) {
      const div = document.createElement("div");
      div.className = "toolbar-divider";
      drawingToolbar.appendChild(div);
    } else if (item) {
      drawingToolbar.appendChild(item);
    }
  });
}


/**
 * Initialise le drag de la toolbar du mode overlay
 */
function initDrawingToolbarDrag() {
  if (!drawingToolbar) return;

  let isDragging = false;
  let startX, startY, startLeft, startTop;
  let dockZone = null;
  let isInDockZone = false;

  // Fonction pour basculer entre vertical et horizontal
  const toggleToolbarOrientation = () => {
    const isHorizontal = drawingToolbar.classList.contains("horizontal");
    drawingToolbar.classList.toggle("horizontal", !isHorizontal);

    // Réajuster la position si nécessaire
    requestAnimationFrame(() => {
      const rect = drawingToolbar.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        drawingToolbar.style.left = window.innerWidth - rect.width - 10 + "px";
      }
      if (rect.bottom > window.innerHeight - 10) {
        drawingToolbar.style.top = window.innerHeight - rect.height - 10 + "px";
      }
    });
  };

  // Créer la zone de dock
  const createDockZone = () => {
    if (dockZone) return dockZone;

    dockZone = document.createElement("div");
    dockZone.className = "toolbar-dock-zone";
    dockZone.innerHTML =
      `<span class="toolbar-dock-zone-label">${i18next.t("draw.modals.dockHorizontal")}</span>`;
    document.body.appendChild(dockZone);

    return dockZone;
  };

  // Mettre à jour la position de la zone de dock (sous l'image ou en bas de l'écran)
  const updateDockZonePosition = () => {
    if (!dockZone) return;

    const margin = 10;
    const dockHeight = 50; // Hauteur de la zone de dock
    const imageWrapper = document.querySelector(".image-wrapper");

    let topPosition;

    if (imageWrapper) {
      const rect = imageWrapper.getBoundingClientRect();
      // Essayer de positionner juste sous l'image
      topPosition = rect.bottom + margin;

      // Si ça sort de l'écran, coller en bas
      if (topPosition + dockHeight > window.innerHeight - margin) {
        topPosition = window.innerHeight - dockHeight - margin;
      }
    } else {
      // Fallback : en bas de l'écran
      topPosition = window.innerHeight - dockHeight - margin;
    }

    dockZone.style.top = topPosition + "px";
    dockZone.style.bottom = "auto";
  };

  // Vérifier si le curseur est dans la zone de dock
  const checkDockZone = (mouseX, mouseY) => {
    if (!dockZone) return false;

    const rect = dockZone.getBoundingClientRect();
    return (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    );
  };

  // Snapper la toolbar sous l'image en mode horizontal
  const snapToBottom = () => {
    // Passer en mode horizontal
    drawingToolbar.classList.add("horizontal");

    // Attendre le reflow pour obtenir les bonnes dimensions
    requestAnimationFrame(() => {
      // Relire les dimensions après le changement de mode
      const toolbarRect = drawingToolbar.getBoundingClientRect();
      const toolbarHeight = toolbarRect.height;
      const toolbarWidth = toolbarRect.width;
      const imageWrapper = document.querySelector(".image-wrapper");
      const margin = 10;

      let newLeft, newTop;

      if (imageWrapper) {
        const imageRect = imageWrapper.getBoundingClientRect();

        // Centrer horizontalement par rapport à l'image
        newLeft = imageRect.left + (imageRect.width - toolbarWidth) / 2;

        // Essayer de positionner sous l'image
        newTop = imageRect.bottom + margin;

        // Si ça sort de l'écran en bas, coller au bas de l'écran
        if (newTop + toolbarHeight > window.innerHeight - margin) {
          newTop = window.innerHeight - toolbarHeight - margin;
        }
      } else {
        // Fallback : centrer en bas de l'écran
        newLeft = (window.innerWidth - toolbarWidth) / 2;
        newTop = window.innerHeight - toolbarHeight - margin;
      }

      // S'assurer que la toolbar reste dans l'écran horizontalement
      newLeft = Math.max(
        margin,
        Math.min(newLeft, window.innerWidth - toolbarWidth - margin),
      );

      drawingToolbar.style.left = newLeft + "px";
      drawingToolbar.style.top = newTop + "px";
    });
  };

  // Fonction pour démarrer le drag
  const startDrag = (e) => {
    isDragging = true;
    isInDockZone = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = drawingToolbar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    // Supprimer le transform pour utiliser left/top
    drawingToolbar.style.transform = "none";
    drawingToolbar.style.left = startLeft + "px";
    drawingToolbar.style.top = startTop + "px";

    // Créer et afficher la zone de dock
    createDockZone();
    updateDockZonePosition();
    dockZone.classList.add("visible");

    e.preventDefault();
  };

  // Détecter si le clic est sur un élément draggable (toolbar-handle ou les bords)
  const isClickOnDraggableArea = (e) => {
    const target = e.target;

    // Si on clique sur toolbar-handle ou son contenu, c'est draggable
    if (target.closest(".toolbar-handle")) return true;

    // Si on clique directement sur la toolbar (pas sur un bouton/input)
    if (target === drawingToolbar) return true;

    // Si on clique sur un label de section (DESSIN, MESURE)
    if (target.classList.contains("toolbar-section-label")) return true;

    // Si on clique sur un séparateur
    if (target.classList.contains("toolbar-separator")) return true;

    return false;
  };

  // Event sur la toolbar entière
  drawingToolbar.onmousedown = (e) => {
    if (isClickOnDraggableArea(e)) {
      startDrag(e);
    }
  };

  // Clic droit pour basculer l'orientation manuellement
  drawingToolbar.oncontextmenu = (e) => {
    // Ne pas interférer avec les clics droits sur les boutons (pencil, measure, etc.)
    if (e.target.closest(".annotation-tool")) return;

    e.preventDefault();
    toggleToolbarOrientation();
  };

  // Handler mousemove (nommé pour nettoyage)
  globalEventHandlers.toolbarMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

    // Contraindre au viewport
    const toolbarRect = drawingToolbar.getBoundingClientRect();
    const margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN;
    newLeft = Math.max(
      margin,
      Math.min(window.innerWidth - toolbarRect.width - margin, newLeft),
    );
    newTop = Math.max(
      margin,
      Math.min(window.innerHeight - toolbarRect.height - margin, newTop),
    );

    drawingToolbar.style.left = newLeft + "px";
    drawingToolbar.style.top = newTop + "px";

    // Vérifier si on est dans la zone de dock
    const nowInDockZone = checkDockZone(e.clientX, e.clientY);
    if (nowInDockZone !== isInDockZone) {
      isInDockZone = nowInDockZone;
      if (dockZone) {
        dockZone.classList.toggle("active", isInDockZone);
      }
    }
  };

  // Handler mouseup (nommé pour nettoyage)
  globalEventHandlers.toolbarMouseUp = () => {
    if (isDragging) {
      // Si on lâche dans la zone de dock, snapper
      if (isInDockZone) {
        snapToBottom();
      }

      // Cacher la zone de dock
      if (dockZone) {
        dockZone.classList.remove("visible", "active");
      }
    }

    isDragging = false;
    isInDockZone = false;
  };

  document.addEventListener("mousemove", globalEventHandlers.toolbarMouseMove);
  document.addEventListener("mouseup", globalEventHandlers.toolbarMouseUp);

  // Handler resize (nommé pour nettoyage)
  globalEventHandlers.toolbarResize = () => {
    if (!drawingToolbar || drawingToolbar.classList.contains("hidden")) return;

    const rect = drawingToolbar.getBoundingClientRect();
    const margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN;
    let needsUpdate = false;
    let newLeft = rect.left;
    let newTop = rect.top;

    // Vérifier si la toolbar sort à droite
    if (rect.right > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort à gauche
    if (rect.left < margin) {
      newLeft = margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort en bas
    if (rect.bottom > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort en haut
    if (rect.top < margin) {
      newTop = margin;
      needsUpdate = true;
    }

    if (needsUpdate) {
      drawingToolbar.style.transform = "none";
      drawingToolbar.style.left = Math.max(margin, newLeft) + "px";
      drawingToolbar.style.top = Math.max(margin, newTop) + "px";
    }
  };

  // Écouter le redimensionnement de la fenêtre
  window.addEventListener("resize", globalEventHandlers.toolbarResize);
}


// ================================================================
// MODULE: menus.js
// ================================================================

/**
 * Crée un menu contextuel avec contrainte à l'écran
 */
function createContextMenu(id, x, y) {
  const menu = document.createElement("div");
  menu.id = id;
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.visibility = "hidden"; // Cacher temporairement pour mesurer

  // Observer le rendu pour contraindre la position
  requestAnimationFrame(() => {
    constrainMenuToScreen(menu);
    menu.style.visibility = "visible";
  });

  return menu;
}

/**
 * Contraint un menu contextuel à rester visible à l'écran
 */
function constrainMenuToScreen(menu) {
  const rect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8; // Marge par rapport aux bords

  let newLeft = parseInt(menu.style.left) || 0;
  let newTop = parseInt(menu.style.top) || 0;

  // Contraindre horizontalement
  if (rect.right > viewportWidth - margin) {
    newLeft = viewportWidth - rect.width - margin;
  }
  if (newLeft < margin) {
    newLeft = margin;
  }

  // Contraindre verticalement (priorité au bas de l'écran)
  if (rect.bottom > viewportHeight - margin) {
    // Si le menu dépasse en bas, le positionner au-dessus du point de clic
    newTop = viewportHeight - rect.height - margin;
  }
  if (newTop < margin) {
    newTop = margin;
  }

  menu.style.left = newLeft + "px";
  menu.style.top = newTop + "px";
}

/**
 * Ajoute un titre au menu
 * @param {HTMLElement} menu - Le menu
 * @param {string} title - Le titre
 * @param {string} [icon] - L'icône SVG optionnelle
 */
function addMenuTitle(menu, title, icon) {
  const titleEl = document.createElement("div");
  titleEl.className = "context-menu-title";
  if (icon) {
    titleEl.innerHTML = `<span class="context-menu-title-icon">${icon}</span>${title}`;
  } else {
    titleEl.textContent = title;
  }
  menu.appendChild(titleEl);
}

/**
 * Ajoute une option toggle au menu
 */
function addMenuToggleOption(menu, options) {
  const { id, label, checked, onChange, labelClass = "" } = options;

  const row = document.createElement("div");
  row.className = "context-menu-row";

  const labelEl = document.createElement("span");
  labelEl.className = `context-menu-label ${labelClass}`.trim();
  labelEl.textContent = label;

  const toggle = document.createElement("label");
  toggle.className = "proportion-checkbox";
  toggle.innerHTML = `
    <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
    <span class="proportion-slider"></span>
  `;

  const input = toggle.querySelector("input");
  input.addEventListener("change", () => onChange(input.checked));

  row.appendChild(labelEl);
  row.appendChild(toggle);
  menu.appendChild(row);

  row.addEventListener("click", (e) => {
    // Ne pas déclencher si on clique sur la checkbox ou son label parent
    if (e.target === input || e.target.closest(".proportion-checkbox")) {
      return;
    }
    input.checked = !input.checked;
    onChange(input.checked);
  });
}

/**
 * Ajoute un slider au menu
 */
function addMenuSlider(menu, options) {
  const { label, min, max, value, unit, onChange } = options;

  const row = document.createElement("div");
  row.className = "context-menu-row slider-row";

  const header = document.createElement("div");
  header.className = "context-menu-slider-header";

  const labelEl = document.createElement("span");
  labelEl.className = "context-menu-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "context-menu-value";
  valueEl.textContent = value + (unit || "");

  header.appendChild(labelEl);
  header.appendChild(valueEl);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "context-menu-slider";
  slider.min = min;
  slider.max = max;
  slider.value = value;

  slider.addEventListener("input", () => {
    valueEl.textContent = slider.value + (unit || "");
    onChange(parseInt(slider.value));
  });

  row.appendChild(header);
  row.appendChild(slider);
  menu.appendChild(row);
}

function addMenuSeparator(menu) {
  const separator = document.createElement("div");
  separator.className = "context-menu-separator";
  menu.appendChild(separator);
}

function addMenuChoiceItem(menu, options) {
  const { label, active = false, onClick } = options;
  const item = document.createElement("div");
  item.className = `context-menu-item ${active ? "active" : ""}`.trim();
  item.style.whiteSpace = "normal";
  item.style.lineHeight = "1.35";
  item.textContent = label;
  item.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onClick === "function") onClick();
  });
  menu.appendChild(item);
}

/**
 * Configure la fermeture du menu au clic à l'extérieur
 */
function setupMenuCloseOnClickOutside(menu) {
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("mousedown", closeHandler);
    }
  };
  // Délai pour éviter la fermeture immédiate
  setTimeout(() => {
    document.addEventListener("mousedown", closeHandler);
  }, 10);
}

/**
 * Ferme tous les menus et modals de dessin ouverts
 */
function closeAllDrawingMenus() {
  const menus = [
    "stabilizer-menu",
    "lightbox-menu",
    "eraser-tool-menu",
    "measure-config-popup",
    "shape-individual-config-popup",
    "protractor-menu",
    "export-options-modal",
  ];
  menus.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}


/**
 * Crée un row avec label et color picker inline
 * @param {string} label - Le label à afficher
 * @param {string} id - L'id de l'input
 * @param {string} value - La valeur hexadécimale de la couleur
 * @param {Function} onChange - Callback appelé avec la nouvelle couleur
 * @returns {HTMLElement} L'élément row
 */
function createColorRow(label, id, value, onChange) {
  const row = document.createElement("div");
  row.className = "config-row-inline";
  row.innerHTML = `
    <span class="config-label">${label}</span>
    <input type="color" class="color-picker-mini" id="${id}" value="${value}">
  `;
  const input = row.querySelector("input");
  input.addEventListener("input", (e) => onChange(e.target.value));
  return row;
}

/**
 * Crée un row avec label et toggle checkbox
 * @param {string} label - Le label à afficher
 * @param {string} id - L'id de l'input
 * @param {boolean} checked - État initial
 * @param {Function} onChange - Callback appelé avec le nouvel état
 * @param {string} [marginTop] - Marge supérieure optionnelle (ex: "10px")
 * @returns {HTMLElement} L'élément row
 */
function createToggleRow(label, id, checked, onChange, marginTop = null) {
  const row = document.createElement("div");
  row.className = "config-row-inline";
  if (marginTop) row.style.marginTop = marginTop;
  row.innerHTML = `
    <span class="config-label">${label}</span>
    <label class="proportion-checkbox">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
      <span class="proportion-slider"></span>
    </label>
  `;
  const input = row.querySelector("input");
  input.addEventListener("change", (e) => onChange(e.target.checked));
  return row;
}

/**
 * Crée une section avec label et slider
 * @param {string} label - Le label de la section
 * @param {string} id - L'id du slider
 * @param {Object} config - Configuration du slider {min, max, step, value, unit}
 * @param {Function} onChange - Callback appelé avec la nouvelle valeur
 * @returns {HTMLElement} L'élément section
 */
function createSliderSection(label, id, config, onChange) {
  const { min, max, step, value, unit } = config;
  const section = document.createElement("div");
  section.className = "config-section";
  section.innerHTML = `
    <div class="config-section-label">${label}</div>
    <div class="graduation-size-control">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="graduation-size-value" id="${id}-display">${value.toFixed(1)}${unit}</span>
    </div>
  `;
  const slider = section.querySelector("input");
  const display = section.querySelector(`#${id}-display`);
  slider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    display.textContent = val.toFixed(1) + unit;
    onChange(val);
  });
  return section;
}

/**
 * Crée les boutons de type graduation (none/units/proportions)
 * @param {string} currentType - Le type actuel
 * @param {Function} onChange - Callback appelé avec le nouveau type
 * @returns {HTMLElement} L'élément container des boutons
 */
function createGraduationTypeButtons(currentType, onChange) {
  const container = document.createElement("div");
  container.className = "graduation-type-buttons";

  const types = [
    { type: "none", icon: "—", label: i18next.t("draw.config.none") },
    { type: "units", icon: ICONS.CALIBRATE, label: i18next.t("drawing.units") },
    { type: "proportions", icon: "½", label: i18next.t("draw.config.proportions") },
  ];

  types.forEach(({ type, icon, label }) => {
    const btn = document.createElement("button");
    btn.className = `graduation-type-btn ${currentType === type ? "active" : ""}`;
    btn.dataset.type = type;
    btn.innerHTML = `<span class="btn-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".graduation-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(type);
    });
    container.appendChild(btn);
  });

  return container;
}

/**
 * Crée les boutons de subdivisions (0/2/3/4)
 * @param {number} currentSubdiv - La subdivision actuelle
 * @param {Function} onChange - Callback appelé avec la nouvelle subdivision
 * @returns {HTMLElement} L'élément container des boutons
 */
function createSubdivisionButtons(currentSubdiv, onChange) {
  const container = document.createElement("div");
  container.className = "graduation-type-buttons";

  const subdivs = [
    { value: 0, icon: "—", label: i18next.t("draw.config.noSubdivision") },
    { value: 2, icon: "½", label: i18next.t("draw.config.half") },
    { value: 3, icon: "⅓", label: i18next.t("draw.config.thirds") },
    { value: 4, icon: "¼", label: i18next.t("draw.config.quarters") },
  ];

  subdivs.forEach(({ value, icon, label }) => {
    const btn = document.createElement("button");
    btn.className = `graduation-type-btn ${currentSubdiv === value ? "active" : ""}`;
    btn.dataset.subdiv = value;
    btn.innerHTML = `<span class="btn-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".graduation-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(value);
    });
    container.appendChild(btn);
  });

  return container;
}

/**
 * Crée une option de proportion (checkbox avec couleur)
 * @param {string} colorId - L'id du color picker
 * @param {string} checkboxId - L'id de la checkbox
 * @param {string} label - Le label (ex: "Milieu (½)")
 * @param {string} color - La couleur actuelle
 * @param {boolean} checked - État de la checkbox
 * @param {Function} onColorChange - Callback pour le changement de couleur
 * @param {Function} onCheckChange - Callback pour le changement de checkbox
 * @returns {HTMLElement} L'élément option
 */
function createProportionOption(
  colorId,
  checkboxId,
  label,
  color,
  checked,
  onColorChange,
  onCheckChange,
) {
  const option = document.createElement("div");
  option.className = "proportion-option";
  option.innerHTML = `
    <span class="proportion-label">
      <input type="color" class="color-picker-mini" id="${colorId}" value="${color}">
      ${label}
    </span>
    <label class="proportion-checkbox">
      <input type="checkbox" id="${checkboxId}" ${checked ? "checked" : ""}>
      <span class="proportion-slider"></span>
    </label>
  `;

  option
    .querySelector(`#${colorId}`)
    .addEventListener("input", (e) => onColorChange(e.target.value));
  option
    .querySelector(`#${checkboxId}`)
    .addEventListener("change", (e) => onCheckChange(e.target.checked));

  return option;
}

/**
 * Crée la section des options de proportions complète
 * @param {Object} config - La configuration des proportions
 * @param {Function} onUpdate - Callback appelé avec la clé et la nouvelle valeur
 * @param {boolean} [disabled=false] - Si la section est désactivée
 * @returns {HTMLElement} L'élément section
 */
function createProportionsSection(config, onUpdate, disabled = false) {
  const section = document.createElement("div");
  section.className = `proportions-options ${disabled ? "disabled" : ""}`;

  // Option "Afficher les labels"
  const labelsRow = createToggleRow(
    i18next.t("draw.config.showLabels"),
    "prop-labels",
    config.showLabels,
    (checked) => onUpdate("showLabels", checked),
  );
  section.appendChild(labelsRow);

  // Divider
  const divider = document.createElement("div");
  divider.className = "config-divider";
  section.appendChild(divider);

  // Options avec couleurs
  const options = [
    {
      colorKey: "colorCenter",
      checkKey: "showCenter",
      label: i18next.t("draw.config.centerHalf"),
      colorId: "prop-color-center",
      checkId: "prop-center",
    },
    {
      colorKey: "colorThirds",
      checkKey: "showThirds",
      label: i18next.t("draw.config.thirdsRatio"),
      colorId: "prop-color-thirds",
      checkId: "prop-thirds",
    },
    {
      colorKey: "colorQuarters",
      checkKey: "showQuarters",
      label: i18next.t("draw.config.quartersRatio"),
      colorId: "prop-color-quarters",
      checkId: "prop-quarters",
    },
  ];

  options.forEach(({ colorKey, checkKey, label, colorId, checkId }) => {
    const opt = createProportionOption(
      colorId,
      checkId,
      label,
      config[colorKey],
      config[checkKey],
      (color) => onUpdate(colorKey, color),
      (checked) => onUpdate(checkKey, checked),
    );
    section.appendChild(opt);
  });

  return section;
}

/**
 * Crée un header de modal avec titre et bouton fermer
 * @param {string} title - Le titre du modal
 * @param {Function} onClose - Callback de fermeture
 * @returns {HTMLElement} L'élément header
 */
function createModalHeader(title, onClose) {
  const header = document.createElement("div");
  header.id = "measure-config-header";
  header.className = "drawing-config-header";
  header.innerHTML = `
    <h3>${title}</h3>
    <button class="modal-close-btn">&times;</button>
  `;
  header.querySelector("button").addEventListener("click", onClose);
  return header;
}

/**
 * Configure la fermeture d'un popup au clic extérieur
 * @param {HTMLElement} popup - L'élément popup
 * @param {number} [delay=100] - Délai avant activation (évite fermeture immédiate)
 */
function setupPopupCloseOnClickOutside(popup, delay = 100) {
  const closeHandler = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), delay);
}

// ================================================================
// HELPERS MODALS DE CONFIGURATION
// ================================================================

/**
 * Crée le scaffold d'un popup de configuration (popup + header + body)
 * @param {string} id - L'ID du popup
 * @param {string} title - Le titre affiché dans le header
 * @returns {{ popup: HTMLElement, body: HTMLElement } | null} null si le popup existait déjà (toggle off)
 */
function createConfigPopup(id, title) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
    return null;
  }

  const popup = document.createElement("div");
  popup.id = id;
  popup.classList.add("drawing-config-popup");

  const header = createModalHeader(title, () => popup.remove());
  popup.appendChild(header);

  const body = document.createElement("div");
  body.className = "config-body";

  return { popup, body };
}

/**
 * Finalise un popup de configuration (append body, position, close handler, drag)
 * @param {HTMLElement} popup
 * @param {HTMLElement} body
 * @param {Object} [options] - Options optionnelles
 * @param {number} [options.x] - Position X (si absent : centré via CSS existant)
 * @param {number} [options.y] - Position Y
 * @param {number} [options.width=320] - Largeur estimée
 * @param {number} [options.height=500] - Hauteur estimée
 */
function finalizeConfigPopup(popup, body, options = {}) {
  popup.appendChild(body);
  document.body.appendChild(popup);

  if (options.x !== undefined && options.y !== undefined) {
    positionPopupInScreen(popup, options.x, options.y, options.width ?? 320, options.height ?? 500);
  }

  setupPopupCloseOnClickOutside(popup);
  makeMeasureConfigDraggable(popup);
}

/**
 * Crée la section d'aide commune aux modals de mesure
 * @returns {HTMLElement}
 */
function createHelpSection() {
  const section = document.createElement("div");
  section.className = "config-help-section";
  section.innerHTML = `
    <div class="config-help-item"><kbd>Alt</kbd> + ${i18next.t("draw.help.duplicateMeasure")}</div>
    <div class="config-help-item"><kbd>Shift</kbd>+<kbd>Alt</kbd> + ${i18next.t("draw.help.deleteMeasure")}</div>
    <div class="config-help-item"><kbd>Ctrl</kbd> + ${i18next.t("draw.help.changeGraduation")}</div>
  `;
  return section;
}

/**
 * Crée le container compact de sliders standard (lineWidth, graduationSize, labelSize)
 * Utilisé par les modals de config individuelle (measure, calibrate, compass)
 * @param {Object} line - La ligne à configurer (line.config sera muté)
 * @param {string} prefix - Préfixe pour les IDs des sliders
 * @param {Object} values - {lineWidth, graduationSize, labelSize}
 * @returns {HTMLElement}
 */
function createStandardSliders(line, prefix, values) {
  const container = document.createElement("div");
  container.className = "config-sliders-compact";

  container.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      `${prefix}-line-width`,
      { min: 1, max: 10, step: 1, value: values.lineWidth, unit: "px" },
      (val) => {
        line.config.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  container.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      `${prefix}-graduation-size`,
      { min: 0.5, max: 2.5, step: 0.1, value: values.graduationSize, unit: "x" },
      (val) => {
        line.config.graduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  container.appendChild(
    createSliderSection(
      i18next.t("draw.config.labelSize"),
      `${prefix}-label-size`,
      { min: 0.5, max: 3.0, step: 0.1, value: values.labelSize, unit: "x" },
      (val) => {
        line.config.labelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  return container;
}

// ================================================================
// MODALS DE CONFIGURATION
// ================================================================

/**
 * Affiche le modal de configuration de l'outil mesure
 */
function showMeasureConfig() {
  const result = createConfigPopup("measure-config-popup", i18next.t("draw.modals.measureSettings"));
  if (!result) return;
  const { popup, body } = result;

  // Section 1 : Visibilité et couleur
  const section1 = document.createElement("div");
  section1.className = "config-section";

  section1.appendChild(
    createColorRow(
      i18next.t("draw.config.measureColor"),
      "measure-color",
      measureColor,
      (val) => {
        measureColor = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showMeasurements"),
      "measurements-visible",
      measurementsVisible,
      (checked) => {
        measurementsVisible = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showValues"),
      "show-size-labels",
      showMeasureSizeLabels,
      (checked) => {
        showMeasureSizeLabels = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  body.appendChild(section1);

  // Section 2 : Type de graduation
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const section2Label = document.createElement("div");
  section2Label.className = "config-section-label";
  section2Label.textContent = i18next.t("draw.config.graduationType");
  section2.appendChild(section2Label);

  // Référence à la section proportions pour toggle disabled
  let proportionsSection = null;

  const gradButtons = createGraduationTypeButtons(
    measureGraduationType,
    (type) => {
      measureGraduationType = type;
      if (proportionsSection) {
        proportionsSection.classList.toggle("disabled", type !== "proportions");
      }
      redrawDrawingMeasurements();
    },
  );
  section2.appendChild(gradButtons);
  body.appendChild(section2);

  // Section 5 : Options de proportions
  proportionsSection = createProportionsSection(
    measureProportionsConfig,
    (key, val) => {
      measureProportionsConfig[key] = val;
      redrawDrawingMeasurements();
    },
    measureGraduationType !== "proportions",
  );
  body.appendChild(proportionsSection);

  // Container compact pour les sliders de taille
  const slidersContainer2 = document.createElement("div");
  slidersContainer2.className = "config-sliders-compact";

  // Taille des graduations
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "graduation-size",
      {
        min: 0.5,
        max: 2.5,
        step: 0.1,
        value: measureGraduationSize,
        unit: "x",
      },
      (val) => {
        measureGraduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille des valeurs
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.valueSize"),
      "label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: measureLabelSize, unit: "x" },
      (val) => {
        measureLabelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Épaisseur du trait
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "measure-line-width",
      { min: 1, max: 10, step: 1, value: measureState.lineWidth, unit: "px" },
      (val) => {
        measureState.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  body.appendChild(slidersContainer2);

  // Section 6 : Instructions
  body.appendChild(createHelpSection());

  finalizeConfigPopup(popup, body);
}

/**
 * Affiche le panneau de configuration pour une mesure individuelle
 * @param {Object} line - La ligne de mesure à configurer
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showMeasureIndividualConfig(line, x, y) {
  const result = createConfigPopup("measure-individual-config-popup", i18next.t("draw.modals.configureMeasure"));
  if (!result) return;
  const { popup, body } = result;

  // Initialiser la config individuelle si elle n'existe pas
  if (!line.config) {
    line.config = {};
  }

  // Valeurs actuelles (config individuelle ou valeurs globales par défaut)
  const currentGradType = line.config.graduationType ?? measureGraduationType;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentShowLabels = line.config.showSizeLabels ?? showMeasureSizeLabels;
  const currentColor = line.config.color ?? measureColor;
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentLineWidth =
    line.config.lineWidth ?? line.lineWidth ?? measureState.lineWidth;
  const currentPropConfig = line.config.proportionsConfig ?? {
    ...measureProportionsConfig,
  };

  // Couleur
  body.appendChild(
    createColorRow(i18next.t("draw.config.color"), "indiv-color", currentColor, (val) => {
      line.config.color = val;
      redrawDrawingMeasurements();
    }),
  );

  // Afficher la valeur
  const showSection = document.createElement("div");
  showSection.className = "config-section";
  showSection.style.marginTop = "10px";
  showSection.appendChild(
    createToggleRow(
      i18next.t("draw.config.showValue"),
      "indiv-show-labels",
      currentShowLabels,
      (checked) => {
        line.config.showSizeLabels = checked;
        redrawDrawingMeasurements();
      },
    ),
  );
  body.appendChild(showSection);

  // Type de graduation
  const gradSection = document.createElement("div");
  gradSection.className = "config-section";
  const gradLabel = document.createElement("div");
  gradLabel.className = "config-section-label";
  gradLabel.textContent = i18next.t("draw.config.graduationType");
  gradSection.appendChild(gradLabel);

  let proportionsSection = null;

  const gradButtons = createGraduationTypeButtons(currentGradType, (type) => {
    line.config.graduationType = type;
    if (proportionsSection) {
      proportionsSection.classList.toggle("disabled", type !== "proportions");
    }
    redrawDrawingMeasurements();
  });
  gradSection.appendChild(gradButtons);
  body.appendChild(gradSection);

  // Section proportions
  proportionsSection = createProportionsSection(
    currentPropConfig,
    (key, val) => {
      if (!line.config.proportionsConfig) {
        line.config.proportionsConfig = { ...measureProportionsConfig };
      }
      line.config.proportionsConfig[key] = val;
      redrawDrawingMeasurements();
    },
    currentGradType !== "proportions",
  );
  proportionsSection.id = "indiv-proportions-section";
  proportionsSection.style.marginBottom = "20px";
  body.appendChild(proportionsSection);

  // Container compact pour les sliders de taille
  const slidersContainer2 = document.createElement("div");
  slidersContainer2.className = "config-sliders-compact";

  // Taille des graduations
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "indiv-grad-size",
      { min: 0.5, max: 2.5, step: 0.1, value: currentGradSize, unit: "x" },
      (val) => {
        line.config.graduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille de la valeur
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.valueSize"),
      "indiv-label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: currentLabelSize, unit: "x" },
      (val) => {
        line.config.labelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Épaisseur du trait
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "indiv-line-width",
      { min: 1, max: 10, step: 1, value: currentLineWidth, unit: "px" },
      (val) => {
        line.config.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  body.appendChild(slidersContainer2);

  // Bouton réinitialiser
  const resetSection = document.createElement("div");
  resetSection.className = "config-section";
  const resetBtn = document.createElement("button");
  resetBtn.className = "control-btn";
  resetBtn.id = "indiv-reset";
  resetBtn.style.cssText =
    "width: auto; padding: 0 20px 0 20px; margin: 0 auto;";
  resetBtn.innerHTML = `
    <span class="btn-main-line" style="margin-bottom: -5px;">${ICONS.UNDO} ${i18next.t("draw.buttons.reset")}</span>
    <span class="btn-subtext">${i18next.t("draw.buttons.useGlobalValues")}</span>
  `;
  resetBtn.addEventListener("click", () => {
    delete line.config;
    redrawDrawingMeasurements();
    popup.remove();
  });
  resetSection.appendChild(resetBtn);
  body.appendChild(resetSection);

  finalizeConfigPopup(popup, body, { x, y, width: 320, height: 500 });
}

/**
 * Affiche le modal de configuration pour l'unité de calibration
 * @param {Object} line - La ligne de calibration
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showCalibrateIndividualConfig(line, x, y) {
  const result = createConfigPopup("calibrate-individual-config-popup", i18next.t("draw.modals.configureUnit"));
  if (!result) return;
  const { popup, body } = result;

  // Initialiser la config individuelle si elle n'existe pas
  if (!line.config) line.config = {};

  // Valeurs actuelles
  const currentColor = line.config.color ?? "#10b981";
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentShowLabel = line.config.showLabel !== false;
  const currentSubdivisions = line.config.subdivisions ?? 0;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentLineWidth = line.config.lineWidth ?? 3;

  // Section couleur et label
  const section1 = document.createElement("div");
  section1.className = "config-section";
  section1.appendChild(
    createColorRow(i18next.t("draw.config.color"), "calib-color", currentColor, (color) => {
      line.config.color = color;
      redrawDrawingMeasurements();
    }),
  );
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showLabel"),
      "calib-show-label",
      currentShowLabel,
      (checked) => {
        line.config.showLabel = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  // Checkbox afficher le segment de calibration
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showUnit"),
      "calib-show-line",
      measureState.showCalibrateLine,
      (checked) => {
        measureState.showCalibrateLine = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  body.appendChild(section1);

  // Section subdivisions
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const subdivLabel = document.createElement("div");
  subdivLabel.className = "config-section-label";
  subdivLabel.textContent = i18next.t("draw.config.subdivisions");
  section2.appendChild(subdivLabel);
  section2.appendChild(
    createSubdivisionButtons(currentSubdivisions, (subdiv) => {
      line.config.subdivisions = subdiv;
      redrawDrawingMeasurements();
    }),
  );
  body.appendChild(section2);

  body.appendChild(createStandardSliders(line, "calib", {
    lineWidth: currentLineWidth,
    graduationSize: currentGradSize,
    labelSize: currentLabelSize,
  }));

  // Section aide
  body.appendChild(createHelpSection());

  finalizeConfigPopup(popup, body, { x, y, width: 320, height: 400 });
}

/**
 * Affiche le modal de configuration pour une mesure compas individuelle
 * Style identique au modal "Réglages des mesures"
 * @param {Object} line - La mesure compas
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showCompassIndividualConfig(line, x, y) {
  const result = createConfigPopup("compass-individual-config-popup", i18next.t("draw.modals.compassSettings"));
  if (!result) return;
  const { popup, body } = result;

  // Initialiser la config si absente
  if (!line.config) {
    line.config = {
      color: DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR,
      multiplier: 1,
      showLabel: true,
      labelSize: measureLabelSize,
      graduationSize: measureGraduationSize,
      subdivisions: 0,
      lineWidth: 3,
    };
  }

  const currentColor =
    line.config.color || DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR;
  const currentShowLabel = line.config.showLabel !== false;
  const currentSubdivisions = line.config.subdivisions ?? 0;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentLineWidth = line.config.lineWidth ?? 3;

  // Section couleur et label
  const section1 = document.createElement("div");
  section1.className = "config-section";
  section1.appendChild(
    createColorRow(i18next.t("draw.config.color"), "compass-color", currentColor, (color) => {
      line.config.color = color;
      redrawDrawingMeasurements();
    }),
  );
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showLabel"),
      "compass-show-label",
      currentShowLabel,
      (checked) => {
        line.config.showLabel = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );
  body.appendChild(section1);

  // Section subdivisions
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const subdivLabel = document.createElement("div");
  subdivLabel.className = "config-section-label";
  subdivLabel.textContent = i18next.t("draw.config.subdivisions");
  section2.appendChild(subdivLabel);
  section2.appendChild(
    createSubdivisionButtons(currentSubdivisions, (subdiv) => {
      line.config.subdivisions = subdiv;
      redrawDrawingMeasurements();
    }),
  );
  body.appendChild(section2);

  body.appendChild(createStandardSliders(line, "compass", {
    lineWidth: currentLineWidth,
    graduationSize: currentGradSize,
    labelSize: currentLabelSize,
  }));

  body.appendChild(createHelpSection());

  finalizeConfigPopup(popup, body, { x, y, width: 320, height: 400 });
}

function updateShapeConfig(line, updater) {
  if (!line) return;
  if (line.type === "shape-edge" && line.shapeGroup) {
    measurementLines.forEach((entry) => {
      if (entry.type !== "shape-edge" || entry.shapeGroup !== line.shapeGroup) return;
      if (!entry.config) entry.config = {};
      updater(entry.config);
    });
    return;
  }
  if (!line.config) line.config = {};
  updater(line.config);
}

function resetShapeConfig(line) {
  if (!line) return;
  if (line.type === "shape-edge" && line.shapeGroup) {
    measurementLines.forEach((entry) => {
      if (entry.type === "shape-edge" && entry.shapeGroup === line.shapeGroup) {
        delete entry.config;
      }
    });
    return;
  }
  delete line.config;
}

function applyShapeConfigAndRedraw(line, updater) {
  updateShapeConfig(line, updater);
  redrawDrawingMeasurements();
}

function getShapeConfigViewModel(line) {
  if (!line.config) line.config = {};
  const currentColor = line.config.color ?? annotationStyle.color;
  return {
    currentColor,
    currentLineWidth: line.config.lineWidth ?? annotationStyle.size ?? 3,
    supportsFill: shapeHasCapability(line, "supportsFill"),
    supportsArrowHead: line.type === "shape-arrow",
    currentFillEnabled: !!line.config.fillEnabled,
    currentFillColor: line.config.fillColor ?? currentColor,
    currentFillOpacity: Math.round((line.config.fillOpacity ?? 0.2) * 100),
    currentArrowHeadSize: line.config.arrowHeadSize ?? 1.15,
    currentArrowDoubleHead: !!line.config.arrowDoubleHead,
  };
}

const SHAPE_SECTION_STROKE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true">
    <path d="m268-212-56-56q-12-12-12-28.5t12-28.5l423-423q12-12 28.5-12t28.5 12l56 56q12 12 12 28.5T748-635L324-212q-11 11-28 11t-28-11Z"/>
  </svg>
`;

const SHAPE_SECTION_FILL_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true">
    <path d="M477-80q-83 0-156-31.5T194-197q-54-54-85.5-127T77-480q0-83 31.5-156T194-763q54-54 127-85.5T477-880q83 0 156 31.5T760-763q54 54 85.5 127T877-480q0 83-31.5 156T760-197q-54 54-127 85.5T477-80Zm91-93q78-23 135.5-80.5T784-389L568-173ZM171-574l212-212q-77 23-133 79t-79 133Zm-4 176 392-391q-12-3-24-5t-25-4L159-447q2 13 3.5 25t4.5 24Zm57 114 449-450q-8-6-16.5-12T639-757L200-318q5 9 11 17.5t13 16.5Zm91 81 438-439q-5-9-11-17.5T730-676L281-226q8 6 16.5 12t17.5 11Zm129 41 351-351q-2-13-4-25t-5-24L395-171q12 3 24 5t25 4Z"/>
  </svg>
`;

const SHAPE_SECTION_ARROW_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" aria-hidden="true">
    <path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/>
  </svg>
`;

function buildShapeConfigSchema(vm) {
  const schema = [
    {
      key: "appearance",
      titleKey: "draw.config.appearance",
      titleDefault: "Appearance",
      icon: SHAPE_SECTION_STROKE_ICON,
      controls: [
        {
          type: "color",
          id: "shape-color",
          labelKey: "draw.config.strokeColor",
          labelDefault: i18next.t("draw.config.color"),
          value: vm.currentColor,
          set: (line, val) => applyShapeConfigAndRedraw(line, (config) => {
            config.color = val;
          }),
        },
        {
          type: "slider",
          id: "shape-line-width",
          labelKey: "draw.config.lineWidth",
          value: vm.currentLineWidth,
          min: 1,
          max: 10,
          step: 1,
          unit: "px",
          useInlineLabel: true,
          set: (line, val) => applyShapeConfigAndRedraw(line, (config) => {
            config.lineWidth = val;
          }),
        },
      ],
    },
  ];

  if (vm.supportsArrowHead) {
    schema.push({
      key: "arrow",
      titleKey: "draw.config.arrow",
      titleDefault: "Arrow",
      icon: SHAPE_SECTION_ARROW_ICON,
      separatorBefore: true,
      controls: [
        {
          type: "toggle",
          id: "shape-arrow-double-head",
          labelKey: "draw.config.doubleHead",
          labelDefault: "Head on both ends",
          value: vm.currentArrowDoubleHead,
          set: (line, checked) => applyShapeConfigAndRedraw(line, (config) => {
            config.arrowDoubleHead = !!checked;
          }),
        },
        {
          type: "slider",
          id: "shape-arrow-head-size",
          labelKey: "draw.config.headSize",
          labelDefault: "Head size",
          value: vm.currentArrowHeadSize,
          min: 0.6,
          max: 2.4,
          step: 0.1,
          unit: "x",
          useInlineLabel: true,
          set: (line, val) => applyShapeConfigAndRedraw(line, (config) => {
            config.arrowHeadSize = val;
          }),
        },
      ],
    });
  }

  if (vm.supportsFill) {
    schema.push({
      key: "fill",
      titleKey: "draw.config.fill",
      titleDefault: "Fill",
      icon: SHAPE_SECTION_FILL_ICON,
      separatorBefore: true,
      controls: [
        {
          type: "toggle",
          id: "shape-fill-enabled",
          labelKey: "draw.config.fillEnabled",
          value: vm.currentFillEnabled,
          panelId: "fill-controls",
          set: (line, checked) => applyShapeConfigAndRedraw(line, (config) => {
            config.fillEnabled = !!checked;
          }),
        },
        {
          type: "panel",
          id: "fill-controls",
          className: "shape-fill-controls",
          enabled: vm.currentFillEnabled,
          controls: [
            {
              type: "color",
              id: "shape-fill-color",
              labelKey: "draw.config.fillColor",
              value: vm.currentFillColor,
              set: (line, val) => applyShapeConfigAndRedraw(line, (config) => {
                config.fillColor = val;
              }),
            },
            {
              type: "slider",
              id: "shape-fill-opacity",
              labelKey: "draw.config.fillOpacity",
              value: vm.currentFillOpacity,
              min: 5,
              max: 90,
              step: 1,
              unit: "%",
              useInlineLabel: true,
              set: (line, val) => applyShapeConfigAndRedraw(line, (config) => {
                config.fillOpacity = val / 100;
              }),
            },
          ],
        },
      ],
    });
  }

  return schema;
}

function setShapeConfigPanelEnabled(panelEl, enabled) {
  if (!panelEl) return;
  panelEl.style.opacity = enabled ? "1" : "0.45";
  panelEl.style.pointerEvents = enabled ? "auto" : "none";
}

function getShapeConfigLabel(control) {
  return i18next.t(control.labelKey, {
    defaultValue: control.labelDefault || "",
  });
}

function createShapeInlineSliderRow(label, id, config, onChange) {
  const { min, max, step, value, unit } = config;
  const row = document.createElement("div");
  row.className = "shape-config-slider-row";
  row.innerHTML = `
    <div class="config-label">${label}</div>
    <div class="graduation-size-control">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="graduation-size-value" id="${id}-display">${value.toFixed(1)}${unit}</span>
    </div>
  `;
  const slider = row.querySelector("input");
  const display = row.querySelector(`#${id}-display`);
  slider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    display.textContent = val.toFixed(1) + unit;
    onChange(val);
  });
  return row;
}

function renderShapeConfigControl(control, line, panelMap) {
  if (control.type === "color") {
    return createColorRow(
      getShapeConfigLabel(control),
      control.id,
      control.value,
      (val) => control.set(line, val),
    );
  }
  if (control.type === "slider") {
    if (control.useInlineLabel) {
      return createShapeInlineSliderRow(
        getShapeConfigLabel(control),
        control.id,
        {
          min: control.min,
          max: control.max,
          step: control.step,
          value: control.value,
          unit: control.unit,
        },
        (val) => control.set(line, val),
      );
    }
    return createSliderSection(
      getShapeConfigLabel(control),
      control.id,
      {
        min: control.min,
        max: control.max,
        step: control.step,
        value: control.value,
        unit: control.unit,
      },
      (val) => control.set(line, val),
    );
  }
  if (control.type === "toggle") {
    return createToggleRow(
      getShapeConfigLabel(control),
      control.id,
      !!control.value,
      (checked) => {
        control.set(line, checked);
        if (control.panelId && panelMap.has(control.panelId)) {
          setShapeConfigPanelEnabled(panelMap.get(control.panelId), checked);
        }
      },
    );
  }
  if (control.type === "panel") {
    const panel = document.createElement("div");
    panel.className = `config-sliders-compact ${control.className || ""}`.trim();
    panelMap.set(control.id, panel);
    setShapeConfigPanelEnabled(panel, !!control.enabled);
    (control.controls || []).forEach((child) => {
      panel.appendChild(renderShapeConfigControl(child, line, panelMap));
    });
    return panel;
  }
  return null;
}

function renderShapeConfigSection(sectionSpec, line) {
  const section = document.createElement("div");
  section.className = `config-section shape-config-section shape-config-section-${sectionSpec.key || "default"}`;
  const label = document.createElement("div");
  label.className = "config-section-label";
  const titleText = i18next.t(sectionSpec.titleKey, {
    defaultValue: sectionSpec.titleDefault || "",
  });
  if (sectionSpec.icon) {
    const icon = document.createElement("span");
    icon.className = "shape-config-section-icon";
    icon.innerHTML = sectionSpec.icon;
    const text = document.createElement("span");
    text.textContent = titleText;
    label.appendChild(icon);
    label.appendChild(text);
  } else {
    label.textContent = titleText;
  }
  section.appendChild(label);

  const panelMap = new Map();
  (sectionSpec.controls || []).forEach((control) => {
    const controlEl = renderShapeConfigControl(control, line, panelMap);
    if (controlEl) section.appendChild(controlEl);
  });

  return section;
}

function showShapeIndividualConfig(line, x, y) {
  const result = createConfigPopup(
    "shape-individual-config-popup",
    i18next.t("draw.modals.configureShape"),
  );
  if (!result) return;
  const { popup, body } = result;

  const vm = getShapeConfigViewModel(line);
  const schema = buildShapeConfigSchema(vm);
  schema.forEach((sectionSpec, idx) => {
    if (idx > 0 && sectionSpec.separatorBefore) {
      const separator = document.createElement("div");
      separator.className = "shape-config-separator";
      body.appendChild(separator);
    }
    body.appendChild(renderShapeConfigSection(sectionSpec, line));
  });

  finalizeConfigPopup(popup, body, {
    x,
    y,
    width: 320,
    height: vm.supportsFill ? 360 : 300,
  });
}

/**
 * Rend le modal de configuration mesure déplaçable depuis le header ou les bords
 * et s'assure qu'il reste dans les limites de l'écran
 */
function makeMeasureConfigDraggable(popup) {
  const header = popup.querySelector("#measure-config-header, .drawing-config-header");
  if (!header) return;

  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  // Zone de drag : header + bordure de 10px autour du popup
  const BORDER_DRAG_SIZE = 10;

  function startDrag(e) {
    // Vérifier si on clique sur un élément interactif
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select") ||
      e.target.closest("label") ||
      e.target.closest(".proportion-checkbox")
    ) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = popup.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Désactiver la transition pendant le drag
    popup.style.transition = "none";
    popup.style.transform = "none";
    popup.style.left = initialLeft + "px";
    popup.style.top = initialTop + "px";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    e.preventDefault();
  }

  // Drag depuis le header
  header.addEventListener("mousedown", startDrag);
  header.style.cursor = "grab";

  // Drag depuis les bords du popup
  popup.addEventListener("mousedown", (e) => {
    const rect = popup.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Vérifier si on est sur le bord (dans les 10px du bord)
    const isOnBorder =
      x < BORDER_DRAG_SIZE ||
      x > rect.width - BORDER_DRAG_SIZE ||
      y < BORDER_DRAG_SIZE ||
      y > rect.height - BORDER_DRAG_SIZE;

    if (isOnBorder) {
      startDrag(e);
    }
  });

  function handleMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Limiter aux bords de l'écran
    const rect = popup.getBoundingClientRect();
    const margin = 20;

    // Ne pas sortir à gauche/droite
    if (newLeft < margin) newLeft = margin;
    if (newLeft + rect.width > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
    }

    // Ne pas sortir en haut/bas
    if (newTop < margin) newTop = margin;
    if (newTop + rect.height > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
    }

    popup.style.left = newLeft + "px";
    popup.style.top = newTop + "px";
  }

  function handleMouseUp() {
    isDragging = false;
    header.style.cursor = "grab";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
}

/**
 * Rend le container des infos de mesure (unité + total) déplaçable
 */
function setupDrawingInfosContainerDrag() {
  const container = document.getElementById("drawing-infos-container");
  if (!container) return;

  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;
  let positionInitialized = false;

  // Initialiser la position en pixels avec position: fixed
  const initializePosition = () => {
    if (positionInitialized) return true;
    const rect = container.getBoundingClientRect();
    // Vérifier que le container est visible et a une position valide
    if (rect.width > 0 && rect.height > 0 && rect.left > 0) {
      // Passer en position fixed pour que left/top correspondent aux coordonnées viewport
      container.style.position = "fixed";
      container.style.left = rect.left + "px";
      container.style.top = rect.top + "px";
      container.style.right = "auto";
      positionInitialized = true;
      return true;
    }
    return false;
  };

  container.addEventListener("mousedown", (e) => {
    // Ne pas déclencher le drag si on clique sur le bouton reset
    if (e.target.closest("button")) return;

    // Initialiser la position si pas encore fait - si échec, on ne drag pas
    if (!initializePosition()) return;

    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = container.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    container.style.cursor = "grabbing";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  function handleMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Limiter aux bords de l'écran
    const rect = container.getBoundingClientRect();
    const margin = 10;

    if (newLeft < margin) newLeft = margin;
    if (newLeft + rect.width > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
    }
    if (newTop < margin) newTop = margin;
    if (newTop + rect.height > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
    }

    container.style.left = newLeft + "px";
    container.style.top = newTop + "px";
  }

  function handleMouseUp() {
    isDragging = false;
    container.style.cursor = "grab";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
}

/**
 * Positionne un popup près des coordonnées données en s'assurant qu'il reste dans l'écran
 */
function positionPopupInScreen(
  popup,
  x,
  y,
  preferredWidth = 320,
  preferredHeight = 450,
) {
  const margin = 20;

  // Rendre visible temporairement pour mesurer la vraie taille
  popup.style.visibility = "hidden";
  popup.style.display = "block";
  popup.style.left = "0px";
  popup.style.top = "0px";
  popup.style.transform = "none";

  // Forcer le recalcul du layout
  const actualRect = popup.getBoundingClientRect();
  const actualWidth = actualRect.width || preferredWidth;
  const actualHeight = actualRect.height || preferredHeight;

  // Calculer la position idéale
  let left = x + 10;
  let top = y - 50;

  // Ajuster si sort à droite
  if (left + actualWidth > window.innerWidth - margin) {
    left = x - actualWidth - 10;
  }

  // Ajuster si sort à gauche
  if (left < margin) {
    left = margin;
  }

  // Ajuster si sort en bas
  if (top + actualHeight > window.innerHeight - margin) {
    top = window.innerHeight - actualHeight - margin;
  }

  // Ajuster si sort en haut
  if (top < margin) {
    top = margin;
  }

  // Appliquer la position finale et rendre visible
  popup.style.left = left + "px";
  popup.style.top = top + "px";
  popup.style.visibility = "visible";
}


/**
 * Affiche le menu de configuration du stabilisateur
 */
/**
 * Ajoute les contrôles du stabilisateur à un menu (factorisé)
 * @param {HTMLElement} menu - Le menu contextuel
 * @param {boolean} showTitle - Afficher le titre de section
 */
function addStabilizerControls(menu, showTitle = true) {
  if (showTitle) {
    addMenuTitle(menu, i18next.t("draw.menus.stabilizer"), ICONS.GESTURE);
  }

  // Toggle lissage (moyenne pondérée)
  addMenuToggleOption(menu, {
    id: "stabilizer-enable-" + Date.now(),
    label: i18next.t("draw.menus.enable"),
    checked: stabilizerEnabled,
    onChange: (checked) => {
      stabilizerEnabled = checked;
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.smoothing"),
    min: 0,
    max: 100,
    value: Math.round(stabilizerStrength * 100),
    unit: "%",
    onChange: (value) => {
      stabilizerStrength = value / 100;
    },
  });
}

/**
 * Ajoute les contrôles de la table lumineuse à un menu (factorisé)
 * @param {HTMLElement} menu - Le menu contextuel
 * @param {string} context - "drawing" ou "zoom"
 * @param {boolean} showTitle - Afficher le titre de section
 */
function addLightboxControls(menu, context = "drawing", showTitle = true) {
  if (showTitle) {
    addMenuTitle(menu, i18next.t("draw.menus.lightbox"), ICONS.LIGHT_TABLE_ON);
  }

  const updateLightbox =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;

  addMenuToggleOption(menu, {
    id: "lightbox-enable-" + Date.now(),
    label: i18next.t("draw.menus.enable"),
    checked: lightboxEnabled,
    onChange: (checked) => {
      lightboxEnabled = checked;
      updateLightbox();
      updateLightboxButtonState(context);
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.opacity"),
    min: 10,
    max: 100,
    value: Math.round(lightboxOpacity * 100),
    unit: "%",
    onChange: (value) => {
      lightboxOpacity = value / 100;
      updateLightbox();
    },
  });
}

/**
 * Affiche le menu contextuel principal du canvas de dessin
 */
function showCanvasContextMenu(x, y, context = "drawing") {
  // Fermer si déjà ouvert
  const existing = document.getElementById("canvas-context-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("canvas-context-menu", x, y);

  // Section Taille du pinceau
  addMenuTitle(menu, i18next.t("draw.menus.brushSize"), ICONS.PENCIL);
  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.size"),
    min: 1,
    max: 50,
    value: annotationStyle.size,
    unit: " px",
    onChange: (value) => {
      annotationStyle.size = value;
      // Mettre à jour l'input dans la toolbar si présent
      const sizeInput = document.getElementById("brush-size-input");
      if (sizeInput) sizeInput.value = value;
      // Mettre à jour le curseur
      updateDrawingCursor();
    },
  });

  // Séparateur
  addMenuSeparator(menu);

  // Section Stabilisateur
  addStabilizerControls(menu, true);

  // Séparateur
  addMenuSeparator(menu);

  // Section Table lumineuse
  addLightboxControls(menu, context, true);

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

function showRectangleToolMenu(x, y) {
  const existing = document.getElementById("rectangle-tool-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("rectangle-tool-menu", x, y);
  menu.classList.add("menu-md");

  addMenuToggleOption(menu, {
    id: "rectangle-edit-mode-" + Date.now(),
    label: i18next.t("draw.menus.shapeEditMode", {
      defaultValue: "Enable shape editing",
    }),
    labelClass: "context-menu-label-normal",
    checked: rectangleEditMode,
    onChange: (checked) => {
      rectangleEditMode = !!checked;
      saveRectangleEditMode();
    },
  });

  addMenuToggleOption(menu, {
    id: "shape-safe-select-mode-" + Date.now(),
    label: i18next.t("draw.menus.shapeSafeSelectMode", {
      defaultValue: "Click to select first",
    }),
    labelClass: "context-menu-label-normal",
    checked: shapeSafeSelectMode,
    onChange: (checked) => {
      shapeSafeSelectMode = !!checked;
      saveShapeSafeSelectMode();
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

function showEraserToolMenu(x, y) {
  const existing = document.getElementById("eraser-tool-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("eraser-tool-menu", x, y);
  menu.classList.add("menu-md");

  addMenuToggleOption(menu, {
    id: "eraser-shape-mode-vector-" + Date.now(),
    label: i18next.t("draw.menus.eraserShapeModeVector", {
      defaultValue: "Erase shapes at once",
    }),
    labelClass: "context-menu-label-normal",
    checked: eraserShapeMode === "keep-vector",
    onChange: (checked) => {
      eraserShapeMode = checked ? "keep-vector" : "partial-raster";
      saveEraserShapeMode();
      menu.remove();
    },
  });

  addMenuToggleOption(menu, {
    id: "eraser-shape-mode-classic-" + Date.now(),
    label: i18next.t("draw.menus.eraserShapeModeClassic", {
      defaultValue:
        "Classic (if a shape is erased it is no longer editable as vector)",
    }),
    labelClass: "context-menu-label-normal",
    checked: eraserShapeMode !== "keep-vector",
    onChange: (checked) => {
      eraserShapeMode = checked ? "partial-raster" : "keep-vector";
      saveEraserShapeMode();
      menu.remove();
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

function showStabilizerMenu(x, y) {
  // Fermer si déjà ouvert
  const existing = document.getElementById("stabilizer-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("stabilizer-menu", x, y);
  addMenuTitle(menu, i18next.t("draw.menus.strokeStabilizer"), ICONS.GESTURE);

  addMenuToggleOption(menu, {
    id: "stabilizer-enable",
    label: i18next.t("draw.menus.enableStabilizer"),
    checked: stabilizerEnabled,
    onChange: (checked) => {
      stabilizerEnabled = checked;
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.smoothing"),
    min: 0,
    max: 100,
    value: Math.round(stabilizerStrength * 100),
    unit: "%",
    onChange: (value) => {
      stabilizerStrength = value / 100;
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}


// ================================================================
// MODULE: tool-handlers.js
// ================================================================

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
        ? i18next.t("drawing.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
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



// ================================================================
// MODULE: lightbox-export.js
// ================================================================

/**
 * Met à jour l'icône du bouton table lumineuse
 * Affiche LIGHT_TABLE_OFF quand activé, LIGHT_TABLE_ON quand désactivé
 */
function updateDrawingLightboxIcon() {
  const btn = document.getElementById("drawing-lightbox-btn");
  if (!btn) return;

  btn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;
}

/**
 * Met à jour une table lumineuse (fonction commune)
 * @param {HTMLCanvasElement} canvas - Le canvas de la lightbox
 * @param {CanvasRenderingContext2D} ctx - Le contexte du canvas
 * @param {string} showMethod - "class" pour classList, "style" pour style.display
 */
function updateLightboxCanvas(canvas, ctx, showMethod = "class") {
  if (!canvas || !ctx) return;

  clearCanvas(ctx, canvas);

  if (lightboxEnabled) {
    if (showMethod === "class") {
      canvas.classList.remove("hidden");
    } else {
      canvas.style.display = "block";
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${lightboxOpacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    if (showMethod === "class") {
      canvas.classList.add("hidden");
    } else {
      canvas.style.display = "none";
    }
  }
}

/**
 * Met à jour la table lumineuse en mode overlay
 */
function updateDrawingLightbox() {
  updateLightboxCanvas(drawingLightboxCanvas, drawingLightboxCtx, "class");
}

/**
 * Met à jour l'icône et l'état du bouton lightbox selon le contexte
 * @param {string} context - "drawing" ou "zoom"
 */
function updateLightboxButtonState(context) {
  if (context === "drawing") {
    updateDrawingLightboxIcon();
    const btn = document.getElementById("drawing-lightbox-btn");
    if (btn) btn.classList.toggle("active", lightboxEnabled);
  } else {
    const zoomToolbar = document.getElementById("zoom-drawing-toolbar");
    if (zoomToolbar) {
      const btns = zoomToolbar.querySelectorAll(".control-btn-small");
      btns.forEach((btn) => {
        if (
          btn.innerHTML.includes("lightTable") ||
          btn.getAttribute("data-action") === "lightbox"
        ) {
          btn.innerHTML = lightboxEnabled
            ? ICONS.LIGHT_TABLE_OFF
            : ICONS.LIGHT_TABLE_ON;
          btn.classList.toggle("active", lightboxEnabled);
        }
      });
    }
  }
}

/**
 * Affiche le menu de la table lumineuse pour le mode overlay
 */
function showLightboxMenu(x, y, context = "drawing") {
  const menu = createContextMenu("lightbox-menu", x, y);
  addMenuTitle(menu, i18next.t("draw.menus.lightbox"), ICONS.LIGHT_TABLE_ON);

  // Détermine les fonctions selon le contexte
  const updateLightbox =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;

  addMenuToggleOption(menu, {
    id: "lightbox-enable-cb",
    label: i18next.t("draw.menus.enable"),
    checked: lightboxEnabled,
    onChange: (checked) => {
      lightboxEnabled = checked;
      updateLightbox();
      updateLightboxButtonState(context);
      menu.remove();
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.opacity"),
    min: 10,
    max: 100,
    value: Math.round(lightboxOpacity * 100),
    unit: "%",
    onChange: (value) => {
      lightboxOpacity = value / 100;
      updateLightbox();
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

// Alias pour compatibilité
function showDrawingLightboxMenu(x, y) {
  showLightboxMenu(x, y, "drawing");
}

/**
 * Affiche les options d'export (unifié pour drawing et zoom)
 * @param {string} context - "drawing" ou "zoom"
 */
function showExportModal(context = "drawing") {
  // Supprimer l'ancien modal s'il existe
  const existingModal = document.getElementById("export-options-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "export-options-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-content export-modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${ICONS.EXPORT} ${i18next.t("draw.modals.exportTitle")}</h3>
        <button type="button" class="modal-close-btn" id="cancel-export">×</button>
      </div>
      <div id="export-instructions" class="export-instructions"> ${i18next.t("draw.modals.exportQuestion")}</div>
      <div class="export-options-list">
        <button class="export-option" data-mode="full">
          <span class="export-option-title">${i18next.t("draw.modals.exportFull")}</span>
        </button>

        <button class="export-option" data-mode="transparent">
          <span class="export-option-title">${i18next.t("draw.modals.exportTransparent")}</span>
        </button>

        <button class="export-option" data-mode="white">
          <span class="export-option-title">${i18next.t("draw.modals.exportWhite")}</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Gestionnaires d'événements
  modal.querySelectorAll(".export-option").forEach((btn) => {
    btn.onclick = () => {
      performExport(btn.dataset.mode, context);
      modal.remove();
    };
  });

  modal.querySelector("#cancel-export").onclick = () => modal.remove();
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  // Gestion de la touche Échap - ferme uniquement ce modal
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      modal.remove();
      document.removeEventListener("keydown", escapeHandler, true);
    }
  };
  document.addEventListener("keydown", escapeHandler, true);
}

// Alias pour compatibilité
function showDrawingExportOptions() {
  showExportModal("drawing");
}

/**
 * Exporte le dessin (unifié pour drawing et zoom)
 * @param {string} mode - "full", "transparent" ou "white"
 * @param {string} context - "drawing" ou "zoom"
 */
function performExport(mode = "full", context = "drawing") {
  // Sélectionner les bonnes ressources selon le contexte
  let imageElement, mainCanvas, measuresCanvas, canvasWidth, canvasHeight;

  if (context === "zoom") {
    if (!zoomTargetImage || !zoomDrawingCanvas) return;
    imageElement = zoomTargetImage;
    mainCanvas = zoomDrawingCanvas;
    measuresCanvas = zoomDrawingMeasures;
    canvasWidth = zoomDrawingCanvas.width;
    canvasHeight = zoomDrawingCanvas.height;
  } else {
    if (!targetImageElement || !drawingCanvas) return;
    imageElement = targetImageElement;
    mainCanvas = drawingCanvas;
    measuresCanvas = drawingMeasures;
    canvasWidth = targetImageElement.naturalWidth;
    canvasHeight = targetImageElement.naturalHeight;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvasWidth;
  exportCanvas.height = canvasHeight;
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });

  switch (mode) {
    case "full":
      // Image + annotations
      if (context === "zoom") {
        exportCtx.drawImage(imageElement, 0, 0, canvasWidth, canvasHeight);
      } else {
        exportCtx.drawImage(imageElement, 0, 0);
      }
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;

    case "transparent":
      // Juste les annotations
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;

    case "white":
      // Annotations sur fond blanc
      exportCtx.fillStyle = "white";
      exportCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;
  }

  // Télécharger
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  link.download = `drawing_${mode}_${timestamp}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

// Alias pour compatibilité (ancien nom)
function exportDrawing(mode = "full") {
  performExport(mode, "drawing");
}


// ================================================================
// MODULE: zoom-mode.js
// ================================================================

// ================================================================
// ZOOM OVERLAY DRAWING MODE
// ================================================================
// Mode dessin dans le zoom-overlay de l'écran de review

let isZoomDrawingModeActive = false;
let zoomDrawingOverlay = null;
let zoomDrawingCanvas = null;
let zoomDrawingMeasures = null;
let zoomDrawingPreview = null;
let zoomDrawingLightbox = null;
let zoomDrawingCtx = null;
let zoomDrawingMeasuresCtx = null;
let zoomDrawingPreviewCtx = null;
let zoomDrawingLightboxCtx = null;
let zoomDrawingCursorHideHandler = null;
let zoomTargetImage = null;
let zoomCurrentImageSrc = null;
let zoomDrawingToolbar = null;

// Cache pour la persistance des dessins dans le zoom (séparé du cache principal)
const zoomDrawingStateCache = new Map();

function normalizeImageSrcKey(src) {
  if (!src || typeof src !== "string") return "";
  let normalized = src.trim();
  try {
    normalized = decodeURI(normalized);
  } catch (_) {}
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/^file:\/+/, "file:///");
  return normalized.toLowerCase();
}

function getImageSrcCandidates(imageOrSrc) {
  if (!imageOrSrc) return [];

  if (typeof imageOrSrc === "string") {
    const one = imageOrSrc.trim();
    const out = [one];
    try {
      const decoded = decodeURI(one);
      if (decoded && decoded !== one) out.push(decoded);
    } catch (_) {}
    return [...new Set(out)];
  }

  const rawPath = String(imageOrSrc.filePath || "").trim();
  if (!rawPath) return [];

  const normalizedPath = rawPath.replace(/\\/g, "/");
  const encodedPath = encodeURI(normalizedPath);
  const out = [
    `file:///${rawPath}`,
    `file:///${normalizedPath}`,
    `file:///${encodedPath}`,
  ];

  return [...new Set(out)];
}

function cacheHasImageSrc(cache, candidates) {
  if (!cache || !candidates || candidates.length === 0) return false;

  for (const candidate of candidates) {
    if (cache.has(candidate)) return true;
  }

  const normalizedCandidates = new Set(
    candidates.map((candidate) => normalizeImageSrcKey(candidate)),
  );

  for (const key of cache.keys()) {
    if (normalizedCandidates.has(normalizeImageSrcKey(key))) {
      return true;
    }
  }

  return false;
}

function hasSavedDrawingForImage(imageOrSrc) {
  const candidates = getImageSrcCandidates(imageOrSrc);
  if (candidates.length === 0) return false;

  return (
    cacheHasImageSrc(drawingStateCache, candidates) ||
    cacheHasImageSrc(zoomDrawingStateCache, candidates)
  );
}

if (typeof window !== "undefined") {
  window.hasSavedDrawingForImage = hasSavedDrawingForImage;
}

/**
 * Ouvre le mode dessin dans le zoom-overlay
 * @param {HTMLElement} overlay - L'élément zoom-overlay
 * @param {Object} image - L'objet image Eagle avec filePath et id
 */
async function openZoomDrawingMode(overlay, image) {
  if (!overlay || !image) return;

  // Vérifier si déjà actif
  if (isZoomDrawingModeActive) {
    closeZoomDrawingMode();
    return;
  }

  const imgElement = overlay.querySelector("img");
  if (!imgElement) {
    debugLog("Zoom drawing: pas d'image trouvée");
    return;
  }

  zoomTargetImage = imgElement;
  // Utiliser imgElement.src (URL file:///) pour être cohérent avec le mode principal
  zoomCurrentImageSrc = imgElement.src;

  // Calculer les dimensions avec le helper partagé
  const { displayWidth, displayHeight, naturalWidth, naturalHeight } =
    calculateCanvasDimensions(imgElement);

  const drawingWrapper = document.createElement("div");
  drawingWrapper.id = "zoom-drawing-wrapper";
  drawingWrapper.className = "zoom-drawing-wrapper";
  drawingWrapper.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${displayWidth}px;
    height: ${displayHeight}px;
    pointer-events: none;
  `;

  // Créer les canvas - CSS doit avoir le même ratio d'aspect que les dimensions internes
  const canvasStyle = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${displayWidth}px;
    height: ${displayHeight}px;
  `;

  // Canvas table lumineuse
  zoomDrawingLightbox = document.createElement("canvas");
  zoomDrawingLightbox.id = "zoom-drawing-lightbox";
  zoomDrawingLightbox.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas mesures
  zoomDrawingMeasures = document.createElement("canvas");
  zoomDrawingMeasures.id = "zoom-drawing-measures";
  zoomDrawingMeasures.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas principal
  zoomDrawingCanvas = document.createElement("canvas");
  zoomDrawingCanvas.id = "zoom-drawing-canvas";
  zoomDrawingCanvas.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas preview (interactions)
  zoomDrawingPreview = document.createElement("canvas");
  zoomDrawingPreview.id = "zoom-drawing-preview";
  zoomDrawingPreview.style.cssText =
    canvasStyle + "pointer-events: auto; cursor: crosshair;";

  // Ajouter les canvas au wrapper
  drawingWrapper.appendChild(zoomDrawingLightbox);
  drawingWrapper.appendChild(zoomDrawingCanvas);
  drawingWrapper.appendChild(zoomDrawingMeasures);
  drawingWrapper.appendChild(zoomDrawingPreview);

  // Insérer le wrapper dans l'overlay
  overlay.insertBefore(drawingWrapper, overlay.querySelector(".zoom-toolbar"));
  zoomDrawingOverlay = drawingWrapper;

  // Réinitialiser le cache du conteneur pour forcer l'utilisation du nouveau conteneur
  ZoomManager._resetContainerCache();

  // Définir les dimensions des canvas (utilise naturalWidth/naturalHeight déjà déclarés plus haut)
  [
    zoomDrawingLightbox,
    zoomDrawingMeasures,
    zoomDrawingCanvas,
    zoomDrawingPreview,
  ].forEach((canvas) => {
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
  });

  // Initialiser les contextes
  zoomDrawingCtx = zoomDrawingCanvas.getContext("2d", { willReadFrequently: true });
  zoomDrawingMeasuresCtx = zoomDrawingMeasures.getContext("2d", { willReadFrequently: true });
  zoomDrawingPreviewCtx = zoomDrawingPreview.getContext("2d", { willReadFrequently: true });
  zoomDrawingLightboxCtx = zoomDrawingLightbox.getContext("2d", { willReadFrequently: true });

  // Configurer le DrawingManager pour le mode zoom
  // Synchroniser explicitement les éléments zoom avec le DrawingManager
  drawingManager.zoom.canvas = zoomDrawingCanvas;
  drawingManager.zoom.ctx = zoomDrawingCtx;
  drawingManager.zoom.preview = zoomDrawingPreview;
  drawingManager.zoom.previewCtx = zoomDrawingPreviewCtx;
  drawingManager.zoom.measures = zoomDrawingMeasures;
  drawingManager.zoom.measuresCtx = zoomDrawingMeasuresCtx;
  drawingManager.zoom.lightbox = zoomDrawingLightbox;
  drawingManager.zoom.lightboxCtx = zoomDrawingLightboxCtx;
  drawingManager.zoom.targetImage = overlay.querySelector("img");
  drawingManager.setContext('zoom');

  // Restaurer l'état sauvegardé si disponible
  // Priorité : 1) cache zoom, 2) cache du mode principal (même image)
  let savedState = zoomDrawingStateCache.get(zoomCurrentImageSrc);
  let stateSource = "zoom";

  if (!savedState) {
    // Essayer de récupérer l'état du mode dessin principal
    savedState = drawingStateCache.get(zoomCurrentImageSrc);
    stateSource = "main";
  }

  if (savedState) {
    debugLog(
      `Zoom drawing: restauration de l'état depuis le cache ${stateSource}`,
    );
    try {
      await restoreDrawingState(savedState, zoomDrawingCtx, zoomDrawingMeasuresCtx);
    } catch (e) {
      console.error("Zoom drawing state restoration failed:", e);
    }
  } else {
    initFreshDrawingState();
    // Sauvegarder l'état vide initial pour permettre undo du premier trait
    saveDrawingHistory();
  }

  // Créer la toolbar de dessin pour le zoom
  createZoomDrawingToolbar(overlay);

  // Configurer les événements de dessin
  setupZoomDrawingEvents();

  // Écouteur global pour mouseup (pour arrêter le dessin même hors du canvas)
  document.addEventListener("mouseup", handleGlobalMouseUp);
  document.addEventListener("pointerup", handleGlobalMouseUp);

  // Créer le curseur personnalisé pour prévisualiser la taille du pinceau
  createDrawingCursor();

  // Ajouter l'indicateur visuel
  overlay.classList.add("zoom-drawing-active");

  isZoomDrawingModeActive = true;
  finalizeDrawingModeActivation("pencil", "zoom");

  // La fermeture du zoom en cliquant sur l'image est gérée dans plugin.js
  // en vérifiant la classe 'zoom-drawing-active'

  debugLog("Zoom drawing mode: activé");
}

/**
 * Ferme le mode dessin du zoom
 */
function closeZoomDrawingMode() {
  if (!isZoomDrawingModeActive) return;

  // Sauvegarder l'état
  if (
    saveDrawingState(
      zoomDrawingStateCache,
      zoomCurrentImageSrc,
      zoomDrawingCanvas,
      zoomDrawingMeasures,
      zoomDrawingCtx,
      zoomDrawingMeasuresCtx,
    )
  ) {
    debugLog("Zoom drawing: état sauvegardé");
  }

  // Supprimer les éléments
  if (zoomDrawingOverlay) {
    zoomDrawingOverlay.remove();
  }
  if (zoomDrawingToolbar) {
    zoomDrawingToolbar.remove();
  }

  // Supprimer le curseur personnalisé
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.remove();

  // Retirer l'indicateur
  const overlay = document.getElementById("zoom-overlay");
  if (overlay) {
    overlay.classList.remove("zoom-drawing-active");
    // Restaurer le comportement de clic sur l'image (permettre la fermeture du zoom)
    const img = overlay.querySelector("img");
    if (img && window.closeZoom) {
      img.onclick = window.closeZoom;
    }
    // Restaurer la toolbar normale du zoom
    const normalToolbar = overlay.querySelector(".zoom-toolbar");
    if (normalToolbar) {
      normalToolbar.style.display = "";
    }
  }

  // Supprimer les écouteurs clavier
  document.removeEventListener("keydown", handleZoomDrawingKeydown);
  document.removeEventListener("keyup", handleZoomDrawingKeyup);

  // Supprimer l'écouteur global mouseup
  document.removeEventListener("mouseup", handleGlobalMouseUp);
  document.removeEventListener("pointerup", handleGlobalMouseUp);

  // Supprimer l'écouteur de curseur
  if (zoomDrawingOverlay && zoomDrawingCursorHideHandler) {
    zoomDrawingOverlay.removeEventListener(
      "mouseout",
      zoomDrawingCursorHideHandler,
    );
    zoomDrawingCursorHideHandler = null;
  }

  // Fermer tous les menus/modals de dessin ouverts
  closeAllDrawingMenus();

  // Réinitialiser keysState
  resetModifierKeys();

  // Réinitialiser le zoom/pan
  resetCanvasZoomPan();

  // Supprimer les scrollbars
  ZoomManager._removeScrollbars();

  // Revenir au contexte normal
  drawingManager.setContext('normal');

  // Réinitialiser les variables
  isZoomDrawingModeActive = false;
  zoomDrawingOverlay = null;
  zoomDrawingCanvas = null;
  zoomDrawingMeasures = null;
  zoomDrawingPreview = null;
  zoomDrawingLightbox = null;
  zoomTargetImage = null;

  // Réinitialiser le cache du conteneur dans le ZoomManager
  ZoomManager._resetContainerCache();

  debugLog("Zoom drawing mode: désactivé");
}

// Helper pour créer un séparateur
const SEP = { type: "separator" };

/**
 * Crée la toolbar de dessin pour le zoom-overlay
 * Utilise les helpers partagés avec populateDrawingToolbar()
 */
function createZoomDrawingToolbar(overlay) {
  // Supprimer toolbar existante
  const existing = document.getElementById("zoom-drawing-toolbar");
  if (existing) existing.remove();

  // Cacher la toolbar normale du zoom (on la remplace)
  const normalToolbar = overlay.querySelector(".zoom-toolbar");
  if (normalToolbar) {
    normalToolbar.style.display = "none";
  }

  const toolbar = document.createElement("div");
  toolbar.id = "zoom-drawing-toolbar";
  toolbar.className = "zoom-drawing-toolbar horizontal";
  toolbar.onclick = (e) => e.stopPropagation();

  // Clic droit pour basculer entre horizontal et vertical
  toolbar.oncontextmenu = (e) => {
    // Ne pas interférer avec les clics droits sur les boutons
    if (
      e.target.closest(".control-btn-small") ||
      e.target.closest(".zoom-tool-btn")
    )
      return;

    e.preventDefault();
    const isHorizontal = toolbar.classList.contains("horizontal");
    toolbar.classList.toggle("horizontal", !isHorizontal);

    // Réajuster la position si nécessaire
    requestAnimationFrame(() => {
      const rect = toolbar.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        toolbar.style.left =
          Math.max(10, window.innerWidth - rect.width - 10) + "px";
      }
      if (rect.bottom > window.innerHeight - 10) {
        toolbar.style.top =
          Math.max(10, window.innerHeight - rect.height - 10) + "px";
      }
    });
  };

  // Créer les outils avec les helpers partagés
  const toolElements = createAllToolButtons({
    btnClass: "control-btn-small zoom-tool-btn",
    toolbar: toolbar,
    toolSelector: ".zoom-tool-btn",
  });

  // Inputs
  const { colorInput, sizeInput } = createStyleInputs({
    colorId: "zoom-drawing-color",
    sizeId: "zoom-drawing-size",
    colorClass: "zoom-color-input",
    sizeClass: "zoom-size-input",
  });

  // Boutons spéciaux
  const lightboxBtn = createLightboxButton({
    btnClass: "control-btn-small",
    context: "zoom",
  });
  const exportBtn = createExportButton({
    btnClass: "control-btn-small",
    context: "zoom",
  });
  const closeBtn = createCloseButton({
    btnClass: "control-btn-small btn-danger-hover",
    onClose: () => closeZoomDrawingMode(),
  });

  // Bouton clear pour le zoom
  const clearBtn = document.createElement("button");
  clearBtn.className = "control-btn-small";
  clearBtn.setAttribute("data-tool", "clear");
  clearBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearDrawing"));
  clearBtn.innerHTML = ICONS.CLEAR;
  clearBtn.onclick = () => {
    clearDrawingCanvas();
  };

  // Bouton clear-measurements pour le zoom
  const clearMeasurementsBtn = document.createElement("button");
  clearMeasurementsBtn.className = "control-btn-small";
  clearMeasurementsBtn.setAttribute("data-tool", "clear-measurements");
  clearMeasurementsBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearMeasurements"));
  clearMeasurementsBtn.innerHTML = ICONS.TRASH_RAYURES;
  clearMeasurementsBtn.onclick = () => {
    clearDrawingMeasurements();
    // Mettre à jour l'état des boutons après suppression
    updateDrawingButtonStates("zoom");
  };

  // ============================================================
  // LAYOUT DE LA ZOOM-DRAWING-TOOLBAR
  // SEP pour ajouter un séparateur visuel
  // ============================================================
  const zoomToolbarLayout = [
    toolElements.pencil,
    toolElements.eraser,
    toolElements.laser,
    toolElements.line,
    toolElements.arrow,
    toolElements.rectangle,
    toolElements.circle,
    clearBtn,
    SEP,
    toolElements.measure,
    toolElements.calibrate,
    toolElements.protractor,
    clearMeasurementsBtn,
    SEP,
    colorInput,
    sizeInput,
    SEP,
    lightboxBtn,
    exportBtn,
    ...(CONFIG.enableZoomInDrawingMode ? [createZoomIndicator(), SEP] : []),
    closeBtn,
  ];

  zoomToolbarLayout.forEach((item) => {
    if (item === SEP) {
      const sep = document.createElement("div");
      sep.className = "zoom-toolbar-separator";
      toolbar.appendChild(sep);
    } else if (item) {
      toolbar.appendChild(item);
    }
  });

  overlay.appendChild(toolbar);
  zoomDrawingToolbar = toolbar;

  // Initialiser l'état des boutons
  updateDrawingButtonStates("zoom");
}

/**
 * Met à jour la table lumineuse en mode zoom
 */
function updateZoomDrawingLightbox() {
  updateLightboxCanvas(zoomDrawingLightbox, zoomDrawingLightboxCtx, "style");
}

/**
 * Configure les événements de dessin pour le mode zoom
 */
function setupZoomDrawingEvents() {
  if (!zoomDrawingPreview) return;

  // Utiliser le helper partagé pour les événements pointer/mouse/wheel/contextmenu
  setupCanvasInputEvents(zoomDrawingPreview, zoomDrawingCanvas, zoomDrawingCtx, "zoom");

  // Détecter quand la souris quitte complètement l'overlay pour cacher le curseur
  const cursorHideHandler = (e) => {
    // Si on quitte le canvas preview pour aller ailleurs (pas vers un enfant)
    if (
      e.target === zoomDrawingPreview &&
      !zoomDrawingPreview.contains(e.relatedTarget)
    ) {
      hideDrawingCursor();
      zoomDrawingPreview.style.cursor = "default";
    }
  };
  zoomDrawingOverlay.addEventListener("mouseout", cursorHideHandler);

  // Stocker le handler pour pouvoir le nettoyer plus tard
  zoomDrawingCursorHideHandler = cursorHideHandler;

  // Ajouter les raccourcis clavier
  document.addEventListener("keydown", handleZoomDrawingKeydown);
  document.addEventListener("keyup", handleZoomDrawingKeyup);
}

/**
 * Met à jour l'UI de la toolbar zoom pour l'outil sélectionné
 */
function updateZoomToolbarSelection(toolName) {
  currentTool = toolName;
  if (zoomDrawingToolbar) {
    zoomDrawingToolbar.querySelectorAll(".zoom-tool-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-tool") === toolName,
      );
    });
  }
  updateDrawingCursor();
}

/**
 * Gère les raccourcis clavier du mode dessin zoom
 */
function handleZoomDrawingKeydown(e) {
  if (!isZoomDrawingModeActive) return;

  // Touches modificateurs
  handleModifierKeyDown(e);

  // Delete/Backspace pour tout effacer (dessin + mesures)
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearDrawingCanvas();
    clearDrawingMeasurements();
    return;
  }

  // Raccourcis communs
  const handled = handleCommonDrawingKeydown(e, {
    stopPropagation: true,
    onClose: closeZoomDrawingMode,
    onExport: () => showExportModal("zoom"),
    onLightboxToggle: () => {
      updateZoomDrawingLightbox();
      if (zoomDrawingToolbar) {
        const lightboxBtn = zoomDrawingToolbar.querySelector(
          "[data-tooltip*='lumineuse']",
        );
        if (lightboxBtn) {
          lightboxBtn.innerHTML = lightboxEnabled
            ? ICONS.LIGHT_TABLE_OFF
            : ICONS.LIGHT_TABLE_ON;
          lightboxBtn.classList.toggle("active", lightboxEnabled);
        }
      }
    },
    onToolSelect: updateZoomToolbarSelection,
  });

  if (handled) return;
}

/**
 * Gère le relâchement des touches en mode dessin zoom
 */
function handleZoomDrawingKeyup(e) {
  if (!isZoomDrawingModeActive) return;
  handleModifierKeyUp(e);
}

// ================================================================
// FONCTIONS UTILITAIRES PARTAGÉES
// ================================================================


// ================================================================
// MODULE: lifecycle.js
// ================================================================

/**
 * Finalise l'activation du mode dessin (état commun)
 * @param {string} toolName - Outil initial (défaut: 'pencil')
 */
function finalizeDrawingModeActivation(toolName = "pencil", contextType = null) {
  currentTool = toolName;
  isDrawing = false;
  updateDrawingCursor();

  // Si un contexte spécifique est demandé, utiliser celui-là
  // Sinon, détecter automatiquement selon le mode actif
  const targetContext = contextType || (isZoomDrawingModeActive ? 'zoom' : 'normal');
  
  // Synchroniser le DrawingManager avec les éléments DOM actuels
  // Cette étape est CRITIQUE pour que les variables globales fonctionnent
  if (targetContext === 'zoom') {
    drawingManager.setContext('zoom');
    // Le contexte zoom est déjà configuré dans openZoomDrawingMode
  } else {
    drawingManager.setContext('normal');
    drawingManager.normal.canvas = document.getElementById("drawing-canvas");
    drawingManager.normal.ctx = drawingManager.normal.canvas?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.preview = document.getElementById("drawing-preview");
    drawingManager.normal.previewCtx = drawingManager.normal.preview?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.measures = document.getElementById("drawing-measures");
    drawingManager.normal.measuresCtx = drawingManager.normal.measures?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.lightbox = document.getElementById("drawing-lightbox");
    drawingManager.normal.lightboxCtx = drawingManager.normal.lightbox?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.toolbar = document.getElementById("drawing-toolbar");
    drawingManager.normal.targetImage = document.getElementById("current-image");
  }
  
  // Synchroniser les variables legacy
  syncDrawingContext();

  // Réinitialiser le zoom/pan à l'ouverture
  resetCanvasZoomPan();
}

/**
 * Nettoie l'état des touches modificateurs
 */
function resetModifierKeys() {
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;
  hideDrawingModeHint();
}


async function openDrawingMode() {
  // Vérifier qu'on a une image
  const currentImage = document.getElementById("current-image");
  if (
    !currentImage ||
    !currentImage.src ||
    currentImage.src === window.location.href
  ) {
    debugLog("Drawing mode: pas d'image disponible");
    return;
  }

  // Récupérer les références DOM
  drawingOverlay = document.getElementById("drawing-overlay");
  drawingCanvas = document.getElementById("drawing-canvas");
  drawingMeasures = document.getElementById("drawing-measures");
  drawingPreview = document.getElementById("drawing-preview");
  drawingLightboxCanvas = document.getElementById("drawing-lightbox");
  drawingToolbar = document.getElementById("drawing-toolbar");

  if (!drawingOverlay || !drawingCanvas || !drawingPreview) {
    debugLog("Drawing mode: éléments DOM manquants");
    return;
  }

  // Stocker la référence à l'image cible et son src pour la persistance
  targetImageElement = currentImage;
  currentDrawingImageSrc = currentImage.src;

  // Configurer les dimensions des canvas
  setupDrawingCanvasDimensions();

  // Initialiser les contextes
  drawingCtx = drawingCanvas.getContext("2d", { willReadFrequently: true });
  drawingMeasuresCtx = drawingMeasures.getContext("2d", { willReadFrequently: true });
  drawingPreviewCtx = drawingPreview.getContext("2d", { willReadFrequently: true });
  if (drawingLightboxCanvas) {
    drawingLightboxCtx = drawingLightboxCanvas.getContext("2d", { willReadFrequently: true });
  }

  // Cache des éléments UI pour les hot paths (mousemove, animations)
  drawingDOM.measureInfo = document.getElementById("drawing-measure-info");
  drawingDOM.cursor = document.getElementById("drawing-cursor");
  drawingDOM.unitInfo = document.getElementById("drawing-unit-info");
  drawingDOM.unitValue = document.getElementById("drawing-unit-value");
  drawingDOM.totalDistanceInfo = document.getElementById("drawing-total-distance-info");
  drawingDOM.totalDistanceValue = document.getElementById("drawing-total-distance-value");

  // Configurer le DrawingManager pour le mode normal
  drawingManager.normal.overlay = drawingOverlay;
  drawingManager.normal.canvas = drawingCanvas;
  drawingManager.normal.measures = drawingMeasures;
  drawingManager.normal.preview = drawingPreview;
  drawingManager.normal.lightbox = drawingLightboxCanvas;
  drawingManager.normal.toolbar = drawingToolbar;
  drawingManager.normal.ctx = drawingCtx;
  drawingManager.normal.measuresCtx = drawingMeasuresCtx;
  drawingManager.normal.previewCtx = drawingPreviewCtx;
  drawingManager.normal.lightboxCtx = drawingLightboxCtx;
  drawingManager.normal.targetImage = targetImageElement;
  
  // Synchroniser les variables legacy
  drawingManager.setContext('normal');

  // Vérifier si on a un état sauvegardé pour cette image
  // Priorité : 1) cache principal, 2) cache zoom (même image)
  debugLog("Drawing mode: vérification du cache pour", currentDrawingImageSrc);
  let savedState = drawingStateCache.get(currentDrawingImageSrc);
  let stateSource = "main";

  if (!savedState) {
    // Essayer de récupérer l'état du mode zoom
    savedState = zoomDrawingStateCache.get(currentDrawingImageSrc);
    stateSource = "zoom";
  }

  debugLog("Drawing mode: savedState trouvé =", !!savedState, stateSource);

  if (savedState) {
    debugLog(
      `Drawing mode: restauration de l'état depuis le cache ${stateSource}`,
    );
    try {
      await restoreDrawingState(savedState, drawingCtx, drawingMeasuresCtx);
    } catch (e) {
      console.error("Drawing state restoration failed:", e);
    }
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
  } else {
    clearAllDrawingCanvases();
    initFreshDrawingState();
    // Sauvegarder l'état vide initial pour permettre undo du premier trait
    saveDrawingHistory();
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
  }

  finalizeDrawingModeActivation("pencil");

  // Configurer les outils et événements
  setupDrawingModeTools();

  // Observer le redimensionnement
  setupCanvasResizeObserver();

  // Afficher l'overlay et la toolbar
  drawingOverlay.classList.remove("hidden");
  drawingOverlay.classList.add("active");
  if (drawingToolbar) {
    drawingToolbar.classList.remove("hidden");
    initDrawingToolbarDrag();
  }

  // Ajouter l'indicateur visuel (bordures)
  const imageWrapper = document.querySelector(".image-wrapper");
  if (imageWrapper) {
    imageWrapper.classList.add("drawing-mode-active");
    // Créer les bordures si elles n'existent pas
    if (!imageWrapper.querySelector(".drawing-mode-borders")) {
      const borders = document.createElement("div");
      borders.className = "drawing-mode-borders";
      const leftBorder = document.createElement("div");
      leftBorder.className = "drawing-mode-border-left";
      const rightBorder = document.createElement("div");
      rightBorder.className = "drawing-mode-border-right";
      borders.appendChild(leftBorder);
      borders.appendChild(rightBorder);
      imageWrapper.appendChild(borders);
    }
  }

  // Mettre en pause la session si elle est en cours
  if (typeof state !== "undefined" && state.isPlaying) {
    if (typeof togglePlayPause === "function") {
      togglePlayPause();
    }
  }

  // Afficher le badge dessin
  const drawingBadge = document.getElementById("drawing-badge");
  if (drawingBadge) {
    drawingBadge.classList.remove("hidden");
  }

  // Activer visuellement le bouton annotate
  const annotateBtn = document.getElementById("annotate-btn");
  if (annotateBtn) {
    annotateBtn.classList.add("active");
  }

  isDrawingModeActive = true;
  debugLog("Drawing mode: activé");
}

/**
 * Ferme le mode dessin overlay
 */
function closeDrawingMode() {
  debugLog("closeDrawingMode: isDrawingModeActive=", isDrawingModeActive);
  if (!isDrawingModeActive) return;

  debugLog("closeDrawingMode: sauvegarde en cours...", {
    currentDrawingImageSrc,
    drawingCanvas: !!drawingCanvas,
    drawingMeasures: !!drawingMeasures,
  });

  // Sauvegarder l'état du dessin pour cette image
  const saved = saveDrawingState(
    drawingStateCache,
    currentDrawingImageSrc,
    drawingCanvas,
    drawingMeasures,
    drawingCtx,
    drawingMeasuresCtx,
  );

  if (saved) {
    debugLog("Drawing mode: état sauvegardé pour", currentDrawingImageSrc);
  }

  // Masquer l'overlay et la toolbar
  if (drawingOverlay) {
    drawingOverlay.classList.add("hidden");
    drawingOverlay.classList.remove("active");
  }
  if (drawingToolbar) {
    drawingToolbar.classList.add("hidden");
  }

  // Retirer l'indicateur visuel (bordures)
  const imageWrapper = document.querySelector(".image-wrapper");
  if (imageWrapper) {
    imageWrapper.classList.remove("drawing-mode-active");
    // Supprimer les bordures
    const borders = imageWrapper.querySelector(".drawing-mode-borders");
    if (borders) {
      borders.remove();
    }
  }

  // Nettoyer le ResizeObserver
  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
    canvasResizeObserver = null;
  }

  // Nettoyer l'événement resize de la fenêtre
  window.removeEventListener("resize", handleDrawingWindowResize);

  // Nettoyer les événements
  cleanupDrawingModeEvents();

  // Réinitialiser le zoom/pan
  resetCanvasZoomPan();

  // Nettoyer les événements globaux (toolbar drag, resize)
  cleanupGlobalDrawingEvents();

  // Vider le cache des éléments UI
  drawingDOM.measureInfo = null;
  drawingDOM.cursor = null;
  drawingDOM.unitInfo = null;
  drawingDOM.unitValue = null;
  drawingDOM.totalDistanceInfo = null;
  drawingDOM.totalDistanceValue = null;

  // Fermer tous les menus/modals de dessin ouverts
  closeAllDrawingMenus();
  hideDrawingEditHud();
  if (typeof hideDrawingSelectionHud === "function") {
    hideDrawingSelectionHud();
  }

  // Réinitialiser l'état (sans effacer le cache)
  isDrawingModeActive = false;
  targetImageElement = null;

  // Supprimer le curseur personnalisé
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.remove();

  // Cacher les infos de mesure
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
  const distanceInfo = drawingDOM.totalDistanceInfo || document.getElementById("drawing-total-distance-info");
  if (unitInfo) unitInfo.classList.add("hidden");
  if (distanceInfo) distanceInfo.classList.add("hidden");

  // Masquer le badge dessin
  const drawingBadge = document.getElementById("drawing-badge");
  if (drawingBadge) {
    drawingBadge.classList.add("hidden");
  }

  // Désactiver visuellement le bouton annotate
  const annotateBtn = document.getElementById("annotate-btn");
  if (annotateBtn) {
    annotateBtn.classList.remove("active");
  }

  debugLog("Drawing mode: désactivé");
}


// ================================================================
// GLOBAL PAN/ROTATE HANDLERS (MMB, Space+clic, Shift+Space+clic)
// Permettent de pan/rotate même en cliquant hors du canvas (espace noir)
// ================================================================

function _handleGlobalPanDown(e) {
  if (!isDrawingModeActive) return;
  // Ignorer si le clic est sur la toolbar, un menu, ou déjà sur le canvas preview (géré par setupCanvasInputEvents)
  const preview = zoomDrawingPreview || drawingPreview;
  if (e.target === preview) return;
  if (e.target.closest("#drawing-toolbar, #zoom-drawing-toolbar, .drawing-config-popup, .drawing-context-menu")) return;

  // MMB → pan
  if (e.button === 1) {
    e.preventDefault();
    ZoomManager.startPan(e.clientX, e.clientY);
    if (preview) preview.style.cursor = "grabbing";
    return;
  }

  // Shift+Space+clic gauche → rotation
  if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) {
    e.preventDefault();
    handleRotateStart(e);
    return;
  }

  // Space+clic gauche → pan
  if (e.button === 0 && keysState.space && !isDrawing) {
    e.preventDefault();
    handleSpacePanStart(e);
    return;
  }
}

function _handleGlobalPanMove(e) {
  if (!isDrawingModeActive) return;
  if (ZoomManager.isRotating) { handleRotateMove(e); return; }
  if (!ZoomManager.isPanning) return;
  e.preventDefault();
  ZoomManager.pan(e.clientX, e.clientY);
}

function _handleGlobalPanUp(e) {
  if (!isDrawingModeActive) return;
  if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
  if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
    handleCanvasPanEnd();
    return;
  }
}

function _handleGlobalWheel(e) {
  if (!isDrawingModeActive || !CONFIG.enableZoomInDrawingMode) return;
  // Ignorer si le clic est sur la toolbar ou un menu
  if (e.target.closest("#drawing-toolbar, #zoom-drawing-toolbar, .drawing-config-popup, .drawing-context-menu")) return;
  // Ne pas doubler si déjà sur le canvas preview (géré par setupCanvasInputEvents)
  const preview = zoomDrawingPreview || drawingPreview;
  if (e.target === preview) return;
  handleCanvasZoom(e);
}

/**
 * Configure les événements pointer/mouse/wheel sur un canvas preview.
 * Factorise le code commun entre setupDrawingModeTools et setupZoomDrawingEvents.
 * @param {HTMLCanvasElement} previewCanvas - Le canvas preview (drawingPreview ou zoomDrawingPreview)
 * @param {HTMLCanvasElement} mainCanvas - Le canvas principal (drawingCanvas ou zoomDrawingCanvas)
 * @param {CanvasRenderingContext2D} mainCtx - Le contexte du canvas principal
 * @param {string} contextName - "drawing" ou "zoom"
 */
function setupCanvasInputEvents(previewCanvas, mainCanvas, mainCtx, contextName) {
  if (!previewCanvas) return;

  const contextMenuHandler = (e) => {
    e.preventDefault();
    const coords = getDrawingCoordinates(e);
    const hitLine = findMeasurementLineAt(coords, 20);
    if (hitLine) {
      if (hitLine.type === "compass") {
        showCompassIndividualConfig(hitLine, e.clientX, e.clientY);
      } else if (hitLine.type === "calibrate") {
        showCalibrateIndividualConfig(hitLine, e.clientX, e.clientY);
      } else if (isEditableShape(hitLine.type)) {
        showShapeIndividualConfig(hitLine, e.clientX, e.clientY);
      } else {
        showMeasureIndividualConfig(hitLine, e.clientX, e.clientY);
      }
    } else {
      showCanvasContextMenu(e.clientX, e.clientY, contextName);
    }
  };

  if (typeof window !== "undefined" && "PointerEvent" in window) {
    previewCanvas.style.touchAction = "none";

    previewCanvas.onpointerdown = (e) => {
      if (previewCanvas.setPointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (e.button === 1) { handleCanvasPanStart(e); return; }
      if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) { handleRotateStart(e); return; }
      if (e.button === 0 && keysState.space && !isDrawing) { handleSpacePanStart(e); return; }
      handleDrawingMouseDown(e);
    };

    previewCanvas.onpointermove = (e) => {
      if (ZoomManager.isRotating) { handleRotateMove(e); return; }
      if (ZoomManager.isPanning) { handleCanvasPanMove(e); return; }
      handleDrawingMouseMove(e);
    };

    previewCanvas.onpointerup = (e) => {
      if (previewCanvas.releasePointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
      if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
        handleCanvasPanEnd(); return;
      }
      handleDrawingMouseUp(e);
    };

    previewCanvas.onpointercancel = (e) => {
      if (previewCanvas.releasePointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (ZoomManager.isRotating) { handleRotateEnd(); }
      if (ZoomManager.isPanning) { handleCanvasPanEnd(); }
      handleDrawingMouseUp(e);
    };
  } else {
    previewCanvas.onmousedown = (e) => {
      if (e.button === 1) { handleCanvasPanStart(e); return; }
      if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) { handleRotateStart(e); return; }
      if (e.button === 0 && keysState.space && !isDrawing) { handleSpacePanStart(e); return; }
      handleDrawingMouseDown(e);
    };
    previewCanvas.onmousemove = (e) => {
      if (ZoomManager.isRotating) { handleRotateMove(e); return; }
      if (ZoomManager.isPanning) { handleCanvasPanMove(e); return; }
      handleDrawingMouseMove(e);
    };
    previewCanvas.onmouseup = (e) => {
      if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
      if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
        handleCanvasPanEnd(); return;
      }
      handleDrawingMouseUp(e);
    };
  }

  previewCanvas.onmouseleave = (e) => {
    handleDrawingMouseLeave(e, previewCanvas, mainCanvas, mainCtx);
  };
  previewCanvas.onmouseenter = () => {
    resetDrawingStateOnEnter();
  };
  if (CONFIG.enableZoomInDrawingMode) {
    previewCanvas.addEventListener("wheel", handleCanvasZoom);
  }
  previewCanvas.oncontextmenu = contextMenuHandler;
}

/**
 * Configure les outils et événements pour le mode overlay
 * Note: Les événements des boutons sont déjà configurés par populateDrawingToolbar()
 * via les helpers partagés. Cette fonction configure uniquement les éléments additionnels.
 */
function setupDrawingModeTools() {
  if (!drawingToolbar) return;

  // Générer le contenu de la toolbar si vide
  if (drawingToolbar.children.length === 0) {
    populateDrawingToolbar();
  }

  // Mise à jour des tooltips avec les hotkeys configurées
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};

  const exportBtn = document.getElementById("drawing-export");
  if (exportBtn && hk.DRAWING_EXPORT) {
    exportBtn.setAttribute(
      "data-tooltip",
      i18next.t("draw.buttons.export", { hotkey: `Ctrl+${hk.DRAWING_EXPORT.toUpperCase()}` }),
    );
  }

  const lightboxBtn = document.getElementById("drawing-lightbox-btn");
  if (lightboxBtn) {
    updateDrawingLightboxIcon();
    if (hk.DRAWING_LIGHTBOX) {
      lightboxBtn.setAttribute(
        "data-tooltip",
        i18next.t("draw.buttons.lightboxWithKey", { hotkey: hk.DRAWING_LIGHTBOX }),
      );
    }
  }

  // Stabilisateur (bouton optionnel, peut ne pas exister)
  const stabilizerBtn = document.getElementById("drawing-stabilizer");
  if (stabilizerBtn) {
    stabilizerBtn.classList.toggle("active", stabilizerEnabled);
    stabilizerBtn.onclick = (e) => {
      if (e.button === 2 || e.ctrlKey) {
        showStabilizerMenu(e.clientX, e.clientY);
      } else {
        stabilizerEnabled = !stabilizerEnabled;
        stabilizerBtn.classList.toggle("active", stabilizerEnabled);
      }
    };
    stabilizerBtn.oncontextmenu = (e) => {
      e.preventDefault();
      showStabilizerMenu(e.clientX, e.clientY);
    };
  }

  // Bouton reset unité
  const resetUnitBtn = document.getElementById("drawing-reset-unit");
  if (resetUnitBtn) {
    resetUnitBtn.onclick = (e) => {
      e.stopPropagation();
      calibrationUnit = null;
      removeCalibrateAndCompass();
      redrawDrawingMeasurements();
      updateDrawingTotalDistance();
      const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
      if (unitInfo) unitInfo.classList.add("hidden");
      // Mettre à jour les boutons pour les deux contextes
      updateDrawingButtonStates("main");
      updateDrawingButtonStates("zoom");
    };
  }

  // Rendre le container des infos de mesure déplaçable
  setupDrawingInfosContainerDrag();

  // Événements de dessin sur le canvas preview
  setupCanvasInputEvents(drawingPreview, drawingCanvas, drawingCtx, "drawing");

  // Événements clavier
  document.addEventListener("keydown", handleDrawingModeKeydown);
  document.addEventListener("keyup", handleDrawingModeKeyup);

  // Écouteur global pour mouseup (pour arrêter le dessin même hors du canvas)
  document.addEventListener("mouseup", handleGlobalMouseUp);
  document.addEventListener("pointerup", handleGlobalMouseUp);

  // Pan/rotation/zoom globaux (MMB ou Space+clic même hors du canvas, sur l'espace noir)
  document.addEventListener("mousedown", _handleGlobalPanDown);
  document.addEventListener("mousemove", _handleGlobalPanMove);
  document.addEventListener("mouseup", _handleGlobalPanUp);
  document.addEventListener("wheel", _handleGlobalWheel, { passive: false });

  // Réinitialiser l'état des touches
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;

  // Mettre à jour l'état des boutons (protractor, clear-measurements)
  updateDrawingProtractorButtonState();

  // Curseur personnalisé pour prévisualiser la taille du pinceau
  createDrawingCursor();
}

/**
 * Nettoie les événements du mode overlay
 */
function cleanupDrawingModeEvents() {
  document.removeEventListener("keydown", handleDrawingModeKeydown);
  document.removeEventListener("keyup", handleDrawingModeKeyup);
  window.removeEventListener("resize", handleDrawingWindowResize);

  // Réinitialiser l'état des touches
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;


  if (drawingPreview) {
    drawingPreview.onmousedown = null;
    drawingPreview.onmousemove = null;
    drawingPreview.onmouseup = null;
    drawingPreview.onmouseleave = null;
    drawingPreview.onmouseenter = null;
    drawingPreview.removeEventListener('wheel', handleCanvasZoom);
    drawingPreview.onpointerdown = null;
    drawingPreview.onpointermove = null;
    drawingPreview.onpointerup = null;
    drawingPreview.onpointercancel = null;
    drawingPreview.onpointerrawupdate = null;
    drawingPreview.ontouchstart = null;
    drawingPreview.ontouchmove = null;
    drawingPreview.ontouchend = null;
  }
  // Retirer l'écouteur global mouseup
  document.removeEventListener("mouseup", handleGlobalMouseUp);
  document.removeEventListener("pointerup", handleGlobalMouseUp);
  // Retirer les écouteurs globaux de pan/rotation/zoom
  document.removeEventListener("mousedown", _handleGlobalPanDown);
  document.removeEventListener("mousemove", _handleGlobalPanMove);
  document.removeEventListener("mouseup", _handleGlobalPanUp);
  document.removeEventListener("wheel", _handleGlobalWheel);
  // Réinitialiser le zoom/pan à la fermeture
  resetCanvasZoomPan();
}

// ================================================================
// GESTION CENTRALISÉE DES RACCOURCIS CLAVIER
// ================================================================

/**
 * Map des raccourcis outils (partagé entre modes)
 */
function getToolKeyMap() {
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};
  return {
    b: "pencil",
    [hk.DRAWING_TOOL_ERASER || "e"]: "eraser",
    [hk.DRAWING_TOOL_RECTANGLE || "r"]: "rectangle",
    [hk.DRAWING_TOOL_CIRCLE || "c"]: "circle",
    [hk.DRAWING_TOOL_LINE || "l"]: "line",
    [hk.DRAWING_TOOL_ARROW || "a"]: "arrow",
    [hk.DRAWING_TOOL_MEASURE || "m"]: "measure",
    [hk.DRAWING_TOOL_CALIBRATE || "u"]: "calibrate",
  };
}

/**
 * Gestion centralisée des touches modificateurs (keydown)
 * @returns {boolean} true si l'événement a été traité
 */
function handleModifierKeyDown(e) {
  // Windows/Electron: Alt+Space (ou Shift+Alt+Space) ouvre le menu systeme de fenetre.
  // On bloque explicitement cette combinaison en mode dessin.
  if ((e.code === "Space" || e.key === " ") && e.altKey) {
    keysState.alt = true;
    keysState.space = true;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
    return true;
  }

  if (e.key === "Shift") {
    keysState.shift = true;
    // Si Space déjà enfoncé et pas en train de dessiner → mode rotation
    if (keysState.space && !isDrawing && !ZoomManager.isPanning) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) preview.style.cursor = "alias";
    }
    return false;
  }
  if (e.key === "Alt") {
    keysState.alt = true;
    updateAltDuplicateCursor();
    return false;
  }
  if (e.key === "Control") {
    keysState.ctrl = true;
    if (isShapeEditingTool(currentTool) && !isDrawing) {
      scheduleDrawingMeasurementsRedraw();
      const modeText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.ignoreOtherShapes", { defaultValue: "Ignore other shapes (Ctrl)" })
          : "Ignore other shapes (Ctrl)";
      showDrawingModeHint(modeText);
    } else if (
      isDrawing &&
      (currentTool === "line" || currentTool === "rectangle")
    ) {
      const snapText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
          : "Snap (Ctrl)";
      showDrawingModeHint(snapText);
    } else if (isDraggingEndpoint && selectedMeasurement) {
      const snapText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
          : "Snap (Ctrl)";
      showDrawingModeHint(snapText);
    }
    return false;
  }
  if (e.key === " ") {
    keysState.space = true;
    e.preventDefault();
    e.stopPropagation();
    if (!isDrawing) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) {
        // Shift+Space → mode rotation, Space seul → mode pan
        preview.style.cursor = keysState.shift ? "alias" : "grab";
      }
    }
    return false;
  }
  if (e.key === "s" || e.key === "S") {
    keysState.s = true;
    return false;
  }
  const rotateKey = (CONFIG?.HOTKEYS?.DRAWING_ROTATE_SHAPE || "q").toLowerCase();
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === rotateKey) {
    keysState.q = true;
    if (isDraggingMeasurement && selectedMeasurement && isEditableShape(selectedMeasurement.type)) {
      const rotateText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.rotateShape", { defaultValue: "Rotate shape (Q)" })
          : "Rotate shape (Q)";
      showDrawingModeHint(rotateText);
    }
    return false;
  }
  return false;
}

/**
 * Gestion centralisée des touches modificateurs (keyup)
 */
function handleModifierKeyUp(e) {
  if (e.key === "Shift") {
    keysState.shift = false;
    // Si Space encore enfoncé → repasser en mode pan
    if (keysState.space && !isDrawing && !ZoomManager.isPanning && !ZoomManager.isRotating) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) preview.style.cursor = "grab";
    }
  }
  if (e.key === "Alt") {
    keysState.alt = false;
    if (drawingPreview) drawingPreview.style.cursor = "";
  }
  if (e.key === "Control") {
    keysState.ctrl = false;
    if (isShapeEditingTool(currentTool) && !isDrawing) {
      scheduleDrawingMeasurementsRedraw();
    }
    hideDrawingModeHint();
  }
  if (e.key === " ") {
    keysState.space = false;
    if (ZoomManager.isRotating) {
      ZoomManager.endRotate();
    }
    if (ZoomManager.isPanning) {
      ZoomManager.endPan();
    }
    // Restaurer le curseur
    const preview = zoomDrawingPreview || drawingPreview;
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
    spacePressStartPos = null;
    shapeEndAtSpacePress = null;
  }
  if (e.key === "s" || e.key === "S") {
    keysState.s = false;
  }
  const rotateKey = (CONFIG?.HOTKEYS?.DRAWING_ROTATE_SHAPE || "q").toLowerCase();
  if (e.key.toLowerCase() === rotateKey) {
    keysState.q = false;
    hideDrawingModeHint();
  }
}

/**
 * Gestion centralisée des raccourcis communs
 * @param {KeyboardEvent} e - L'événement clavier
 * @param {Object} options - Options de contexte
 * @param {Function} options.onClose - Fonction de fermeture
 * @param {Function} options.onExport - Fonction d'export
 * @param {Function} options.onLightboxToggle - Fonction de toggle lightbox
 * @param {Function} options.onToolSelect - Fonction de sélection d'outil
 * @returns {boolean} true si l'événement a été traité
 */
function handleCommonDrawingKeydown(e, options) {
  const key = e.key.toLowerCase();
  const { onClose, onExport, onLightboxToggle, onToolSelect } = options;

  // Touche configurable pour fermer ou annuler l'opération en cours
  if (e.key === CONFIG.HOTKEYS.DRAWING_CLOSE) {
    e.preventDefault();
    if (options.stopPropagation) e.stopPropagation();

    // Si le compas est en attente du second clic, annuler et rester en mode dessin
    if (compassWaitingSecondClick) {
      compassCenter = null;
      compassWaitingSecondClick = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      const ctx = drawingManager.current;
      if (ctx.previewCtx && ctx.preview) {
        clearCanvas(ctx.previewCtx, ctx.preview);
      }
      // Cacher l'info de mesure
      const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
      if (measureInfo) measureInfo.classList.add("hidden");
      return true;
    }

    onClose();
    return true;
  }

  // Ctrl+Z / Ctrl+Shift+Z pour undo/redo
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    if (e.shiftKey) {
      redoDrawing();
    } else {
      undoDrawing();
    }
    return true;
  }

  // Ctrl+I : inverser la selection des shapes editables
  if ((e.ctrlKey || e.metaKey) && key === "i") {
    e.preventDefault();
    if (typeof invertEditableShapeSelection === "function") {
      invertEditableShapeSelection();
    }
    return true;
  }

  // Ctrl+touche configurable pour export
  if ((e.ctrlKey || e.metaKey) && key === CONFIG.HOTKEYS.DRAWING_EXPORT.toLowerCase()) {
    e.preventDefault();
    onExport();
    return true;
  }

  // Ctrl+0 ou Alt+Z pour réinitialiser le zoom (si zoom activé)
  if (CONFIG.enableZoomInDrawingMode && (((e.ctrlKey || e.metaKey) && key === "0") || (e.altKey && key === "z"))) {
    e.preventDefault();
    resetCanvasZoomPan();
    return true;
  }

  // Ctrl+Plus ou Ctrl+Minus pour zoomer/dézoomer (si zoom activé)
  if (
    CONFIG.enableZoomInDrawingMode &&
    (e.ctrlKey || e.metaKey) &&
    (key === "+" || key === "-" || key === "=" || key === "_")
  ) {
    e.preventDefault();
    if (key === "+" || key === "=") {
      ZoomManager.zoomIn();
    } else {
      ZoomManager.zoomOut();
    }
    return true;
  }

  // Table lumineuse
  if (e.key === CONFIG.HOTKEYS.DRAWING_LIGHTBOX) {
    e.preventDefault();
    lightboxEnabled = !lightboxEnabled;
    onLightboxToggle();
    return true;
  }

  // Taille de l'outil (diminuer / augmenter)
  const hkSizeDecrease = CONFIG.HOTKEYS.DRAWING_SIZE_DECREASE || "é";
  const hkSizeIncrease = CONFIG.HOTKEYS.DRAWING_SIZE_INCREASE || '"';
  if (e.key === hkSizeDecrease) {
    e.preventDefault();
    changeDrawingSize(-1);
    return true;
  }
  if (e.key === hkSizeIncrease) {
    e.preventDefault();
    changeDrawingSize(1);
    return true;
  }

  // CapsLock pour curseur précis
  if (e.key === "CapsLock") {
    showPreciseCursor = !showPreciseCursor;
    updateDrawingCursor();
    return true;
  }

  // Laser (Shift+touche configurable, ex: Shift+B)
  const laserKey = CONFIG.HOTKEYS.DRAWING_TOOL_LASER;
  if (laserKey && e.shiftKey && key === laserKey.toLowerCase()) {
    e.preventDefault();
    onToolSelect("laser");
    return true;
  }

  // Shift+M pour config mesure
  if (e.shiftKey && key === "m") {
    e.preventDefault();
    showMeasureConfig();
    return true;
  }

  // Rapporteur (Shift+touche configurable, ex: Shift+U)
  const protractorKey = CONFIG.HOTKEYS.DRAWING_TOOL_PROTRACTOR;
  if (protractorKey && e.shiftKey && key === protractorKey.toLowerCase()) {
    e.preventDefault();
    onToolSelect("protractor");
    return true;
  }

  // Raccourcis outils (sans modificateur Shift)
  if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
    const toolMap = getToolKeyMap();
    if (toolMap[key]) {
      e.preventDefault();
      onToolSelect(toolMap[key]);
      return true;
    }
  }

  return false;
}

/**
 * Gère les raccourcis clavier en mode overlay
 */
function handleDrawingModeKeydown(e) {
  if (!isDrawingModeActive) return;
  if (e.target.tagName === "INPUT") return;

  // Touches modificateurs
  handleModifierKeyDown(e);

  // Raccourcis communs
  const handled = handleCommonDrawingKeydown(e, {
    onClose: closeDrawingMode,
    onExport: showDrawingExportOptions,
    onLightboxToggle: () => {
      updateDrawingLightbox();
      updateDrawingLightboxIcon();
      const lightboxBtn = document.getElementById("drawing-lightbox-btn");
      if (lightboxBtn) lightboxBtn.classList.toggle("active", lightboxEnabled);
    },
    onToolSelect: selectDrawingTool,
  });

  if (handled) return;

  // Raccourcis spécifiques au mode drawing
  // Tab pour toggle sidebar
  if (e.key === "Tab") {
    e.preventDefault();
    if (typeof toggleSidebar === "function") {
      toggleSidebar();
      if (typeof updateDrawingHudStackOffset === "function") {
        updateDrawingHudStackOffset();
      }
    }
    return;
  }

  // Delete/Backspace pour tout effacer (dessin + mesures)
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearDrawingCanvas();
    clearDrawingMeasurements();
    return;
  }
}

/**
 * Gère les relâchements de touches en mode overlay
 */
function handleDrawingModeKeyup(e) {
  if (!isDrawingModeActive) return;
  handleModifierKeyUp(e);
}

// ================================================================
// HELPERS UI POUR LES MODALS DE CONFIGURATION
// ================================================================


