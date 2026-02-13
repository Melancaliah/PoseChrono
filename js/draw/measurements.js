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

function getShapeGroupCornersFromEdge(edgeLine) {
  if (!edgeLine?.shapeGroup) return null;
  const groupLines = measurementLines.filter(
    (line) => line.type === "shape-edge" && line.shapeGroup === edgeLine.shapeGroup,
  );
  if (groupLines.length === 0) return null;

  const pointsByCorner = {};
  groupLines.forEach((line) => {
    if (line.startCorner) pointsByCorner[line.startCorner] = { ...line.start };
    if (line.endCorner) pointsByCorner[line.endCorner] = { ...line.end };
  });
  if (!pointsByCorner.a || !pointsByCorner.b || !pointsByCorner.c || !pointsByCorner.d) {
    return null;
  }
  return pointsByCorner;
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
  const selectedOpacity = shapeSelected && isShape ? 0.62 : 1;
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
    const corners = getShapeGroupCornersFromEdge(line);
    if (corners) {
      ctx.save();
      ctx.fillStyle = fillStyle.color;
      ctx.globalAlpha = fillStyle.opacity;
      ctx.beginPath();
      ctx.moveTo(corners.a.x, corners.a.y);
      ctx.lineTo(corners.b.x, corners.b.y);
      ctx.lineTo(corners.c.x, corners.c.y);
      ctx.lineTo(corners.d.x, corners.d.y);
      ctx.closePath();
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
