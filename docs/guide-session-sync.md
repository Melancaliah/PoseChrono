## Resume rapide

| Etape | Hote                                                      | Invite                      |
| ----- | --------------------------------------------------------- | --------------------------- |
| 1     | Trouver son IP (`ipconfig`)                               | -                           |
| 2     | Lancer le relais (`npm run sync:relay -- --host 0.0.0.0`) | -                           |
| 3     | Entrer l'adresse du serveur                               | Entrer l'adresse du serveur |
| 4     | Creer la session                                          | -                           |
| 5     | Communiquer le code                                       | Rejoindre avec le code      |
| 6     | Televerser les poses                                      | Telecharger les poses       |
| 7     | Lancer la session                                         | Profiter !                  |

# Faire une session de dessin a deux (synchronisation)

Ce guide explique comment lancer une session PoseChrono synchronisee entre deux ordinateurs connectes au meme reseau (meme box / meme Wi-Fi).

**Principe :** un des deux ordinateurs fait office de **serveur relais** et d'**hote de session**. L'autre ordinateur **rejoint** la session. Le timer, les poses et l'avancement se synchronisent en temps reel.

---

## Ce qu'il faut

- Deux ordinateurs connectes au **meme reseau** (meme Wi-Fi ou meme box)
- PoseChrono installe sur les deux (plugin Eagle ou version desktop)
- Un dossier d'images/references de poses (sur l'ordinateur hote)

---

## Etape 1 - Trouver l'adresse IP de l'hote

Sur l'ordinateur qui va heberger la session :

1. Ouvrir un terminal (taper `cmd` dans la barre de recherche Windows)
2. Taper la commande : `ipconfig`
3. Chercher la ligne **Adresse IPv4** sous votre connexion active (Wi-Fi ou Ethernet)
4. Noter l'adresse

---

## Etape 2 - Lancer le serveur relais

Toujours sur l'ordinateur hote :

1. Ouvrir l'explorateur de fichiers et naviguer jusqu'au dossier de PoseChrono
2. Cliquer dans la **barre d'adresse** en haut de l'explorateur (la ou le chemin du dossier est affiche)
3. Taper `cmd` puis appuyer sur **Entree** — un terminal s'ouvre directement dans le bon dossier
4. Dans ce terminal, lancer la commande :

```
npm run sync:relay -- --host 0.0.0.0
```

3. Le terminal affiche :

```
[sync-relay] listening on ws://0.0.0.0:8787
```

> **Important :** ne pas fermer ce terminal tant que la session est en cours. Le serveur tourne dedans.

> **Pare-feu :** si Windows demande d'autoriser Node.js a communiquer sur le reseau, cliquer sur **Autoriser l'acces** (reseaux prives).

---

## Etape 3 - Configurer l'adresse du serveur

Sur **les deux ordinateurs** :

1. Ouvrir PoseChrono
2. Cliquer sur le bouton **Sync** (icone Wi-Fi) pour ouvrir le panneau de synchronisation
3. Dans le champ **Adresse du serveur**, taper :

```
ws://IP:8787
```

> Remplacer `IP` par l'adresse IP notee a l'etape 1.

4. Appuyer sur **Entree** ou cliquer sur le bouton de validation (coche)
5. La page se recharge automatiquement avec la nouvelle adresse

> **Note :** cette adresse est memorisee. Pas besoin de la retaper a chaque fois tant que l'adresse IP de l'hote ne change pas.

---

## Etape 4 - Creer la session (ordinateur hote)

Sur l'ordinateur hote :

1. Ouvrir le panneau Sync
2. Verifier que l'onglet **Hote** est selectionne
3. Cliquer sur **Creer la session**
4. Un **code de session** apparait (ex: `G44W-H8ZN`)
5. Communiquer ce code a l'autre personne

Le statut doit afficher :

```
Hebergement G44W-H8ZN (0 participants)
Reseau : connecte (ws://IP:8787)
```

---

## Etape 5 - Rejoindre la session (autre ordinateur)

Sur l'autre ordinateur :

1. Ouvrir le panneau Sync
2. Selectionner l'onglet **Rejoindre**
3. Entrer le **code de session** communique par l'hote
4. (Optionnel) Entrer un pseudo
5. Cliquer sur **Rejoindre la session**

Le statut doit passer au vert et afficher :

```
Connecte a G44W-H8ZN
```

---

## Etape 6 - Partager les images

Pour que les deux ordinateurs affichent les memes references :

### Sur l'ordinateur hote :

1. Charger vos images/poses normalement dans PoseChrono
2. Dans le panneau Sync, cliquer sur **Televerser les poses**
3. Attendre la fin du transfert

### Sur l'autre ordinateur :

1. Dans le panneau Sync, cliquer sur **Telecharger les poses**
2. Attendre la fin du transfert
3. Les images de l'hote sont maintenant chargees

---

## Etape 7 - Lancer la session de dessin

L'hote lance la session normalement (choix du mode, de la duree, etc.). Le timer et les changements de pose se synchronisent automatiquement sur les deux ecrans.

---

## Depannage

### "Session not found" quand l'invite rejoint

- Verifier que les deux ordinateurs ont la **meme adresse** dans le champ serveur
- Verifier que le code de session est bien saisi (majuscules, tiret)
- Verifier que le serveur relais tourne toujours dans le terminal

### La connexion ne s'etablit pas

- Verifier que les deux ordinateurs sont sur le **meme reseau Wi-Fi / Ethernet**
- Verifier le pare-feu Windows : Node.js doit etre autorise sur les reseaux prives
- Tester dans un navigateur sur l'autre ordinateur : ouvrir `http://IP:8787/health` — si une reponse JSON s'affiche, le reseau fonctionne

### L'adresse IP a change

L'adresse IP locale peut changer si la box redonne une nouvelle adresse. Dans ce cas, repeter l'etape 1 et mettre a jour l'adresse dans le champ serveur sur les deux ordinateurs.

> **Astuce :** pour eviter ca, vous pouvez configurer une **IP fixe** sur l'ordinateur hote dans les parametres reseau de Windows, ou attribuer un bail statique dans l'interface de votre box.

### Le serveur relais se ferme tout seul

Ne pas fermer le terminal. Si le terminal est ferme par erreur, relancer la commande de l'etape 2 et recrer la session.

---
