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
