# PoseChrono - Plan de Restructuration Multi-Produit (Eagle + Standalone)

## Objectif
Permettre de livrer et maintenir:
- une version **Eagle Plugin** (store Eagle),
- une version **Standalone Desktop** (Windows `.exe` en priorité, puis macOS/Linux),

sans dupliquer la logique métier et sans casser les contraintes Eagle (`manifest.json` + `index.html` à la racine).

## Contraintes non négociables
- [x] Conserver `manifest.json` à la racine pour Eagle.
- [x] Conserver `index.html` racine fonctionnel pour Eagle.
- [ ] Aucune régression fonctionnelle sur le plugin Eagle pendant la migration.
- [ ] Les artefacts publiés ne doivent embarquer que les fichiers nécessaires à leur cible.

## Décision d’architecture (recommandée)
- [x] **Monorepo unique**, avec 2 produits et un socle partagé.
- [x] Version Eagle reste basée sur la racine actuelle.
- [x] Version Standalone dans un dossier dédié (`apps/desktop`).
- [ ] Logique commune extraite progressivement dans `packages/shared`.

### Structure cible
- [x] `manifest.json` (racine, Eagle)
- [x] `index.html` (racine, Eagle)
- [x] `js/`, `css/`, `_locales/`, `assets/` (racine, pendant migration)
- [ ] `packages/shared/` (logique métier et services agnostiques)
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
- [ ] Tagger l’état actuel stable: `v-eagle-baseline`.
- [ ] Documenter la procédure de release Eagle actuelle.
- [ ] Ajouter backups automatiques des données locales en mode dev (timeline/plans/hotkeys) avant migration structurante.

### Critères de sortie
- [ ] Retour arrière possible en 1 commande Git.
- [ ] Build Eagle actuel inchangé et validé manuellement.

---

## Phase 1 - Contrat plateforme (anti-couplage Eagle)
Créer un contrat `PlatformAPI` pour isoler les dépendances Eagle.

### API cible (minimum)
- [ ] `platform.media` (charger images/videos, révéler fichier)
- [ ] `platform.storage` (JSON key-value, migration legacy)
- [ ] `platform.dialogs` (confirm/open/save/message)
- [ ] `platform.window` (min/max/close/pin, si disponible)
- [ ] `platform.system` (openExternal, path utils)
- [ ] `platform.capabilities` (tags, revealEagle, pinWindow, etc.)

### Tâches
- [x] Créer adapter Eagle qui wrappe `eagle.*` sans changer le comportement.
- [x] Remplacer les appels directs `eagle.*` dans le code applicatif par `platform.*`.
- [x] Ajouter logs d’erreur explicites quand une capability n’est pas dispo.

### Critères de sortie
- [ ] Eagle fonctionne pareil qu’avant (smoke tests session + draw + history + modals).
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
- [x] Extraction shared session-mode-ui: utilitaires `js/shared/session-mode-ui-utils.js` + branchement `plugin.js` (plan de transition `switchMode`, panneau gelé relax, sync boutons durée mémoire/classique).
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
- [x] Extraction shared storage-diagnostics-utils: nouveau module `js/shared/storage-diagnostics-utils.js` + branchement `plugin.js` (stats timeline/plans/hotkeys dans Global Settings via dépendances injectées).
- [x] Extraction shared dom-safety-utils: nouveau module `js/shared/dom-safety-utils.js` + branchement `plugin.js` (`escapeHtml`, `encodeDataToken`, `decodeDataToken`).
- [x] Extraction shared storage-adapter: nouveau module `js/shared/storage-adapter.js` + branchement `plugin.js` (IndexedDB/localStorage + migration + fallback notification).
- [x] Extraction shared runtime-mode-utils: nouveau module `js/shared/runtime-mode-utils.js` + branchement `plugin.js` (`isDesktopStandaloneRuntime`, `getRevealActionI18nKey`).
- [x] Extraction shared preferences-transfer-utils: nouveau module `js/shared/preferences-transfer-utils.js` + branchement `plugin.js` (`createPrefsBackupFilename`, `downloadJsonPayload`, `pickJsonFileText`).
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
- [x] Refactor timeline shared-loader: `js/timeline.js` utilise `getTimelineSharedSingleton(factoryName, initInstance)` pour centraliser le cache/chargement des utilitaires shared timeline (maintenance).
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
- [ ] Pas de régression visible sur la version Eagle.

---

## Phase 3 - Pipeline de release séparé (clé pour ne pas mélanger les fichiers)
Construire 2 artefacts distincts depuis le même repo.

### Release Eagle (zip store)
- [x] Créer `scripts/release-eagle.js` avec whitelist stricte.
- [x] Inclure uniquement: `manifest.json`, `index.html`, `css/**`, `js/**`, `_locales/**`, `assets/**`, `logo.png`, `LICENSE`.
- [x] Exclure explicitement: `apps/**`, `packages/**` (sources non nécessaires), `node_modules/**`, `tasks/**`, docs internes.
- [x] Générer `dist/eagle/posechrono-eagle-vX.Y.Z.zip`.

