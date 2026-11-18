# Perfect Darts — Contrôles terrain & positionnement concurrentiel

Document à utiliser avec l'APK `dist/app.apk` (build Phases 2-3).
Coche chaque scénario sur l'appareil. En cas d'échec : note le n° du scénario,
l'étape exacte, l'heure et une capture, puis repars d'une installation propre
(si le bug persiste après réinstall, il est réel).

Raccourci de saisie : P = passe, E = échec → note.

---

## PARTIE 1 — Checklist de terrain

### A. Installation & premier lancement (6)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T01 | Installer l'APK depuis le fichier (sources inconnues) | Installation < 30 s, icône créée |
| T02 | Premier lancement depuis le launcher | Écran d'accueil < 1 s, aucun blanc |
| T03 | Mode avion AVANT le premier lancement | Aucun blocage, aucune erreur visible |
| T04 | Accueil en plein soleil (luminosité max) | Titre, compteur de progression et sous-titres lisibles |
| T05 | Rotation portrait → paysage sur l'accueil | Pas de scroll horizontal, onglets En ligne / Statistiques / Réglages accessibles |
| T06 | Fermeture forcée puis relance | Réouverture propre sur l'accueil |

### B. Configuration de partie (10)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T07 | Stepper joueurs de 1 à 6 dans les deux sens | Plafond 6, plancher 1 |
| T08 | 6 joueurs sur petit écran, saisie des noms | Champs tous visibles, pas d'écrasement |
| T09 | Noms laissés vides | Défauts « Joueur n », pas de champ vide en jeu |
| T10 | Noms saisis, app relancée | Suggestions re-proposées (favoris + dernière partie) |
| T11 | Sélecteur de mode 301 → 1001 | Champ finish présent, double-in apparaît/reste |
| T12 | Mode Cricket | Champ cut-throat visible, pavé Cricket, leaderboard |
| T13 | Mode Around | Sélecteur variante 1/2/3 visible |
| T14 | Mode Bob's 27 / Catch 40 / Highscore | Bot et liste de joueurs masqués, pavé scores rapides masqué |
| T15 | Solo : slider bot 20 → 120 pas à pas | Label suit le doigt, valeur conservée après relance |
| T16 | Double-in coché, app relancée | Case restée cochée |

### C. Modes X01 (12)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T17 | 501 : volée T20 T20 T20 | 321, 3 fléchettes, moyennes à jour |
| T18 | Depuis 41 : T20 T20 (reste 1) | BUST immédiat, score inchangé, tour passé |
| T19 | Depuis 41 : T20 (négatif) | BUST, score inchangé |
| T20 | Depuis 32 : 16 simple puis 32 simple | BUST « finish sans double » |
| T21 | Depuis 32 : D16 | CHECKOUT, overlay victoire, son |
| T22 | Depuis 50 : DBull | CHECKOUT avec la route affichée |
| T23 | Volée 180 | Compteur 180 incrémenté, son « perfect » |
| T24 | quickScore(100) pendant une volée en cours | Refusé par toast, volée intacte |
| T25 | Départs 301 et 901 | Scores initiaux exacts |
| T26 | Double-in : volée T20 T20 T20 sans double | 501 intact, 3 fléchettes comptées (moyenne) |
| T27 | Double-in : T20 puis D20 puis 20 | 60 déduits seulement, ouverture mémorisée |
| T28 | Double-in : bust avant ouverture puis double à la volée suivante | Score inchangé au bust, compte à partir du double |

### D. Cricket (8)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T29 | 3 simples sur 20 | 3 marques, pas de points tant que l'adversaire a 20 ouvert |
| T30 | 1 triple sur 20 | 20 fermé d'un seul dart |
| T31 | T20 sur 20 fermé par moi, ouvert chez l'adversaire | 60 points crédités |
| T32 | 20 fermé chez TOUS, jet des surplus | Aucun point |
| T33 | 15-20+25 fermés + meilleur score | Victoire déclarée |
| T34 | Cut-throat : T20×3 sur 20 adverse ouvert | +60 au score ADVERSE, pas au mien |
| T35 | Cut-throat : victoire au plus bas score | Condition vérifiée |
| T36 | Bull simple et DBull au pavé | 25 / 50 comptés correctement |

### E. Around the Clock (5)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T37 | Cible 1 touchée (simple) | Passe à 2 |
| T38 | 5 sur cible 2 | Reste à 2 |
| T39 | Variante 2 : simple refusé puis double accepté | Progression seulement sur double |
| T40 | Cible 20 touchée | Passage au BULL |
| T41 | Bull réussi | Victoire |

