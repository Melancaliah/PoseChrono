# PoseChrono - Plan de Restructuration Multi-Produit (Eagle + Standalone)

## Objectif
Permettre de livrer et maintenir:
- une version **Eagle Plugin** (store Eagle),
- une version **Standalone Desktop** (Windows `.exe` en priorité, puis macOS/Linux),

sans dupliquer la logique métier et sans casser les contraintes Eagle (`manifest.json` + `index.html` à la racine).

## Contraintes non négociables
- [x] Conserver `manifest.json` à la racine pour Eagle.
- [x] Conserver `index.html` racine fonctionnel pour Eagle.
- [x] Aucune régression fonctionnelle sur le plugin Eagle pendant la migration.
- [x] Les artefacts publiés ne doivent embarquer que les fichiers nécessaires à leur cible.

## Décision d’architecture (recommandée)
- [x] **Monorepo unique**, avec 2 produits et un socle partagé.
- [x] Version Eagle reste basée sur la racine actuelle.
- [x] Version Standalone dans un dossier dédié (`apps/desktop`).
- [x] Logique commune extraite progressivement vers `packages/shared` (runtime déjà branché sur `packages/shared`).

### Structure cible
- [x] `manifest.json` (racine, Eagle)
- [x] `index.html` (racine, Eagle)
- [x] `js/`, `css/`, `_locales/`, `assets/` (racine, pendant migration)
- [x] `packages/shared/` (source de vérité de la logique partagée)
- [x] Runtime chargé directement depuis `packages/shared/` (`index.html`)
- [x] Source unique figée: `packages/shared` uniquement (legacy `js/shared` retiré).
- [x] Sync strict: `shared:sync` échoue si `packages/shared` est vide (plus de fallback legacy).
- [x] Retrait progressif des scripts legacy `js/shared` (supprimé; runtime + tooling validés sur `packages/shared`).
- [x] `apps/desktop/` (bootstrap Electron + packaging)
- [x] `scripts/release-eagle.js` (bundle store Eagle)
- [x] `scripts/verify-eagle-dist.js` (validation contenu dist Eagle)
- [x] `scripts/verify-locales.js` (cohérence i18n)
- [x] `scripts/verify-builds.js` (smoke vérification)
- [x] `scripts/release-desktop.js` (bundle desktop source package)
- [x] `scripts/verify-desktop-dist.js` (validation contenu dist desktop)

---

## Phases d’implémentation

## Phase 0 - Baseline & sécurité
- [x] Tagger l’état actuel stable: `v-eagle-baseline`.
- [x] Documenter la procédure de release Eagle actuelle.
- [x] Ajouter backups automatiques des données locales en mode dev (timeline/plans/hotkeys) avant migration structurante.

### Critères de sortie
- [x] Retour arrière possible en 1 commande Git.
- [x] Build Eagle actuel inchangé et validé manuellement.

---

## Phase 1 - Contrat plateforme (anti-couplage Eagle)
Créer un contrat `PlatformAPI` pour isoler les dépendances Eagle.

### API cible (minimum)
- [x] `platform.media` (charger images/videos, révéler fichier)
- [x] `platform.storage` (JSON key-value, migration legacy)
- [x] `platform.dialogs` (confirm/open/save/message)
- [x] `platform.window` (min/max/close/pin, si disponible)
- [x] `platform.system` (openExternal, path utils)
- [x] `platform.capabilities` (tags, revealEagle, pinWindow, etc.)

### Tâches
- [x] Créer adapter Eagle qui wrappe `eagle.*` sans changer le comportement.
- [x] Remplacer les appels directs `eagle.*` dans le code applicatif par `platform.*`.
- [x] Ajouter logs d’erreur explicites quand une capability n’est pas dispo.

### Critères de sortie
- [x] Eagle fonctionne pareil qu’avant (smoke tests session + draw + history + modals).
- [x] Aucun appel `eagle.*` en dehors de l’adapter Eagle.

---

## Phase 2 - Extraction du socle partagé
Déplacer la logique pure vers `packages/shared` sans déplacer toute l’UI d’un coup.

