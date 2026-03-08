// ================================================================
// REMOTE DRAWING SYNC — Partage des dessins en temps réel
// ================================================================
// Ce module gère l'envoi et la réception des événements de dessin
// pour la synchronisation en temps réel entre participants d'une
// session en ligne.

// ----------------------------------------------------------------
// ÉTAT
// ----------------------------------------------------------------
const remoteDrawState = {
  sharingEnabled: false,          // Ce participant partage-t-il ses dessins ?
  remoteVisible: true,            // Afficher les dessins distants ?
  remoteOpacity: 0.6,             // Opacité du canvas remote (0.1–1.0)
  activeRemoteStrokes: new Map(), // strokeId → {sourceClientId, tool, color, size, lastPoint}
  remoteShapes: new Map(),        // sourceClientId → [shapes...]
  batchBuffer: [],                // Points en attente d'envoi
  batchTimerId: null,             // Timer du flush batch
  currentStrokeId: null,          // Stroke sortant actif
  remoteSharers: new Set(),       // clientIds qui partagent actuellement
  hiddenRemoteSharers: new Set(), // clientIds dont on masque les dessins
  lastSnapshots: new Map(),       // sourceClientId -> { dataURL, shapes }
  userCanvases: new Map(),        // sourceClientId -> { canvas, ctx }
};

const REMOTE_DRAW_BATCH_INTERVAL_MS = 50;   // Flush toutes les 50 ms
const REMOTE_DRAW_MAX_BATCH_SIZE = 100;     // Max points par batch
const REMOTE_DRAW_SNAPSHOT_QUALITY = 0.6;   // Qualité JPEG pour les snapshots

let _remoteDrawStrokeCounter = 0;
let _compositeRafId = null;   // Throttle rAF pour _compositeRemoteCanvas

// Clés localStorage pour la persistance des préférences
const REMOTE_DRAW_VISIBLE_KEY = "posechrono_remote_draw_visible";
const REMOTE_DRAW_OPACITY_KEY = "posechrono_remote_draw_opacity";

// ----------------------------------------------------------------
// INITIALISATION DES PRÉFÉRENCES
// ----------------------------------------------------------------
function loadRemoteDrawPrefs() {
  try {
    const vis = localStorage.getItem(REMOTE_DRAW_VISIBLE_KEY);
    if (vis !== null) remoteDrawState.remoteVisible = vis === "1";
    const op = localStorage.getItem(REMOTE_DRAW_OPACITY_KEY);
    if (op !== null) {
      const parsed = parseFloat(op);
      if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 1.0) {
        remoteDrawState.remoteOpacity = parsed;
      }
    }
  } catch (_) {}
}
function saveRemoteDrawPrefs() {
  try {
    localStorage.setItem(REMOTE_DRAW_VISIBLE_KEY, remoteDrawState.remoteVisible ? "1" : "0");
    localStorage.setItem(REMOTE_DRAW_OPACITY_KEY, String(remoteDrawState.remoteOpacity));
  } catch (_) {}
}

// Charger les préférences au chargement du module
loadRemoteDrawPrefs();

// ----------------------------------------------------------------
// HELPERS — Accès cross-script au service sync
// ----------------------------------------------------------------
// syncSessionService est déclaré avec `let` dans plugin.js (scope lexical)
// et n'est pas accessible directement depuis draw.bundle.js (chargé
// dynamiquement). On passe par des getters exposés sur `window`.

function _getSyncService() {
  return typeof window._getSyncSessionService === "function"
    ? window._getSyncSessionService()
    : null;
}