### F. Entraînement (9)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T42 | Bob's 27 : D1 ×3 | 33 points (+6) |
| T43 | Bob's 27 : D2 totalement raté | 29 (−4), tour passe à 3 |
| T44 | Bob's 27 : simple sur D3 (cible du tour) | Non compté, −6 |
| T45 | Bob's 27 : score descend ≤ 0 | Fin immédiate, échec |
| T46 | Bob's 27 : DBull au tour 20 | +50, fin de partie, score final affiché |
| T47 | Catch 40 : volée 100 puis volée 0 | 3 vies → 2 vies, cœurs mis à jour |
| T48 | Catch 40 : 0 vie | Échec, overlay cohérent |
| T49 | Highscore : 10 volées | Fin automatique, total exact |
| T50 | Entraînement terminé | Aucune trace dans les stats de carrière (hors carrière) |

### G. Bot (5)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T51 | Bot 20 sur une partie complète | Peu de points, jamais de 3×T20, pas de gel |
| T52 | Bot 120 sur une partie complète | Moyenne élevée, checkouts rapides, partie < 15 volées souvent |
| T53 | Bot entre 32 et 50 restants | Tente les vraies routes (D16, D20, 10 D20…) |
| T54 | Bot à 10 restant | Alterne D5 / setups, sans gel ni fin erronée |
| T55 | Double out : le bot ne gagne jamais sur un simple | Jamais de sortie non-double |

### H. Sauvegarde / reprise / undo (7)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T56 | Bouton home en pleine partie puis retour | Bannière « Reprendre » visible |
| T57 | Reprendre avec une volée pleine en cours | Volée soldée proprement |
| T58 | Reprendre avec 1-2 fléchettes en volée | Volée restaurée puis complétée |
| T59 | Undo dès le 1er dart | Fléchette annulée, moyennes et cibles à jour |
| T60 | Undo après fin de volée | Retour au tour précédent, score réintégré |
| T61 | Undo pendant le tour du bot | Refusé proprement, tour du bot intègre |
| T62 | Sauvegarde corrompue | Aucun crash, bannière masquée |

### I. Voix / sons / vibration (6)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T63 | Synthèse locale disponible | Annonces locales, aucun appel réseau |
| T64 | Synthèse locale absente, voix FR par Internet | Audio joué, 2e annonce servie depuis le cache |
| T65 | Mode avion pendant la voix | Repli silencieux, aucun spam de requêtes |
| T66 | Contenus : score, bust, checkout, « il reste » | Chaque type annoncé correctement |
| T67 | Sons off + volume à 0 | Silence réel, pas de latence résiduelle |
| T68 | Vibration off/on | Cohérence du feedback haptique |

### J. Réglages & thèmes (7)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T69 | Accents orange → bleu → vert → violet → blanc | Changement immédiat, persistant |
| T70 | Thème clair : navigation stats / HUD / overlay | Toutes les surfaces lisibles, texte AA |
| T71 | Thème clair en plein soleil | Titres et cartes lisibles |
| T72 | OLED activé / désactivé | Noirs profonds, retour propre |
| T73 | Accent blanc + thème sombre | Symboles lisibles sur les boutons primaires |
| T74 | Réinitialiser les réglages | Défauts (sombre, orange, voix en) confirmés |
| T75 | Thème clair puis sombre puis clair, rotations entre-temps | Aucun mélange incohérent |

### K. En ligne (7)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T76 | Hôte : code + QR générés | QR scannable depuis un autre téléphone |
| T77 | Client : rejoindre par code | Siège assigné, état fusionné |
| T78 | Lancement de la partie par l'hôte | Clients suivent la partie (état verrouillé) |
| T79 | Client joue une fléchette | Elle apparaît côté hôte |
| T80 | Wi-Fi client coupé 3 s puis rétabli | Reprise sans dart dupliqué |
| T81 | Hôte quitte en pleine partie | Client informé proprement, pas de crash |
| T82 | Lancement de partie avec socket ouvert | Socket survit (jamais de close() au launch) |

### L. Robustesse (6)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T83 | 10 rotations portrait/paysage en pleine partie | État intègre, aucun doublon de joueur |
| T84 | Taps très rapides sur le pavé | Maximum 3 fléchettes, aucun état incohérent |
| T85 | 60 min de jeu continu | Pas de lag croissant (pas de fuite mémoire) |
| T86 | Interrupt le tour du bot 5 fois | Aucun gel de la rotation |
| T87 | Reprise après économiseur de batterie | Aucun rendu cassé |
| T88 | Vérifier les stats après 1 h | Pourcentages cohérents avec les données du match |

### M. Performance perçue (4)