### Modules prioritaires à extraire
- [x] Session/timer/state machine.
- [x] Gestion préférences (schéma + migration + defaults).
- [x] Services i18n utilitaires.
- [x] Undo/toasts/dialog orchestration.
- [x] Validateurs payload (timeline/plans/hotkeys).
- [x] Extraction initiale: helpers préférences/session mode vers module partagé `js/shared/preferences-core.js`.
- [x] Extraction shared: factory `js/shared/ui-preferences.js` + branchement `plugin.js` (comportement conservé).
- [x] Extraction shared i18n: utilitaires `js/shared/i18n-utils.js` + branchement `timeline.js`.
- [x] Extraction shared i18n-loader: nouveau module `js/shared/i18n-loader-utils.js` + branchement `plugin.js` (`loadTranslations` via factory partagée avec fallback local conservé).
- [x] Extraction shared session-plans: utilitaires `js/shared/session-plan-utils.js` + branchement `plugin.js`.
- [x] Extraction shared session-metrics: utilitaires `js/shared/session-metrics.js` + branchement `plugin.js` (durée/poses plan + limite mémoire).
- [x] Extraction shared custom-session: utilitaires `js/shared/custom-session-utils.js` + branchement `plugin.js` (next/prev groupes, progression custom, timer total restant).
- [x] Extraction shared session-flow: utilitaires `js/shared/session-flow-utils.js` + branchement `plugin.js` (start session par mode + avance custom).
- [x] Extraction shared timer-tick: utilitaires `js/shared/timer-tick-utils.js` + branchement `plugin.js` (pause custom, mémoire flash, sons tick/end, auto-advance).
- [x] Extraction shared review-session: utilitaires `js/shared/review-session-utils.js` + branchement `plugin.js` (payload historique + compteurs review).
- [x] Extraction shared review-grid: utilitaires `js/shared/review-grid-utils.js` + branchement `plugin.js` (modèle items review + badges durée/annotation).
- [x] Extraction shared review-interactions: utilitaires `js/shared/review-interactions-utils.js` + branchement `plugin.js` (toggle durées + index zoom sûr).
- [x] Extraction shared session-replay: utilitaires `js/shared/session-replay-utils.js` + branchement `timeline.js` + `plugin.js` (mapping session historique -> imageIds/options).
- [x] Extraction shared session-media: utilitaires `js/shared/session-media-utils.js` + branchement `plugin.js` (filtrage media, shuffle, comptage image/vidéo).
- [x] Extraction shared session-media-count-label: extension `js/shared/session-media-utils.js` + branchement `plugin.js` (formatage i18n du libellé de comptage image/vidéo pour chargement initial + replay session).
- [x] Extraction shared session-media-selection: extension `js/shared/session-media-utils.js` + branchement `plugin.js` (résolution source média: items sélectionnés → dossiers sélectionnés → fallback global).
- [x] Extraction shared session-mode-ui: utilitaires `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (plan de transition `switchMode`, panneau gelé relax, sync boutons durée mémoire/classique).
- [x] Extraction shared session-mode-description: extension `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (`resolveModeDescription` pour textes de description des modes avec fallback i18n robuste).
- [x] Extraction shared session-controls: extension `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (règles `updateStartButtonState`, état bouton blur home en mode relax).
- [x] Extraction shared session-time-format: utilitaires `js/shared/session-time-format-utils.js` + branchement `plugin.js` (format compact `h m s` + format clock `m:ss` / `h:mm:ss`).
- [x] Extraction shared session-duration-buttons: utilitaires `js/shared/session-duration-buttons-utils.js` + branchement `plugin.js` (activation/clear des boutons de durée, parsing `data-duration`).
- [x] Extraction shared session-time-input: utilitaires `js/shared/session-time-input-utils.js` + branchement `plugin.js` (parsing H/M/S et M/S centralisé pour modes classique/mémoire/custom).
- [x] Extraction shared custom-queue totals: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (calcul des totaux de steps `pause/pose` pour rendu file custom).
- [x] Extraction shared custom-step-duration: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (conversion durée↔HMS, update d’unité H/M/S, suppression du doublon mort `window.updateStep`).
- [x] Extraction shared custom-step-field-update: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (`window.updateStep` via helper champ entier positif borné).
- [x] Extraction shared custom-queue-drop: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (move/duplicate d’étape lors du drag&drop via helper partagé).
- [x] Extraction shared custom-step-display-model: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (modèle d’affichage pause/pose avec total+h/m/s utilisé par les 2 rendus de la file custom).
- [x] Extraction shared time-input-clamp: extension `js/shared/session-time-input-utils.js` + branchement `plugin.js` (lecture bornes min/max + clamp numérique pour `makeInputScrubbable`).
- [x] Extraction shared custom-step-factory: extension `js/shared/custom-session-utils.js` + branchement `plugin.js` (création/validation d’une step custom `pause/pose` dans `addStepToQueue`).
- [x] Extraction shared progressive-blur-control-state: extension `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (`switchMode`: état visuel disabled/enabled des contrôles progressive blur).
- [x] Extraction shared start-button-ui-state: extension `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (`updateStartButtonState`: état `disabled` + opacité du bouton Start).
- [x] Extraction shared hotkeys-utils: nouveau module `js/shared/hotkeys-utils.js` + branchement `plugin.js` (normalisation payload + collecte/compte des raccourcis custom).
- [x] Extraction shared hotkeys-conflict-detection: extension `js/shared/hotkeys-utils.js` + branchement `plugin.js` (`findHotkeyConflict` par contexte drawing/global).
- [x] Extraction shared hotkeys-apply-reset: extension `js/shared/hotkeys-utils.js` + branchement `plugin.js` (reset defaults, enforcement non-customizable, application des bindings importés).
- [x] Extraction shared hotkeys-display-format: extension `js/shared/hotkeys-utils.js` + branchement `plugin.js` (`formatHotkeyDisplay` avec modificateurs implicites).
- [x] Extraction shared hotkeys-count-fallback-unification: branchement `plugin.js` (`countCustomHotkeys` fallback basé sur `collectCustomHotkeysBindings`).
- [x] Extraction shared hotkeys-wrappers-strict: `plugin.js` délègue strictement `countCustomHotkeys`, `findHotkeyConflict` et `formatHotkeyDisplay` à `packages/shared/hotkeys-utils.js` (fallback inline supprimé).
- [x] Extraction shared main-keyboard-shortcuts-finalization: `plugin.js` délègue `handleKeyboardShortcuts` au module `packages/shared/main-keyboard-shortcuts-utils.js` (fallback inline supprimé).
- [x] Extraction shared settings-screen-shortcuts-finalization: `plugin.js` délègue `handleSettingsScreenKeyboardShortcuts` au module `packages/shared/settings-shortcuts-utils.js` (fallback inline supprimé).
- [x] Extraction shared keyboard-listener-bindings-strict: `plugin.js` utilise `packages/shared/keyboard-listener-bindings-utils.js` comme source unique pour enregistrer les listeners clavier core (fallback inline supprimé).
- [x] Extraction shared action-buttons-bindings-strict: `plugin.js` utilise `packages/shared/action-buttons-bindings-utils.js` comme source unique pour les bindings delete/reveal (fallback inline supprimé).
- [x] Extraction shared session-surface-interactions-bindings-strict: `plugin.js` utilise `packages/shared/session-surface-interactions-bindings-utils.js` comme source unique pour les interactions clic image/overlay mémoire (fallback inline supprimé).
- [x] Extraction shared shuffle-autoflip-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour `random shuffle`/`auto flip` (fallback inline supprimé).
- [x] Extraction shared global-settings-controls-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les contrôles du modal Global Settings (fallback inline supprimé).
- [x] Extraction shared global-settings-actions-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les actions Global Settings (reset/export/import/repair).
- [x] Extraction shared session-entry-mode-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les contrôles d’entrée de session (start/stop/modes/custom queue, fallback inline supprimé).
- [x] Extraction shared classic-memory-type-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les boutons de durée classique + type mémoire (fallback inline supprimé).
- [x] Extraction shared session-plans-modal-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour ouverture/fermeture du modal plans (fallback inline supprimé).
- [x] Extraction shared session-plans-crud-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour save/list actions du modal plans (fallback inline supprimé).
- [x] Extraction shared memory-duration-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour durées mémoire flash/progressive.
- [x] Extraction shared memory-drawing-time-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour temps de dessin/no-pressure mémoire.
- [x] Extraction shared memory-pose-sliders-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour sliders poses mémoire.
- [x] Extraction shared custom-hms-timer-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les inputs H/M/S custom.
- [x] Extraction shared primary-session-controls-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les boutons principaux session (play/navigation/filtres/draw/blur).
- [x] Extraction shared video-controls-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour les contrôles vidéo (play/speed/frame/loop/timeline).
- [x] Extraction shared video-scrubbing-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour le scrubbing horizontal vidéo.
- [x] Extraction shared timer-progress-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour timer/progress bar/context menus.
- [x] Extraction shared memory-overlay-bindings-strict: `plugin.js` utilise `packages/shared/session-controls-bindings-utils.js` comme source unique pour peek/reveal mémoire.
- [x] Extraction shared global-keyboard-shortcuts-strict: `plugin.js` délègue `handleFrameSteppingKeyup`, `handleGlobalThemeKeydown`, `handleGlobalPinKeydown` et `handleGlobalSettingsKeydown` à `packages/shared/global-keyboard-shortcuts-utils.js` (fallback inline supprimé).
- [x] Extraction shared timer-tick-wrappers-strict: `plugin.js` délègue `isCustomPauseTick`, `shouldEnterMemoryHiddenPhaseTick`, `shouldAdvanceFromMemoryHiddenPhaseTick`, `getTickSoundDecision`, `shouldPlayEndSoundTick`, `shouldAutoAdvanceOnTimerEndTick` à `packages/shared/timer-tick-utils.js` (fallback inline supprimé).
- [x] Extraction shared review-wrappers-strict: `plugin.js` délègue les wrappers review (`buildReviewSessionDetailsPayload`, `computeReviewSessionSummary`, `buildReviewGridItemsModel`, `getReviewDurationToggleCopy`, `getReviewDurationToggleTransition`, `normalizeReviewZoomIndex`) aux modules shared review (fallback inline supprimé).
- [x] Extraction shared media-replay-wrappers-strict: `plugin.js` délègue `normalizeSessionReplayLoadOptions`, `filterSessionMediaItems`, `shuffleSessionMediaItems`, `countSessionMediaTypes`, `formatSessionMediaCountLabel`, `resolveSessionMediaSelection` aux modules shared session-media/session-replay (fallback inline supprimé).
- [x] Extraction shared metrics-custom-flow-wrappers-strict: `plugin.js` délègue les wrappers `session-metrics`, `custom-session` et `session-flow` aux modules shared correspondants (fallback inline supprimé).
- [x] Extraction shared session-plan-wrappers-strict: `plugin.js` délègue `clampInt`, `normalizeCustomStep` et `normalizeSessionPlansPayload` à `packages/shared/session-plan-utils.js` (fallback inline supprimé).
- [x] Extraction shared session-plan-save-create-strict: `plugin.js` délègue strictement `getPlanSaveValidation` et `createPlanEntry` à `packages/shared/session-plan-utils.js` (fallback inline supprimé).
- [x] Extraction shared time-input-mode-ui-duration-wrappers-strict: `plugin.js` délègue les wrappers `session-time-input`, `session-duration-buttons` et `session-mode-ui` (`parse/clamp/read`, états progressive blur, ciblage durées mémoire, transition de mode) aux utilitaires shared (fallback inline supprimé).
- [x] Extraction shared ui-render-wrappers-strict: `plugin.js` délègue strictement les wrappers de rendu/labels (`getModeDescription`, `formatDuration`, `formatTime`, `formatReviewDuration`, `isVideoFile`, `isGifFile`, `updateSidebarTooltips`, `resolveMemoryTotalDurationDisplay`) aux modules shared correspondants (fallback inline supprimé).
- [x] Extraction shared start-button-ui-state-strict: `plugin.js` délègue strictement `resolveStartButtonUiState` et `resolveHomeProgressiveBlurState` à `packages/shared/session-mode-ui-utils.js` (fallback inline supprimé).
- [x] Extraction shared storage-diagnostics-wrappers-strict: `plugin.js` délègue strictement `extractTimelineStatsFromData` et `collectGlobalSettingsStorageDiagnostics` à `packages/shared/storage-diagnostics-utils.js` (fallback inline supprimé).
- [x] Extraction shared session-plan-html-summary-strict: `plugin.js` utilise `renderPlansListHtml` et `formatPlanDeleteSummary` depuis `packages/shared/session-plan-utils.js` sans renderer local fallback.
- [x] Extraction shared storage-diagnostics-utils: nouveau module `js/shared/storage-diagnostics-utils.js` + branchement `plugin.js` (stats timeline/plans/hotkeys dans Global Settings via dépendances injectées).
- [x] Extraction shared dom-safety-utils: nouveau module `js/shared/dom-safety-utils.js` + branchement `plugin.js` (`escapeHtml`, `encodeDataToken`, `decodeDataToken`).
- [x] Extraction shared storage-adapter: nouveau module `js/shared/storage-adapter.js` + branchement `plugin.js` (IndexedDB/localStorage + migration + fallback notification).
- [x] Extraction shared runtime-mode-utils: nouveau module `js/shared/runtime-mode-utils.js` + branchement `plugin.js` (`isDesktopStandaloneRuntime`, `getRevealActionI18nKey`).
- [x] Extraction shared runtime-mode-subtitle/media-source: extension `js/shared/runtime-mode-utils.js` + branchement `plugin.js` (`getAppSubtitleI18nKey`, `getMediaSourceAnalyzedI18nKey` pour wording desktop vs Eagle).
- [x] Extraction shared runtime-mode-capability-tags: extension `js/shared/runtime-mode-utils.js` + branchement `plugin.js` (`isTagsFeatureAvailable` + `isCapabilityEnabled` pour compatibilité tags Eagle/Desktop).
- [x] Extraction shared preferences-transfer-utils: nouveau module `js/shared/preferences-transfer-utils.js` + branchement `plugin.js` (`createPrefsBackupFilename`, `downloadJsonPayload`, `pickJsonFileText`).
- [x] Extraction shared preferences-transfer-selection-validation: extension `packages/shared/preferences-transfer-utils.js` + branchement `plugin.js` (`hasAnySectionSelected`, `getAvailableSectionsFromPackage`, `isValidPreferencesPackage`).
- [x] Extraction shared preferences-transfer-wrappers-strict: `plugin.js` délègue strictement les wrappers export/import prefs (`createPrefsBackupFilename`, `downloadJsonPayload`, `pickJsonFileText`, `hasAnyPreferencesSectionSelected`, `getAvailablePreferencesSections`, `isValidPreferencesPackage`) au module shared (fallback inline supprimé).
- [x] Extraction shared platform-access-utils: nouveau module `js/shared/platform-access-utils.js` + branchement `plugin.js` + `timeline.js` (`getPoseChronoPlatform` unifié).
- [x] Extraction shared platform-capability-utils: nouveau module `js/shared/platform-capability-utils.js` + branchement `plugin.js` + `timeline.js` (warn capability manquante unifié).
- [x] Extraction shared platform-ops-utils: nouveau module `js/shared/platform-ops-utils.js` + branchement `plugin.js` + `timeline.js` (`notification.show`, `dialogs.showMessageBox`, `item.getById` unifiés).
- [x] Extraction shared platform-ops-bool: extension `js/shared/platform-ops-utils.js` + branchement `plugin.js` (`clipboard.copyFiles`, `shell.showItemInFolder`, `item.showInFolder`).
- [x] Extraction shared platform-ops-runtime-hooks: extension `js/shared/platform-ops-utils.js` + branchement `plugin.js` (`runtime.onCreate`, `runtime.onRun`, `runtime.onHide`).
- [x] Extraction shared platform-ops-array: extension `js/shared/platform-ops-utils.js` + branchement `plugin.js` (`item.getSelected`, `folder.getSelected`, `item.get`, `tagGroup.get`, `tag.get`).
- [x] Extraction shared platform-window-utils: nouveau module `js/shared/platform-window-utils.js` + branchement `plugin.js` (`window.toggleMaximize`, `window.toggleAlwaysOnTop`).
- [x] Refactor plugin shared-loader: `js/plugin.js` utilise `getSharedFactory(factoryName)` pour centraliser le chargement des `SHARED_*_FACTORY` (maintenance).
- [x] Refactor plugin shared-namespace getter: `js/plugin.js` utilise `getSharedNamespaceValue(key)` pour lire `PoseChronoShared` (maintenance).
- [x] Refactor plugin shared-init wrappers: `js/plugin.js` utilise `initSharedFactory(factoryName, createArgs)` pour centraliser l’instanciation des utilitaires `SHARED_*` (maintenance).
- [x] Refactor plugin shared-missing-logger: `js/plugin.js` utilise `logMissingShared(capabilityKey)` (avec déduplication) pour uniformiser tous les logs d’absence des méthodes shared.
- [x] Refactor plugin shared-call-helper: `js/plugin.js` expose `callPluginSharedMethod(...)` et l’applique aux wrappers utilitaires de base (`dom-safety`, `platform-access`) pour réduire la duplication des guards/fallbacks.
- [x] Refactor plugin platform-ops-wrapper-helper: `js/plugin.js` utilise `platformOpsCallShared(...)` pour dédupliquer les wrappers `platform.*` (runtime/window/dialog/item/tag/clipboard/shell) tout en conservant les fallbacks legacy inchangés.
- [x] Refactor plugin runtime-mode-and-i18n-wrappers: `js/plugin.js` fait passer les wrappers `runtime-mode` et i18n (`translateCountLabel`, `getI18nText`) par `callPluginSharedMethod(...)` avec fallback local conservé.
- [x] Refactor plugin platform-window-shared-guards: `js/plugin.js` fait passer `platformWindowToggleMaximize` / `platformWindowToggleAlwaysOnTop` par `callPluginSharedMethod(...)` (fallback legacy conservé).
- [x] Refactor plugin preferences-transfer-guard-block: `js/plugin.js` fait passer les wrappers `createPrefsBackupFilename`, `downloadJsonPayload`, `pickJsonFileText`, `hasAnyPreferencesSectionSelected`, `getAvailablePreferencesSections`, `isValidPreferencesPackage` par `callPluginSharedMethod(...)`.
- [x] Refactor plugin prefs-core-guard-block: `js/plugin.js` fait passer `normalizeSessionModeValue`, `getDefaultSessionModePrefsUtils` et `normalizeStringArray` par `callPluginSharedMethod(...)` (fallback legacy conservé).
- [x] Refactor plugin storage-factory-bootstrap: `js/plugin.js` initialise `PoseChronoStorage` via `getSharedFactory("createStorageAdapter")` (plus d’accès direct à `window.PoseChronoShared.createStorageAdapter`).
- [x] Refactor plugin i18n-loader-wrapper: `js/plugin.js` délègue `loadTranslations` au helper `callPluginSharedMethod(...)` pour le chemin shared loader (fallback local conservé).
- [x] Refactor timeline shared-loader: `js/timeline.js` utilise `getTimelineSharedSingleton(factoryName, initInstance)` pour centraliser le cache/chargement des utilitaires shared timeline (maintenance).
- [x] Refactor timeline shared-missing-logger: `js/timeline.js` utilise `logMissingTimelineShared(capabilityKey)` (avec déduplication) pour tracer les fallbacks shared sans spam console.
- [x] Refactor timeline shared-call-helper: `js/timeline.js` utilise `callTimelineSharedMethod(...)` pour réduire la duplication des guards `utils/method` sur les wrappers/sanitizers partagés (comportement inchangé).
- [x] Refactor timeline sanitizer-wrappers strict: `js/timeline.js` route `_loadFromLocalStorageKey`, `_listLocalCandidateKeys`, `_loadLocalCandidates`, `_writeTimelineBackup` et `_cloneData` via `callTimelineSharedMethod(...)` (fallback inline conservé, logs unifiés).
- [x] Refactor capability warner factory: `js/plugin.js` et `js/timeline.js` passent par les helpers factory partagés (`getSharedFactory` / `getTimelineSharedFactory`) au lieu d’accès directs à `window.PoseChronoShared.createCapabilityWarner`.
- [x] Refactor plugin i18n fallback helper: `js/plugin.js` centralise la traduction fallback via `getI18nText()` + `createI18nTextGetter()` (remplacement des closures locales `t/i18nDefault` dans menus/modals/hotkeys).
- [x] Refactor plugin dialog queue helper: `js/plugin.js` centralise l’enchaînement des dialogs avec `enqueuePoseChronoDialog(openDialog)` (confirm/storage-repair/preferences-package).
- [x] Refactor plugin shared module bootstrap: `js/plugin.js` centralise l’instanciation des paires `factory/module` via `createSharedFactoryModule()` (session/review/timer/hotkeys inputs).
- [x] Refactor timeline i18n fallback helper: `js/timeline.js` centralise la traduction fallback via `getTimelineI18nText()` et fait de `tl()` un simple wrapper.
- [x] Refactor timeline platform wrappers: `js/timeline.js` centralise les appels plateforme (`dialogs.showMessageBox`, `notification.show`, `item.getById`) via `timelinePlatformCallAsync()`.
- [x] Extraction shared media-type-helpers: extension `js/shared/session-media-utils.js` + branchement `plugin.js` (`isVideoFile` / `isGifFile`, robustesse sur ext manquant).
- [x] Extraction shared i18n-count-helper: extension `js/shared/i18n-utils.js` + branchement `plugin.js` (pluriels via helper `count` pour labels plans).
- [x] Extraction shared default-session-mode-prefs: extension `js/shared/preferences-core.js` + branchement `plugin.js` (load/save du mode par défaut via utilitaire partagé).
- [x] Extraction shared timeline-sanitizer-utils: nouveau module `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (sanitize/normalize payload historique avec schéma versionné).
- [x] Extraction shared timeline-session-validation: extension `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (`_validateSession` via helper partagé).
- [x] Extraction shared timeline-format-utils: nouveau module `js/shared/timeline-format-utils.js` + branchement `timeline.js` (`FormatUtils.number/time/date`).
- [x] Extraction shared timeline-merge-clone: extension `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (`_mergeDayEntries` + `_cloneData`).
- [x] Extraction shared timeline-local-storage-helpers: extension `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (`_mergeTimelineDatas`, `_listLocalCandidateKeys`, `_writeTimelineBackup`).
- [x] Extraction shared timeline-load-local-candidates: extension `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (`_loadFromLocalStorageKey` + `_loadLocalCandidates`, logs de réparation conservés).
- [x] Extraction shared timeline-local-resolution: extension `js/shared/timeline-sanitizer-utils.js` + branchement `timeline.js` (`_loadFromLocalStorage`).
- [x] Extraction shared timeline-date-utils: extension `js/shared/timeline-date-utils.js` + branchement `timeline.js` (`DateUtils.toKey/getToday/isSameDay/isFuture/getMondayBefore/getYearStartDate/diffInDays`).
- [x] Extraction shared timeline-media-utils: nouveau module `js/shared/timeline-media-utils.js` + branchement `timeline.js` (`toFileUrl` + `resolveTimelineImageSrc`).
- [x] Extraction shared timeline-display-utils: nouveau module `js/shared/timeline-display-utils.js` + branchement `timeline.js` (`getDayLabels`, `getMonthLabels`, `getModeLabel`, `formatCustomStructure`).
- [x] Extraction shared timeline-feedback-utils: nouveau module `js/shared/timeline-feedback-utils.js` + branchement `timeline.js` (`openTimelineConfirmDialog`, `showTimelineToast`, `scheduleTimelineUndoAction`).