function _getSyncServiceState() {
  return typeof window._getSyncSessionServiceState === "function"
    ? window._getSyncSessionServiceState()
    : null;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _generateRemoteDrawStrokeId() {
  return `s-${Date.now()}-${++_remoteDrawStrokeCounter}`;
}

/**
 * Vérifie si le sync est disponible et que le partage est activé.
 */
function isRemoteDrawSyncActive() {
  const svc = _getSyncService();
  return (
    remoteDrawState.sharingEnabled &&
    svc !== null &&
    typeof svc.sendDrawingSync === "function"
  );
}

/**
 * Vérifie si on est en session en ligne (service instancié et connecté).
 */
function isInOnlineSession() {
  const svc = _getSyncService();
  if (!svc || typeof svc.sendDrawingSync !== "function") return false;
  const st = _getSyncServiceState();
  return st !== null && (st.status === "hosting" || st.status === "joined");
}

// ----------------------------------------------------------------
// SORTANT : Cycle de vie d'un stroke (crayon / gomme)
// ----------------------------------------------------------------

/**
 * Démarre un nouveau stroke sortant.
 * Appelé depuis initPencilDrawing / initEraserDrawing.
 */
function remoteDrawSyncStartStroke(coords, tool, color, size) {
  if (!isRemoteDrawSyncActive()) return;

  const strokeId = _generateRemoteDrawStrokeId();
  remoteDrawState.currentStrokeId = strokeId;
  remoteDrawState.batchBuffer = [];

  _getSyncService().sendDrawingSync("stroke-start", {
    strokeId,
    tool,
    color: color || null,
    size: size || 4,
    point: { x: coords.x, y: coords.y },
  });
}

/**
 * Ajoute un point au buffer de batch.
 * Flush automatiquement quand le buffer atteint MAX_BATCH_SIZE ou après l'intervalle.
 */
function remoteDrawSyncBufferPoint(coords) {
  if (!isRemoteDrawSyncActive() || !remoteDrawState.currentStrokeId) return;

  remoteDrawState.batchBuffer.push({ x: coords.x, y: coords.y });

  // Flush immédiat si buffer plein
  if (remoteDrawState.batchBuffer.length >= REMOTE_DRAW_MAX_BATCH_SIZE) {
    _remoteDrawSyncFlushBatch();
    return;
  }

  // Démarrer le timer si pas déjà en cours
  if (remoteDrawState.batchTimerId === null) {
    remoteDrawState.batchTimerId = setTimeout(
      _remoteDrawSyncFlushBatch,
      REMOTE_DRAW_BATCH_INTERVAL_MS,
    );
  }
}

/**
 * Envoie les points accumulés dans le buffer.
 */
function _remoteDrawSyncFlushBatch() {
  // Toujours annuler le timer
  if (remoteDrawState.batchTimerId !== null) {
    clearTimeout(remoteDrawState.batchTimerId);
    remoteDrawState.batchTimerId = null;
  }

  if (
    !remoteDrawState.currentStrokeId ||
    remoteDrawState.batchBuffer.length === 0
  ) {
    return;
  }
  if (!isRemoteDrawSyncActive()) return;

  const points = remoteDrawState.batchBuffer.splice(0);

  _getSyncService().sendDrawingSync("stroke-batch", {
    strokeId: remoteDrawState.currentStrokeId,
    points,
  });
}

/**
 * Termine le stroke sortant actif.
 * Appelé depuis handleDrawingMouseUp.
 */
function remoteDrawSyncEndStroke() {
  if (!remoteDrawState.currentStrokeId) return;

  // Flush les points restants
  _remoteDrawSyncFlushBatch();

  if (isRemoteDrawSyncActive()) {
    _getSyncService().sendDrawingSync("stroke-end", {
      strokeId: remoteDrawState.currentStrokeId,
    });
  }

  remoteDrawState.currentStrokeId = null;
}

// ----------------------------------------------------------------
// SORTANT : Formes vectorielles (shapes)
// ----------------------------------------------------------------

/**
 * Envoie une ou plusieurs formes nouvellement créées.
 * @param {Array} shapes - Tableau d'objets measurementLine
 */
function remoteDrawSyncShapeAdd(shapes) {
  if (!isRemoteDrawSyncActive()) return;
  if (!Array.isArray(shapes) || shapes.length === 0) return;

  _getSyncService().sendDrawingSync("shape-add", {
    shapes: shapes.map((s) => structuredClone(s)),
  });
}

/**
 * Notifie la suppression d'une forme.
 * @param {string} shapeId - ID de la forme supprimée
 */
function remoteDrawSyncShapeRemove(shapeId) {
  if (!isRemoteDrawSyncActive() || !shapeId) return;

  _getSyncService().sendDrawingSync("shape-remove", {
    shapeId,
  });
}

// ----------------------------------------------------------------
// SORTANT : Clear et Snapshot
// ----------------------------------------------------------------

/**
 * Notifie le clear du canvas raster (+ formes éditables).
 */
function remoteDrawSyncClearRaster() {
  if (!isRemoteDrawSyncActive()) return;
  _getSyncService().sendDrawingSync("clear-raster", {});
}

/**
 * Notifie un clear total (raster + mesures + calibration).
 */
function remoteDrawSyncClearAll() {
  if (!isRemoteDrawSyncActive()) return;
  _getSyncService().sendDrawingSync("clear-all", {});
}

/**
 * Envoie un snapshot PNG du canvas de dessin actuel.
 * PNG préserve la transparence (JPEG remplirait le fond en noir).
 * Utilisé après un undo/redo ou pour rattraper un late joiner.
 */
function remoteDrawSyncCanvasSnapshot() {
  if (!isRemoteDrawSyncActive()) return;
  if (!drawingCanvas) return;

  try {
    // Vérifier si le canvas est vide (entièrement transparent)
    const ctx = drawingCanvas.getContext("2d");
    const w = drawingCanvas.width;
    const h = drawingCanvas.height;
    if (w === 0 || h === 0) return;

    // Obtenir une copie propre des formes actuelles (measurementLines)
    const shapes = typeof measurementLines !== "undefined" ? measurementLines.map(s => structuredClone(s)) : [];

    // Échantillonner le canvas entier avec pas pour détecter un canvas non-vide
    // (Math.min(h, 1) ne scannait que la première ligne — trop restrictif)
    const fullData = ctx.getImageData(0, 0, w, h).data;
    let hasContent = false;
    for (let i = 3; i < fullData.length; i += 32) { // canal alpha, 1 pixel sur 8
      if (fullData[i] !== 0) { hasContent = true; break; }
    }
    if (!hasContent) {
      // Canvas vide → envoyer un signal de clear au lieu d'un snapshot noir + envoyer les shapes vectorielles
      _getSyncService().sendDrawingSync("canvas-snapshot", { dataURL: null, shapes });
      return;
    }

    // PNG préserve la transparence : seuls les traits sont opaques
    const dataURL = drawingCanvas.toDataURL("image/png");
    _getSyncService().sendDrawingSync("canvas-snapshot", { dataURL, shapes });
  } catch (e) {
    console.error("Failed to generate canvas snapshot", e);
  }
}

// ----------------------------------------------------------------
// SORTANT : Annonces de partage
// ----------------------------------------------------------------

/**
 * Annonce le début du partage de dessins.
 */
function remoteDrawSyncAnnounceStart(participantName) {
  if (!isInOnlineSession()) return;
  _getSyncService().sendDrawingSync("sharing-started", {
    participantName: participantName || "",
  });
}

/**
 * Annonce l'arrêt du partage de dessins.
 */
function remoteDrawSyncAnnounceStop() {
  if (!isInOnlineSession()) return;
  _getSyncService().sendDrawingSync("sharing-stopped", {});
}

/**
 * Demande aux participants qui partagent d'envoyer leur état actuel.
 * Appelé quand ce participant ouvre le mode dessin en cours de session.
 */
function remoteDrawSyncRequestSnapshot() {
  if (!isInOnlineSession()) return;
  _getSyncService().sendDrawingSync("request-snapshot", {});
}

// ----------------------------------------------------------------
// TOGGLE DU PARTAGE
// ----------------------------------------------------------------

/**
 * Active ou désactive le partage des dessins pour ce participant.
 * @param {boolean} enabled
 * @param {string} [participantName] - Nom du participant (pour l'annonce)
 */
function setRemoteDrawSharing(enabled, participantName) {
  const wasEnabled = remoteDrawState.sharingEnabled;
  remoteDrawState.sharingEnabled = !!enabled;

  if (enabled && !wasEnabled) {
    remoteDrawSyncAnnounceStart(participantName);
    // Envoyer un snapshot initial si le canvas a du contenu
    if (drawingCanvas && !isCanvasBlank(drawingCanvas)) {
      remoteDrawSyncCanvasSnapshot();
    }
  } else if (!enabled && wasEnabled) {
    // Terminer tout stroke en cours
    remoteDrawSyncEndStroke();
    remoteDrawSyncAnnounceStop();
  }
}

// ----------------------------------------------------------------
// VISIBILITÉ ET OPACITÉ DU CANVAS REMOTE
// ----------------------------------------------------------------

/**
 * Active/désactive la visibilité des dessins distants.
 */
function setRemoteDrawVisible(visible) {
  remoteDrawState.remoteVisible = !!visible;
  _applyRemoteDrawVisibility();
  saveRemoteDrawPrefs();
}

/**
 * Règle l'opacité des dessins distants (0.1–1.0).
 */
function setRemoteDrawOpacity(opacity) {
  const clamped = Math.max(0.1, Math.min(1.0, Number(opacity) || 0.6));
  remoteDrawState.remoteOpacity = clamped;
  _applyRemoteDrawOpacity();
  saveRemoteDrawPrefs();
}

/**
 * Applique la visibilité sur les canvas remote (normal + zoom).
 */
function _applyRemoteDrawVisibility() {
  const display = remoteDrawState.remoteVisible ? "" : "none";
  const remoteNormal = document.getElementById("drawing-remote");
  const remoteZoom = document.getElementById("zoom-drawing-remote");
  if (remoteNormal) remoteNormal.style.display = display;
  if (remoteZoom) remoteZoom.style.display = display;
}

/**
 * Applique l'opacité sur les canvas remote via CSS custom property.
 */
function _applyRemoteDrawOpacity() {
  document.documentElement.style.setProperty(
    "--remote-drawing-opacity",
    String(remoteDrawState.remoteOpacity),
  );
}

// ----------------------------------------------------------------
// ENTRANT : Réception des événements de dessin distants
// (Phase 3 — sera étendu pour le rendu)
// ----------------------------------------------------------------

/**
 * Handler principal pour les événements drawing-sync entrants.
 * Enregistré via syncSessionService.onDrawingSync().
 * @param {Object} event - {type, sourceClientId, msgType, ...data}
 */
function handleRemoteDrawingEvent(event) {
  if (!event || !event.msgType) return;

  const { msgType, sourceClientId } = event;

  if (msgType !== "sharing-stopped" && !remoteDrawState.remoteSharers.has(sourceClientId)) {
    remoteDrawState.remoteSharers.add(sourceClientId);
    if (_remoteDrawPopover) {
      const btn = _remoteDrawShareBtn;
      if (btn) {
        _closeRemoteDrawPopover();
        _toggleRemoteDrawPopover(btn);
      }
    }
  }

  switch (msgType) {
    case "sharing-started":
      _handleRemoteSharingStarted(sourceClientId, event);
      break;
    case "sharing-stopped":
      _handleRemoteSharingStopped(sourceClientId, event);
      break;
    case "stroke-start":
      _handleRemoteStrokeStart(sourceClientId, event);
      break;
    case "stroke-batch":
      _handleRemoteStrokeBatch(sourceClientId, event);
      break;
    case "stroke-end":
      _handleRemoteStrokeEnd(sourceClientId, event);
      break;
    case "shape-add":
      _handleRemoteShapeAdd(sourceClientId, event);
      break;
    case "shape-remove":
      _handleRemoteShapeRemove(sourceClientId, event);
      break;
    case "clear-raster":
      _handleRemoteClearRaster(sourceClientId, event);
      break;
    case "clear-all":
      _handleRemoteClearAll(sourceClientId, event);
      break;
    case "canvas-snapshot":
      _handleRemoteCanvasSnapshot(sourceClientId, event);
      break;
    case "request-snapshot":
      // Un participant vient d'ouvrir le mode dessin et demande l'état actuel
      if (remoteDrawState.sharingEnabled) {
        remoteDrawSyncCanvasSnapshot();
      }
      break;
    default:
      break;
  }
}

// --- Stubs Phase 3 (seront implémentés dans la prochaine phase) ---

function _handleRemoteSharingStarted(sourceClientId, event) {
  remoteDrawState.remoteSharers.add(sourceClientId);
  const data = event.data || {};
  const name = data.participantName || sourceClientId;
  if (typeof showDrawingToast === "function") {
    const msg = typeof i18next !== "undefined"
      ? i18next.t("drawSync.shareStart", { name, defaultValue: `${name} started sharing drawings` })
      : `${name} started sharing drawings`;
    showDrawingToast(msg, "info");
  }
}

function _handleRemoteSharingStopped(sourceClientId, _event) {
  remoteDrawState.remoteSharers.delete(sourceClientId);
  remoteDrawState.lastSnapshots.delete(sourceClientId);
  remoteDrawState.userCanvases.delete(sourceClientId);
  remoteDrawState.hiddenRemoteSharers.delete(sourceClientId);
  if (_remoteDrawPopover) {
    const btn = _remoteDrawShareBtn;
    if (btn) {
      _closeRemoteDrawPopover();
      _toggleRemoteDrawPopover(btn);
    }
  }
  _compositeRemoteCanvas();
}

function _getUserCtx(sourceClientId) {
  const remoteCanvas = drawingRemoteCanvas;
  if (!remoteCanvas) return null;

  if (!remoteDrawState.userCanvases.has(sourceClientId)) {
    const canvas = document.createElement("canvas");
    canvas.width = remoteCanvas.width;
    canvas.height = remoteCanvas.height;
    const ctx = canvas.getContext("2d");
    
    // Si on a un snapshot précédent, on le dessine direct
    const snap = remoteDrawState.lastSnapshots.get(sourceClientId);
    if (snap && snap.dataURL) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        _compositeRemoteCanvas();
      };
      img.src = snap.dataURL;
    }
    
    remoteDrawState.userCanvases.set(sourceClientId, { canvas, ctx });
  }
  return remoteDrawState.userCanvases.get(sourceClientId).ctx;
}

