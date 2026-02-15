# PoseChrono - Plan de Restructuration Multi-Produit (Eagle + Standalone)

## Objectif
Permettre de livrer et maintenir:
- une version **Eagle Plugin** (store Eagle),
- une version **Standalone Desktop** (Windows `.exe` en priorité, puis macOS/Linux),

sans dupliquer la logique métier et sans casser les contraintes Eagle (`manifest.json` + `index.html` à la racine).

## Contraintes non négociables
- [ ] Conserver `manifest.json` à la racine pour Eagle.
- [ ] Conserver `index.html` racine fonctionnel pour Eagle.
- [ ] Aucune régression fonctionnelle sur le plugin Eagle pendant la migration.
- [ ] Les artefacts publiés ne doivent embarquer que les fichiers nécessaires à leur cible.

## Décision d’architecture (recommandée)
- [ ] **Monorepo unique**, avec 2 produits et un socle partagé.
- [ ] Version Eagle reste basée sur la racine actuelle.
- [x] Version Standalone dans un dossier dédié (`apps/desktop`).
- [ ] Logique commune extraite progressivement dans `packages/shared`.

### Structure cible
- [ ] `manifest.json` (racine, Eagle)
- [ ] `index.html` (racine, Eagle)
- [ ] `js/`, `css/`, `_locales/`, `assets/` (racine, pendant migration)
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
- [ ] Session/timer/state machine.
- [ ] Gestion préférences (schéma + migration + defaults).
- [ ] Services i18n utilitaires.
- [ ] Undo/toasts/dialog orchestration.
- [ ] Validateurs payload (timeline/plans/hotkeys).

### Critères de sortie
- [ ] Import des modules shared depuis Eagle OK.
- [ ] Pas de régression visible sur la version Eagle.

---

## Phase 3 - Pipeline de release séparé (clé pour ne pas mélanger les fichiers)
Construire 2 artefacts distincts depuis le même repo.

### Release Eagle (zip store)
- [x] Créer `scripts/release-eagle.js` avec whitelist stricte.
- [x] Inclure uniquement: `manifest.json`, `index.html`, `css/**`, `js/**`, `_locales/**`, `assets/**`, `logo.png`, `LICENSE`.
- [x] Exclure explicitement: `apps/**`, `packages/**` (sources non nécessaires), `node_modules/**`, `tasks/**`, docs internes.
- [ ] Générer `dist/eagle/posechrono-eagle-vX.Y.Z.zip`.

### Release Standalone
- [x] Créer `apps/desktop` (Electron bootstrap).
- [ ] Configurer packaging (`electron-builder`) pour Windows `.exe` en priorité.
- [ ] Configurer icônes:
  - [ ] `assets/icons/app.ico` (Windows)
  - [ ] `assets/icons/app.icns` (macOS)
  - [ ] `assets/icons/app.png` (Linux)
- [ ] Générer installateur avec option raccourci bureau (Windows).

### Critères de sortie
- [ ] Store Eagle reçoit un zip sans fichiers desktop.
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
- [ ] `node --check` sur fichiers JS critiques.
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

## Review Log
- [ ] Revue architecture: validée
- [ ] Revue release process: validée
- [ ] Revue i18n/quality gates: validée