### Critères de sortie
- [x] Import des modules shared depuis Eagle OK.
- [x] Pas de régression visible sur la version Eagle.

---

## Phase 3 - Pipeline de release séparé (clé pour ne pas mélanger les fichiers)
Construire 2 artefacts distincts depuis le même repo.

### Release Eagle (zip store)
- [x] Créer `scripts/release-eagle.js` avec whitelist stricte.
- [x] Inclure uniquement: `manifest.json`, `index.html`, `css/**`, `js/**`, `_locales/**`, `assets/**`, `logo.png`, `LICENSE`.
- [x] Exclure `js/shared/**` des artefacts (runtime lit `packages/shared/**`).
- [x] Exclure explicitement: `apps/**`, `node_modules/**`, `tasks/**`, docs internes.
- [x] Générer `dist/eagle/posechrono-eagle-X.Y.Z.zip`.

### Release Standalone
- [x] Créer `apps/desktop` (Electron bootstrap).
- [x] Configurer packaging (`electron-builder`) pour Windows `.exe` en priorité.
- [x] Configurer icônes (MVP Windows/Linux validé, macOS différé):
  - [x] `assets/icons/app.ico` (Windows)
  - [x] `assets/icons/app.icns` (macOS, N/A pour MVP Windows; requis avant release macOS)
  - [x] `assets/icons/app.png` (Linux)