function _handleRemoteStrokeStart(sourceClientId, event) {
  // Phase 3 : rendu
  const { strokeId, tool, color, size, point } = event.data || {};
  if (!strokeId || !point) return;

  const userCtx = _getUserCtx(sourceClientId);
  if (!userCtx) return;

  remoteDrawState.activeRemoteStrokes.set(strokeId, {
    sourceClientId,
    tool: tool || "pencil",
    color: color || "#ff3333",
    size: size || 4,
    lastPoint: { x: point.x, y: point.y },
    lastMidPoint: { x: point.x, y: point.y }, // Initially, midpoint is the start point
  });

  // Dessiner le premier point (dot visible pour la gomme, rien pour le
  // crayon : le premier segment sera tracé par le batch suivant)
  if (tool === "eraser") {
    _drawRemoteEraserPoint(userCtx, point.x, point.y, size);
    _compositeRemoteCanvas();
  }
}

function _handleRemoteStrokeBatch(sourceClientId, event) {
  const { strokeId, points } = event.data || {};
  if (!strokeId || !Array.isArray(points) || points.length === 0) return;

  const strokeInfo = remoteDrawState.activeRemoteStrokes.get(strokeId);
  if (!strokeInfo) return;

  const userCtx = _getUserCtx(sourceClientId);
  if (!userCtx) return;

  if (strokeInfo.tool === "eraser") {
    // Gomme : effacer chaque point avec interpolation
    let prev = strokeInfo.lastPoint;
    for (const pt of points) {
      _drawRemoteEraserLine(userCtx, prev, pt, strokeInfo.size);
      prev = pt;
    }
    strokeInfo.lastPoint = { ...points[points.length - 1] };
  } else {
    // Crayon : dessiner avec lissage par courbes quadratiques (midpoint smoothing)
    // Cela correspond au lissage du dessin local dans tool-handlers.js
    userCtx.strokeStyle = strokeInfo.color;
    userCtx.lineWidth = strokeInfo.size;
    userCtx.lineCap = "round";
    userCtx.lineJoin = "round";

    for (const pt of points) {
      const midX = (strokeInfo.lastPoint.x + pt.x) / 2;
      const midY = (strokeInfo.lastPoint.y + pt.y) / 2;

      userCtx.beginPath();
      userCtx.moveTo(strokeInfo.lastMidPoint.x, strokeInfo.lastMidPoint.y);
      userCtx.quadraticCurveTo(strokeInfo.lastPoint.x, strokeInfo.lastPoint.y, midX, midY);
      userCtx.stroke();

      strokeInfo.lastPoint = { x: pt.x, y: pt.y };
      strokeInfo.lastMidPoint = { x: midX, y: midY };
    }
  }
  _compositeRemoteCanvas();
}