### Release Standalone
- [x] Créer `apps/desktop` (Electron bootstrap).
- [x] Configurer packaging (`electron-builder`) pour Windows `.exe` en priorité.
- [ ] Configurer icônes:
  - [x] `assets/icons/app.ico` (Windows)
  - [ ] `assets/icons/app.icns` (macOS)
  - [x] `assets/icons/app.png` (Linux)
- [x] Générer installateur avec option raccourci bureau (Windows).

### Critères de sortie
- [x] Store Eagle reçoit un zip sans fichiers desktop.
- [ ] Installateur Windows ne contient pas de dépendance Eagle inutile.

---

## Phase 4 - Standalone fonctionnel (MVP Windows)
Implémenter le minimum viable standalone.

### Fonctionnel MVP
- [ ] Sélection dossier images/videos local.
- [ ] Session modes: classique/custom/relax/memory.
- [ ] Draw + review + history local.
- [ ] Préférences globales.
- [ ] i18n complet.

### Non MVP (désactivé proprement)
- [ ] Tags Eagle spécifiques.
- [ ] Fonctions strictement dépendantes de la bibliothèque Eagle.

### Critères de sortie
- [ ] Lancement via `.exe` + icône bureau.
- [ ] Workflow de session complet sans Eagle.

---

## Phase 5 - Synchronisation des évolutions (process long terme)
Éviter la divergence entre Eagle et Standalone.

### Règles de dev
- [ ] Toute feature commune doit d’abord cibler `packages/shared`.
- [ ] Toute dépendance plateforme passe par adapter.
- [ ] Les fonctions spécifiques doivent être marquées `platform-specific`.

### Règles PR/review
- [ ] PR template avec cases:
  - [ ] impact Eagle
  - [ ] impact Standalone
  - [ ] impact shared
- [ ] Si feature commune: preuve de test sur les 2 builds.

### Versioning
- [ ] Version commune `X.Y.Z`.
- [ ] Artefacts:
  - [ ] `posechrono-eagle-X.Y.Z.zip`
  - [ ] `posechrono-desktop-X.Y.Z-setup.exe`
- [ ] Changelog unique avec section Eagle/Desktop.

---

## Phase 6 - CI locale minimale (avant CI cloud)
- [x] `node --check` sur fichiers JS critiques.
- [x] Validation JSON locales (clés manquantes/excédentaires selon politique).
- [x] Build `release:eagle`.
- [x] Build `release:desktop` (au moins smoke package en local).
- [x] Script `verify-builds` qui vérifie le contenu des artefacts.

### Critères de sortie
- [ ] Impossible de publier un artefact avec mauvais fichiers.
- [ ] Détection précoce des régressions i18n et build.

---

## Plan d’exécution concret (ordre recommandé)
1. [ ] Phase 0
2. [ ] Phase 1
3. [ ] Phase 2 (extraction progressive, sans grand big-bang)
4. [ ] Phase 3 (double release)
5. [ ] Phase 4 (Standalone MVP Windows)
6. [ ] Phase 5 (gouvernance dev/review)
7. [ ] Phase 6 (automatisation/qualité)

---

## Risques & mitigations
- [ ] Risque: régression Eagle pendant extraction.
  - Mitigation: migration par petits lots + smoke test manuel après chaque lot.
- [ ] Risque: divergence code Eagle/Desktop.
  - Mitigation: adapter pattern + règle feature commune d’abord en shared.
- [ ] Risque: packaging avec mauvais périmètre.
  - Mitigation: whitelist stricte + vérification contenu artefacts.
- [ ] Risque: dette i18n.
  - Mitigation: validation automatique des clés avant release.

---

## Vérification finale avant "done"
- [ ] Eagle plugin charge et lance une session complète.
- [ ] Standalone Windows installe, crée raccourci bureau, démarre correctement.
- [ ] Les deux versions partagent bien le même noyau fonctionnel.
- [ ] Les artefacts ne contiennent pas de fichiers hors périmètre.

---

## État vérifié du plan (2026-02-15)
- Phase 2 (extractions shared): en cours avancé, lots plugin/timeline critiques déjà extraits.
- Phase 3 (pipeline release): en place et validé par `verify:smoke`.
- Phase 4 (MVP standalone): scaffold OK, reste adaptation fonctionnelle complète.
- Phase 5 (gouvernance): à cadrer (process PR/template/versioning).
- Phase 6 (qualité locale): presque finalisée, gates locales opérationnelles.
- Locales: `ru_RU.json` aligné avec la base (suppression des clés extra de pluriel custom).
- Assets release: `assets/icons/app.ico` et `assets/icons/app.png` ajoutés.

---

## Review Log
- [ ] Revue architecture: validée
- [ ] Revue release process: validée
- [ ] Revue i18n/quality gates: validée