- [x] Générer installateur avec option raccourci bureau (Windows).

### Critères de sortie
- [x] Store Eagle reçoit un zip sans fichiers desktop.
- [x] Installateur Windows ne contient pas de dépendance Eagle inutile.

---

## Phase 4 - Standalone fonctionnel (MVP Windows)
Implémenter le minimum viable standalone.

### Fonctionnel MVP
- [x] Sélection dossier images/videos local.
- [x] Session modes: classique/custom/relax/memory.
- [x] Draw + review + history local.
- [x] Préférences globales.
- [x] i18n complet.

### Non MVP (désactivé proprement)
- [x] Tags Eagle spécifiques.
- [x] Fonctions strictement dépendantes de la bibliothèque Eagle.

### Critères de sortie
- [x] Lancement via `.exe` + icône bureau.
- [x] Workflow de session complet sans Eagle.

---

## Phase 5 - Synchronisation des évolutions (process long terme)
Éviter la divergence entre Eagle et Standalone.

### Règles de dev
- [x] Toute feature commune doit d’abord cibler `packages/shared`.
- [x] Toute dépendance plateforme passe par adapter.
- [x] Les fonctions spécifiques doivent être marquées `platform-specific`.

### Règles PR/review
- [x] PR template avec cases:
  - [x] impact Eagle
  - [x] impact Standalone
  - [x] impact shared