| N° | Scénario | Résultat attendu |
|----|----------|------------------|
| T89 | Lancement → interactive (2e ouverture) | < 1 s |
| T90 | Tap pavé → feedback visuel + son | < 100 ms |
| T91 | Défilement HUD à 6 joueurs | Fluide, pas de dépassement hors cadre |
| T92 | « Réduire les animations » activé dans Android | Animations réduites (prééférence système respectée) |

Total : 92 points de contrôle.

---

## PARTIE 2 — Positionnement vs les références du marché

Échelle : ●●● = au niveau de la référence · ●●○ = partiel · ●○○ = minimal · ○ = absent.
Positionnement assumé : **compteur solo/soirée + entraînement**, pas plateforme de compétition.

| # | Critère | Perfect Darts | DartCounter | My Dart Training | DartConnect |
|---|---------|:---:|:---:|:---:|:---:|
| 1 | X01 complet (301→1001, double in/out) | ●●● | ●●● | ●●● | ●●● |
| 2 | Cricket (+ cut-throat) | ●●● | ●●● | ●●● | ●●● |
| 3 | Around the Clock (variantes 1/2/3) | ●●● | ●●○ | ●●● | ●●○ |
| 4 | Catalogue d'entraînement | ●●○ (3 modes) | ●●○ | ●●● (15+) | ●●○ |
| 5 | Bob's 27 | ●●● | ●●● | ●●● | ●●○ |
| 6 | Bot à moyenne libre | ●●● (20-120) | ●●● (20-120) | ●●● (15 niveaux) | ●●● |
| 7 | Bot adaptatif | ○ | ○ | ●○○ | ●●● |
| 8 | Réalisme checkout du bot | ●●○ | ●●● | ●●○ | ●●● |
| 9 | Stats de match (moy., CO%, 180) | ●●● | ●●● | ●●● | ●●● |
| 10 | First 9 / PPR | ●●● | ●●● | ●●● | ●●● |
| 11 | MPR (cricket) | ●●● | ●●● | ●●● | ●●● |
| 12 | Distribution des volées | ●●○ (4 casiers) | ●●● | ●●● | ●●● |
| 13 | Carrière multi-joueurs | ●●○ | ●●● | ●●● | ●●● |
| 14 | Export / partage des stats | ●●○ (partage natif) | ●●● | ●●● | ●●● |
| 15 | Jeu en ligne temps réel | ●●○ (code + QR, LAN) | ●●● (global) | ●○○ | ●●● |
| 16 | Tournois / ligues | ○ | ○ | ○ | ●●● |
| 17 | MasterCaller nommé | ○ (TTS neutre) | ●●● (Ray Martin) | ●●● (Kirk Bevins) | ○ |
| 18 | Cible tactile interactive | ●●● | ●●○ | ●○○ | ○ |
| 19 | Auto-scoring caméra | ○ (délibéré) | ●●● (Target Omni) | ○ | ●●● |
| 20 | Poids installé | ●●● (2.8 MB) | ●○○ (~30 MB+) | ●○○ | ●●○ |
| 21 | 100 % offline, sans compte | ●●● | ○ (compte requis) | ●●○ | ●●○ |
| 22 | Gratuité du socle | ●●● | ●●○ | ●●○ | ●○○ |
| 23 | Vitesse de saisie (pad + scores rapides) | ●●● | ●●○ | ●●● | ●●● |
| 24 | Thèmes (clair/sombre/OLED/accents) | ●●● | ●●○ | ●●○ | ●○○ |
| 25 | Fiabilité de saisie (undo, busts, doubles taps) | ●●● | ●●● | ●●● | ●●● |

**Lecture.** Sur sur : plus léger (×10), zéro compte, zéro réseau requis, cible tactile, saisie rapide, thèmes. Au niveau sur : le socle comptage + stats de match + bot libre. Derrière sur : bot adaptatif, largeur d'entraînement, online global, tournois, caller nommé, auto-scoring — axes hors périmètre (serveur, licences ou matériel propriétaire).

---

## PARTIE 3 — Roadmap v3 (ordre de rentabilité)

1. **Bot adaptatif** — ajuste botAvg ±10 selon l'écart de moyenne constaté. Coût faible, vraie différenciation (DartConnect seul le fait vraiment).
2. **3 modes d'entraînement forts** — 121, Finishing 50, doubles en série. Sans écran de config dédié.
3. **Onglet Entraînement** séparé du jeu, avec résumé de session.
4. **Caller paramétrable** — débit, style d'annonces, option « checkouts seuls ».
5. **Tournoi local 4/8 joueurs** — bracket généré, suivi des matchs, zéro serveur.
6. **Online via relais optionnel** — serveur léger hébergé, pas de P2P fragile.
7. **Jamais (assumé)** — auto-scoring caméra : matériel propriétaire Target, hors métier.
