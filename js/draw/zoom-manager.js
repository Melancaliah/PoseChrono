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