- [x] Si feature commune: preuve de test sur les 2 builds.

### Versioning
- [x] Version commune `X.Y.Z`.
- [x] Artefacts:
  - [x] `posechrono-eagle-X.Y.Z.zip`
  - [x] `posechrono-desktop-X.Y.Z-setup.exe`
- [x] Changelog unique avec section Eagle/Desktop.

---

## Phase 6 - CI locale minimale (avant CI cloud)
- [x] `node --check` sur fichiers JS critiques.
- [x] Vérification shared (`verify:shared-sync`) + garde-fou sur absence du legacy `js/shared`.
- [x] Validation JSON locales (clés manquantes/excédentaires selon politique).
- [x] Build `release:eagle`.
- [x] Build `release:desktop` (au moins smoke package en local).
- [x] Script `verify-builds` qui vérifie le contenu des artefacts.

### Critères de sortie
- [x] Impossible de publier un artefact avec mauvais fichiers.
- [x] Détection précoce des régressions i18n et build.

---

## Plan d'exécution concret (ordre recommandé)
1. [x] Phase 0
2. [x] Phase 1
3. [x] Phase 2 (extraction progressive, sans grand big-bang)
4. [x] Phase 3 (double release)
5. [x] Phase 4 (Standalone MVP Windows)
6. [x] Phase 5 (gouvernance dev/review)
7. [x] Phase 6 (automatisation/qualité)