function _handleRemoteStrokeEnd(sourceClientId, event) {
  const { strokeId } = event.data || {};
  if (!strokeId) return;

  const strokeInfo = remoteDrawState.activeRemoteStrokes.get(strokeId);
  if (!strokeInfo) return;

  const userCtx = _getUserCtx(sourceClientId);
  if (userCtx && strokeInfo.tool !== "eraser") {
    // Finaliser le dernier segment de la courbe lissée (midpoint -> point final)
    userCtx.beginPath();
    userCtx.moveTo(strokeInfo.lastMidPoint.x, strokeInfo.lastMidPoint.y);
    // On dessine une ligne droite finale ou un point si le midpoint = end point
    userCtx.lineTo(strokeInfo.lastPoint.x, strokeInfo.lastPoint.y);
    userCtx.strokeStyle = strokeInfo.color;
    userCtx.lineWidth = strokeInfo.size;
    userCtx.lineCap = "round";
    userCtx.lineJoin = "round";
    userCtx.stroke();
    _compositeRemoteCanvas();
  }

  remoteDrawState.activeRemoteStrokes.delete(strokeId);
}

function _handleRemoteShapeAdd(sourceClientId, event) {
  // Phase 3 : rendu des formes distantes sur le canvas remote
  const { shapes } = event.data || {};
  if (!Array.isArray(shapes) || shapes.length === 0) return;

  let snapshot = remoteDrawState.lastSnapshots.get(sourceClientId);
  if (!snapshot) {
    snapshot = { dataURL: null, shapes: [] };
    remoteDrawState.lastSnapshots.set(sourceClientId, snapshot);
  }
  
  // Accumuler les nouvelles formes (l'émetteur n'envoie que les nouvelles)
  snapshot.shapes = snapshot.shapes.concat(shapes);
  _compositeRemoteCanvas();
}

function _handleRemoteShapeRemove(_sourceClientId, _event) {
  const { shapeId } = _event.data || {};
  if (!shapeId) return;
  const snapshot = remoteDrawState.lastSnapshots.get(_sourceClientId);
  if (!snapshot || !Array.isArray(snapshot.shapes)) return;
  snapshot.shapes = snapshot.shapes.filter((s) => s.id !== shapeId);
  _compositeRemoteCanvas();
}

function _handleRemoteClearRaster(_sourceClientId, _event) {
  const snapshot = remoteDrawState.lastSnapshots.get(_sourceClientId);
  if (snapshot) {
    snapshot.dataURL = null;
  } else {
    remoteDrawState.lastSnapshots.set(_sourceClientId, { dataURL: null, shapes: [] });
  }

  const userState = remoteDrawState.userCanvases.get(_sourceClientId);
  if (userState && userState.ctx && userState.canvas) {
    clearCanvas(userState.ctx, userState.canvas);
  }
  _compositeRemoteCanvas();
}