---

## Risques & mitigations
- [x] Risque: régression Eagle pendant extraction.
  - Mitigation: migration par petits lots + smoke test manuel après chaque lot.
- [x] Risque: divergence code Eagle/Desktop.
  - Mitigation: adapter pattern + règle feature commune d'abord en shared.
- [x] Risque: packaging avec mauvais périmètre.
  - Mitigation: whitelist stricte + vérification contenu artefacts.
- [x] Risque: dette i18n.
  - Mitigation: validation automatique des clés avant release.

---

## Vérification finale avant "done"
- [x] Eagle plugin charge et lance une session complète.
- [x] Standalone Windows installe, crée raccourci bureau, démarre correctement.
- [x] Les deux versions partagent bien le même noyau fonctionnel.
- [x] Les artefacts ne contiennent pas de fichiers hors périmètre.

---

## État vérifié du plan (2026-02-16)
- Phase 0 (baseline & sécurité): finalisée (tag baseline + doc release + backup auto dev + rollback one-command).
- Phase 1 (contrat plateforme): finalisée (API cible couverte + adapter actif + smoke manuel Eagle validé).
- Phase 2 (extractions shared): finalisée (source unique `packages/shared`, legacy `js/shared` retiré, vérifs sync/gates actives).
- Phase 3 (pipeline release): en place et validé (gates Eagle/Desktop/Windows + vérification périmètre artefacts, fallback release Windows sur dernier setup existant si build bloqué EPERM).
- Phase 4 (MVP standalone): finalisée (modes session + draw/review/history + préférences + i18n validés en desktop).
- Phase 5 (gouvernance): en place (template PR impact matrix, règles shared/platform-specific, versioning/artifacts unifiés).
- Phase 6 (qualité locale): finalisée pour les gates locales (syntax + i18n + decoupling + build verify).
- Shared packaging: `packages/shared` source de vérité unique (legacy `js/shared` supprimé et bloqué par `verify:shared-sync`).
- Locales: `ru_RU.json` aligné avec la base (suppression des clés extra de pluriel custom).
- Assets release: `assets/icons/app.ico` et `assets/icons/app.png` ajoutés.
- Reste optionnel hors MVP Windows: icône macOS `assets/icons/app.icns` à fournir si packaging macOS activé.
- Stabilisation perf boot (lot micro-opt 2026-02-16): finalisée.
  - Desktop: `webContents.dom-ready` ~398-407ms, `did-finish-load` ~465-483ms, renderer `BootTrace total` ~22-26ms (avg ~23-25ms).
  - Eagle: renderer `BootTrace total` ~8-15ms (avg ~10ms).
  - Préloads lourds (`timeline`, `draw`) sortis du chemin critique (post-boot), plus de spikes 5-6s observés.
  - BootTrace runtime: désactivé par défaut, activable explicitement via `?bootTrace=1` (Eagle) ou `POSECHRONO_BOOT_TRACE=1` (Desktop).