function _handleRemoteClearAll(_sourceClientId, _event) {
  const snapshot = remoteDrawState.lastSnapshots.get(_sourceClientId);
  if (snapshot) {
    snapshot.dataURL = null;
    snapshot.shapes = [];
  } else {
    remoteDrawState.lastSnapshots.set(_sourceClientId, { dataURL: null, shapes: [] });
  }
  
  const userState = remoteDrawState.userCanvases.get(_sourceClientId);
  if (userState && userState.ctx && userState.canvas) {
    clearCanvas(userState.ctx, userState.canvas);
  }
  _compositeRemoteCanvas();
}

function _compositeRemoteCanvas() {
  // Throttle via rAF : une seule recomposition par frame, même si appelée N fois
  if (_compositeRafId !== null) return;
  _compositeRafId = requestAnimationFrame(() => {
    _compositeRafId = null;
    const remoteCtx = drawingRemoteCtx;
    const remoteCanvas = drawingRemoteCanvas;
    if (!remoteCtx || !remoteCanvas) return;

    clearCanvas(remoteCtx, remoteCanvas);

    remoteDrawState.remoteSharers.forEach((clientId) => {
      if (remoteDrawState.hiddenRemoteSharers.has(clientId)) return;

      // Draw the user canvas (which has strokes and possibly loaded dataURL)
      const userState = remoteDrawState.userCanvases.get(clientId);
      if (userState && userState.canvas) {
        remoteCtx.drawImage(userState.canvas, 0, 0, remoteCanvas.width, remoteCanvas.height);
      }

      // Draw the shapes
      const snapshot = remoteDrawState.lastSnapshots.get(clientId);
      if (snapshot && Array.isArray(snapshot.shapes)) {
        for (const shape of snapshot.shapes) {
          _renderRemoteShape(remoteCtx, shape, snapshot.shapes);
        }
      }
    });
  });
}

function _handleRemoteCanvasSnapshot(_sourceClientId, event) {
  const { dataURL, shapes } = event.data || {};
  
  remoteDrawState.lastSnapshots.set(_sourceClientId, { dataURL, shapes });
  
  const userCtx = _getUserCtx(_sourceClientId);
  if (userCtx) {
    clearCanvas(userCtx, userCtx.canvas);
    if (dataURL) {
      const img = new Image();
      img.onload = () => {
        userCtx.drawImage(img, 0, 0, userCtx.canvas.width, userCtx.canvas.height);
        _compositeRemoteCanvas();
      };
      img.src = dataURL;
    } else {
      _compositeRemoteCanvas();
    }
  } else {
    _compositeRemoteCanvas();
  }
}

// ----------------------------------------------------------------
// HELPERS DE RENDU DISTANT
// ----------------------------------------------------------------

/**
 * Dessine un point de gomme distant (destination-out).
 */
function _drawRemoteEraserPoint(ctx, x, y, size) {
  const radius = (size || 4) / 2;
  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = prevGCO;
}

/**
 * Dessine une ligne de gomme distante avec interpolation.
 */
function _drawRemoteEraserLine(ctx, from, to, size) {
  const radius = (size || 4) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(distance / 4));

  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = prevGCO;
}

function _getRemoteShapeFillStyle(config, color) {
  if (!config?.fillEnabled) return null;
  const fillOpacity = Math.min(1.0, Math.max(0.05, config.fillOpacity ?? 0.2));
  const baseColor = config.fillColor || config.color || color || "#ff3333";
  return { color: baseColor, opacity: fillOpacity };
}

function _buildRemoteShapeEdgeGroupPath(ctx, edgeLine, shapes) {
  if (!ctx || !edgeLine || !edgeLine.shapeGroup || !Array.isArray(shapes)) return false;
  
  const groupLines = shapes.filter(
    (line) => line.type === "shape-edge" && line.shapeGroup === edgeLine.shapeGroup
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

/**
 * Dessine une forme distante sur le canvas remote.
 * Supporte les types : shape-line, shape-arrow, shape-circle, shape-edge.
 */
function _renderRemoteShape(ctx, shape, shapesArray = []) {
  if (!ctx || !shape || !shape.type) return;

  const config = shape.config || {};
  const color = config.color || "#ff3333";
  const lineWidth = config.lineWidth || 3;
  const fillStyle = _getRemoteShapeFillStyle(config, color);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (shape.type) {
    case "shape-line":
    case "shape-edge": {
      if (!shape.start || !shape.end) break;
      
      // Attempt to fill shape-edge if it belongs to a group, although typically
      // filled shapes are rendered via a dedicated path builder locally.
      // For remote sync, we will rely on individual path drawing unless we implement 
      // a group builder. As of now, only circles have built-in solitary fill in PoseChrono.
      
      if (
        shape.type === "shape-edge" &&
        shape.startCorner === "a" &&
        shape.endCorner === "b" &&
        fillStyle
      ) {
        if (_buildRemoteShapeEdgeGroupPath(ctx, shape, shapesArray)) {
          ctx.save();
          ctx.fillStyle = fillStyle.color;
          ctx.globalAlpha = fillStyle.opacity;
          ctx.fill();
          ctx.restore();
        }
      }
      
      if (shape.control) {
        // Courbe de Bézier quadratique
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.quadraticCurveTo(shape.control.x, shape.control.y, shape.end.x, shape.end.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.lineTo(shape.end.x, shape.end.y);
        ctx.stroke();
      }
      break;
    }
    case "shape-arrow": {
      if (!shape.start || !shape.end) break;
      // Ligne
      if (shape.control) {
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.quadraticCurveTo(shape.control.x, shape.control.y, shape.end.x, shape.end.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.lineTo(shape.end.x, shape.end.y);
        ctx.stroke();
      }
      // Tête de flèche
      const headSize = (config.arrowHeadSize || 1.15) * lineWidth * 4;
      const angle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
      ctx.beginPath();
      ctx.moveTo(shape.end.x, shape.end.y);
      ctx.lineTo(
        shape.end.x - headSize * Math.cos(angle - Math.PI / 6),
        shape.end.y - headSize * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(shape.end.x, shape.end.y);
      ctx.lineTo(
        shape.end.x - headSize * Math.cos(angle + Math.PI / 6),
        shape.end.y - headSize * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      break;
    }
    case "shape-circle": {
      if (!shape.start || !shape.end) break;
      const cx = (shape.start.x + shape.end.x) / 2;
      const cy = (shape.start.y + shape.end.y) / 2;
      const rx = Math.abs(shape.end.x - shape.start.x) / 2;
      const ry = Math.abs(shape.end.y - shape.start.y) / 2;
      
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
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

// ----------------------------------------------------------------
// ENREGISTREMENT DU LISTENER SYNC
// ----------------------------------------------------------------

let _remoteDrawSyncListenerRegistered = false;

/**
 * Enregistre le listener pour les événements drawing-sync entrants.
 * Appelé lorsqu'on rejoint/crée une session en ligne.
 */
function registerRemoteDrawSyncListener() {
  if (_remoteDrawSyncListenerRegistered) return;
  if (!isInOnlineSession()) return;

  _getSyncService().onDrawingSync(handleRemoteDrawingEvent);
  _remoteDrawSyncListenerRegistered = true;

  // Demander l'état courant aux participants qui partagent déjà
  remoteDrawSyncRequestSnapshot();
}

/**
 * Désenregistre le listener.
 * Appelé lorsqu'on quitte la session en ligne.
 */
function unregisterRemoteDrawSyncListener() {
  if (!_remoteDrawSyncListenerRegistered) return;
  const svcOff = _getSyncService();
  if (svcOff) {
    svcOff.offDrawingSync(handleRemoteDrawingEvent);
  }
  _remoteDrawSyncListenerRegistered = false;

  // Nettoyage de l'état distant
  remoteDrawState.sharingEnabled = false;
  remoteDrawState.activeRemoteStrokes.clear();
  remoteDrawState.remoteShapes.clear();
  remoteDrawState.remoteSharers.clear();
  remoteDrawState.currentStrokeId = null;
  remoteDrawState.batchBuffer = [];
  if (remoteDrawState.batchTimerId !== null) {
    clearTimeout(remoteDrawState.batchTimerId);
    remoteDrawState.batchTimerId = null;
  }
}

// ----------------------------------------------------------------
// NETTOYAGE AU CHANGEMENT D'IMAGE
// ----------------------------------------------------------------

/**
 * Efface le canvas remote lorsque l'image change.
 * Les traits distants ne sont pas pertinents sur une autre image.
 */
function clearRemoteDrawCanvas() {
  const remoteCtx = drawingRemoteCtx;
  const remoteCanvas = drawingRemoteCanvas;
  if (remoteCtx && remoteCanvas) {
    clearCanvas(remoteCtx, remoteCanvas);
  }
  // Nettoyer les strokes actifs distants
  remoteDrawState.activeRemoteStrokes.clear();
  remoteDrawState.remoteShapes.clear();
  // Nettoyer les canvases off-screen et snapshots par utilisateur
  // (les traits distants ne sont pas pertinents sur une autre image)
  remoteDrawState.userCanvases.clear();
  remoteDrawState.lastSnapshots.clear();
}

// ----------------------------------------------------------------
// UI : ICÔNE BROADCAST SVG
// ----------------------------------------------------------------
const REMOTE_DRAW_ICON_SHARE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="2"/>' +
  '<path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49"/>' +
  '<path d="M19.07 4.93a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>' +
  '</svg>';

const REMOTE_DRAW_SVG_EYE_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">' +
  '<path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/>' +
  '</svg>';

const REMOTE_DRAW_SVG_EYE_OFF =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">' +
  '<path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>' +
  '</svg>';

const REMOTE_DRAW_SVG_PERSON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="12" cy="7" r="4"/>' +
  '</svg>';

// ----------------------------------------------------------------
// UI : BOUTON DE PARTAGE (toolbar dessin)
// ----------------------------------------------------------------

let _remoteDrawShareBtn = null;
let _remoteDrawPopover = null;

/**
 * Crée le bouton toggle "Partager mes dessins" pour la toolbar.
 * Le bouton est caché tant qu'on n'est pas en session en ligne.
 * Clic gauche = ouvre le popover de contrôle.
 * @param {string} btnClass — Classe CSS du bouton (ex: "annotation-tool")
 * @returns {HTMLButtonElement}
 */
function createRemoteDrawShareButton(btnClass) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "drawing-share-btn";
  btn.className = btnClass;
  btn.setAttribute(
    "data-tooltip",
    typeof i18next !== "undefined"
      ? i18next.t("drawSync.shareToggleTooltip", { defaultValue: "Drawing sync" })
      : "Drawing sync",
  );
  btn.innerHTML = REMOTE_DRAW_ICON_SHARE;
  btn.style.display = "none"; // Caché par défaut

  btn.onclick = (e) => {
    e.stopPropagation();
    _toggleRemoteDrawPopover(btn);
  };

  // Le clic droit ouvre aussi le popover (au lieu du menu contextuel natif)
  btn.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    _toggleRemoteDrawPopover(btn);
  };

  _remoteDrawShareBtn = btn;
  return btn;
}

/**
 * Met à jour l'apparence du bouton (actif/inactif).
 */
function _updateRemoteDrawShareButtonState(btn) {
  btn = btn || _remoteDrawShareBtn;
  if (!btn) return;
  btn.classList.toggle("active", remoteDrawState.sharingEnabled);
  btn.classList.toggle("sharing-active", remoteDrawState.sharingEnabled);
}

/**
 * Affiche ou cache le bouton de partage selon l'état de la session.
 * Appelé quand on rejoint/quitte une session en ligne.
 */
function updateRemoteDrawShareButtonVisibility() {
  const btn = _remoteDrawShareBtn;
  if (!btn) return;
  const inSession = isInOnlineSession();
  btn.style.display = inSession ? "" : "none";
  if (!inSession) {
    // Fermer le popover s'il est ouvert
    _closeRemoteDrawPopover();
    if (remoteDrawState.sharingEnabled) {
      setRemoteDrawSharing(false);
      _updateRemoteDrawShareButtonState(btn);
    }
  }
}

// ----------------------------------------------------------------
// UI : POPOVER DE CONTRÔLE (ancré au bouton share)
// ----------------------------------------------------------------

// Drag state pour le popover (nettoyé à la fermeture)
let _popoverDragState = null;

/**
 * Ferme le popover s'il est ouvert et nettoie les listeners drag.
 */
function _closeRemoteDrawPopover() {
  if (_popoverDragState) {
    if (_popoverDragState.onMove) document.removeEventListener("mousemove", _popoverDragState.onMove);
    if (_popoverDragState.onUp) document.removeEventListener("mouseup", _popoverDragState.onUp);
    _popoverDragState = null;
  }
  if (_remoteDrawPopover) {
    _remoteDrawPopover.remove();
    _remoteDrawPopover = null;
  }
}

/**
 * Résout le nom d'affichage pour un clientId donné.
 * Si le clientId correspond à l'hôte, ajoute "(hôte)" en suffixe.
 */
function _resolveSharerName(clientId) {
  const st = _getSyncServiceState();
  const profiles = st?.participantProfiles || {};
  const name = profiles[clientId] || "";
  const isHost = !!(st?.hostClientId && clientId === st.hostClientId);

  if (isHost) {
    const hostLabel = typeof getI18nText === "function"
      ? getI18nText("sync.hostParticipantLabel", "host")
      : "host";
    const hasCustomName = name && name.toLowerCase() !== hostLabel.toLowerCase();
    return hasCustomName
      ? `${name} (${hostLabel})`
      : hostLabel.charAt(0).toUpperCase() + hostLabel.slice(1);
  }

  return name || (clientId.length > 14 ? clientId.slice(0, 12) + "\u2026" : clientId);
}

/**
 * Ouvre ou ferme le popover ancré au bouton share.
 * @param {HTMLElement} anchorBtn — Le bouton d'ancrage
 */
function _toggleRemoteDrawPopover(anchorBtn) {
  // Si déjà ouvert, fermer
  if (_remoteDrawPopover) {
    _closeRemoteDrawPopover();
    return;
  }

  const t = (key, def) =>
    typeof i18next !== "undefined"
      ? i18next.t(key, { defaultValue: def })
      : def;

  // Créer le popover
  const pop = document.createElement("div");
  pop.id = "remote-draw-popover";
  pop.className = "remote-draw-popover";

  // ── Header avec titre + bouton fermer (draggable) ──
  const header = document.createElement("div");
  header.className = "remote-draw-popover-header";

  const titleEl = document.createElement("span");
  titleEl.className = "remote-draw-popover-title";
  titleEl.innerHTML = REMOTE_DRAW_ICON_SHARE + " " + t("drawSync.panelTitle", "Drawing sync");
  header.appendChild(titleEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "remote-draw-popover-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  closeBtn.onclick = (e) => { e.stopPropagation(); _closeRemoteDrawPopover(); };
  header.appendChild(closeBtn);

  pop.appendChild(header);

  // ── Toggle : Partager mes dessins (option-toggle-btn compact) ──
  const shareRow = document.createElement("div");
  shareRow.className = "remote-draw-popover-row";
  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "option-toggle-btn remote-draw-popover-share-toggle";
  if (remoteDrawState.sharingEnabled) shareBtn.classList.add("active");
  shareBtn.innerHTML = REMOTE_DRAW_ICON_SHARE + " " + t("drawSync.shareToggle", "Share my drawings");
  shareBtn.onclick = (e) => {
    e.stopPropagation();
    const newState = !remoteDrawState.sharingEnabled;
    const pseudo = _getSyncServiceState()?.myPseudo || "";
    setRemoteDrawSharing(newState, pseudo);
    shareBtn.classList.toggle("active", newState);
    _updateRemoteDrawShareButtonState();

    if (typeof showDrawingToast === "function") {
      const msg = newState
        ? t("drawSync.toastShareEnabled", "You are now sharing your drawings")
        : t("drawSync.toastShareDisabled", "Drawing sharing disabled");
      showDrawingToast(msg, "info");
    }
  };
  shareRow.appendChild(shareBtn);
  pop.appendChild(shareRow);

  // ── Toggle : Afficher les dessins distants (checkbox-simple) ──
  const visRow = document.createElement("div");
  visRow.className = "remote-draw-popover-row";
  const visLabel = document.createElement("label");
  visLabel.className = "checkbox-simple-label";
  const visCb = document.createElement("input");
  visCb.type = "checkbox";
  visCb.className = "checkbox-simple";
  visCb.checked = remoteDrawState.remoteVisible;
  visCb.onchange = () => {
    setRemoteDrawVisible(visCb.checked);
  };
  visLabel.appendChild(visCb);
  const visText = document.createElement("span");
  visText.className = "checkbox-simple-text";
  visText.textContent = t("drawSync.remoteVisible", "Show remote drawings");
  visLabel.appendChild(visText);
  visRow.appendChild(visLabel);
  pop.appendChild(visRow);

  // ── Slider opacité ──
  const opRow = document.createElement("div");
  opRow.className = "remote-draw-popover-row remote-draw-popover-slider-row";

  const opLabel = document.createElement("span");
  opLabel.className = "remote-draw-popover-slider-label";
  opLabel.textContent = t("drawSync.remoteOpacity", "Opacity");
  opRow.appendChild(opLabel);

  const opValue = document.createElement("span");
  opValue.className = "remote-draw-popover-slider-value";
  opValue.textContent = Math.round(remoteDrawState.remoteOpacity * 100) + "%";

  const opSlider = document.createElement("input");
  opSlider.type = "range";
  opSlider.className = "remote-draw-popover-slider";
  opSlider.min = "10";
  opSlider.max = "100";
  opSlider.value = String(Math.round(remoteDrawState.remoteOpacity * 100));
  opSlider.oninput = () => {
    const v = Number(opSlider.value);
    opValue.textContent = v + "%";
    setRemoteDrawOpacity(v / 100);
  };
  opRow.appendChild(opSlider);
  opRow.appendChild(opValue);

  pop.appendChild(opRow);

  // ── Liste des participants qui partagent (avec eye toggle) ──
  const sharers = Array.from(remoteDrawState.remoteSharers);

  const sepEl = document.createElement("div");
  sepEl.className = "remote-draw-popover-sep";
  pop.appendChild(sepEl);

  if (sharers.length > 0) {
    const sharerTitle = document.createElement("div");
    sharerTitle.className = "remote-draw-popover-section";
    sharerTitle.textContent = t("drawSync.sharers", "Sharing drawings");
    pop.appendChild(sharerTitle);

    sharers.forEach((clientId) => {
      const isHidden = remoteDrawState.hiddenRemoteSharers.has(clientId);
      const row = document.createElement("div");
      row.className = "remote-draw-popover-sharer-row" + (isHidden ? " remote-draw-popover-sharer-row--hidden" : "");

      // Icône personne
      const iconEl = document.createElement("span");
      iconEl.className = "remote-draw-popover-sharer-icon";
      iconEl.innerHTML = REMOTE_DRAW_SVG_PERSON;
      row.appendChild(iconEl);

      // Nom du participant
      const nameEl = document.createElement("span");
      nameEl.className = "remote-draw-popover-sharer-name";
      nameEl.textContent = _resolveSharerName(clientId);
      row.appendChild(nameEl);

      // Eye toggle
      const eyeEl = document.createElement("span");
      eyeEl.className = "remote-draw-popover-sharer-eye";
      eyeEl.innerHTML = isHidden ? REMOTE_DRAW_SVG_EYE_OFF : REMOTE_DRAW_SVG_EYE_OPEN;
      row.appendChild(eyeEl);

      // Click → toggle visibilité de ce participant
      row.addEventListener("click", () => {
        const nowHidden = remoteDrawState.hiddenRemoteSharers.has(clientId);
        if (nowHidden) {
          remoteDrawState.hiddenRemoteSharers.delete(clientId);
        } else {
          remoteDrawState.hiddenRemoteSharers.add(clientId);
        }
        const visible = !remoteDrawState.hiddenRemoteSharers.has(clientId);
        row.classList.toggle("remote-draw-popover-sharer-row--hidden", !visible);
        eyeEl.innerHTML = visible ? REMOTE_DRAW_SVG_EYE_OPEN : REMOTE_DRAW_SVG_EYE_OFF;
        _compositeRemoteCanvas();
      });

      pop.appendChild(row);
    });
  } else {
    const noSharers = document.createElement("div");
    noSharers.className = "remote-draw-popover-muted";
    noSharers.textContent = t("drawSync.noSharers", "No one is sharing drawings");
    pop.appendChild(noSharers);
  }

  document.body.appendChild(pop);
  _remoteDrawPopover = pop;

  // ── Positionnement : ancré à droite du bouton ou mémorisé ──
  requestAnimationFrame(() => {
    const savedPos = localStorage.getItem("posechrono_remote_draw_popover_pos");
    let initialLeft, initialTop;

    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        initialLeft = parsed.left;
        initialTop = parsed.top;
      } catch (e) {}
    }

    const popRect = pop.getBoundingClientRect();

    if (initialLeft !== undefined && initialTop !== undefined) {
      initialLeft = Math.max(8, Math.min(initialLeft, window.innerWidth - popRect.width - 8));
      initialTop = Math.max(8, Math.min(initialTop, window.innerHeight - popRect.height - 8));
      pop.style.left = initialLeft + "px";
      pop.style.top = initialTop + "px";
    } else {
      const btnRect = anchorBtn.getBoundingClientRect();
      let left = btnRect.right + 8;
      let top = btnRect.top + (btnRect.height / 2) - (popRect.height / 2);

      if (left + popRect.width > window.innerWidth - 8) {
        left = btnRect.left + (btnRect.width / 2) - (popRect.width / 2);
        top = btnRect.top - popRect.height - 8;
      }

      top = Math.max(8, Math.min(top, window.innerHeight - popRect.height - 8));
      left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));

      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
    pop.style.visibility = "visible";
  });

  // ── Drag sur le header (pattern sidebar-config-popup) ──
  const onDragMove = (e) => {
    if (!_popoverDragState || !_popoverDragState.active) return;
    pop.style.left = (_popoverDragState.startLeft + e.clientX - _popoverDragState.startX) + "px";
    pop.style.top = (_popoverDragState.startTop + e.clientY - _popoverDragState.startY) + "px";
  };
  const onDragUp = () => {
    if (_popoverDragState && _popoverDragState.active) {
      _popoverDragState.active = false;
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragUp);
      
      if (document.body.contains(pop)) {
        const popRect = pop.getBoundingClientRect();
        localStorage.setItem("posechrono_remote_draw_popover_pos", JSON.stringify({
          left: popRect.left,
          top: popRect.top
        }));
      }
    }
  };

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return; // pas le bouton fermer
    const r = pop.getBoundingClientRect();
    // Convertir en position absolue si nécessaire
    pop.style.left = r.left + "px";
    pop.style.top = r.top + "px";
    pop.style.transform = "none";
    _popoverDragState = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: r.left,
      startTop: r.top,
      onMove: onDragMove,
      onUp: onDragUp,
    };
    
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
  });
}