---

## Review Log
- [x] Revue architecture: validée
- [x] Revue release process: validée
- [x] Revue i18n/quality gates: validée
- [x] Revue structure repo/docs: validée (`docs/README.md`, `docs/architecture/repo-map.md`)
- [x] Revue docs vitrine/dev: validée (`README.md` user-facing + `docs/development/developer-guide.md` technique)

---

## Next Product Backlog (Phase 7+)

### Phase 7 - Online Sync Session (host + participants)
- [ ] Rédiger le contrat fonctionnel (host/participant, état synchronisé, erreurs, reconnect).
- [ ] Définir le contrat technique cross-platform (Eagle/Desktop) dans `packages/shared`.
- [ ] Ajouter un module shared de session synchronisée (state + events, sans UI au départ).
- [ ] Ajouter un transport WebSocket abstrait via adapter (mock local d'abord).
- [ ] Ajouter UI minimale: créer/rejoindre session + indicateur de statut.
- [ ] Vérifier manuel Eagle/Desktop (session locale simulée) + non-régression.

### Phase 8 - Similar Pose Search
- [ ] Cadrer le scope MVP (source des embeddings, latence cible, UX).
- [ ] Définir interface moteur de similarité (provider abstrait).
- [ ] Prototyper un premier flux mannequin -> requête -> top résultats.
