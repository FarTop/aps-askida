# Pense-bête — refaire les deux essais AWS

*Région **eu-west-3** (Paris) — à vérifier en haut à droite avant tout.*

---

## Essai 1 — créer la machine d'états

Console → **Step Functions** → Machines d'état → **Créer une machine d'état**

| Champ | Valeur |
|---|---|
| Modèle | Créer à partir de zéro |
| Définition | onglet **Code**, coller `scripts/sonde-jsonata.json` |
| Nom | `APS-sonde-formes` |
| Type | **Standard** |
| Rôle d'exécution | **Saisir un ARN de rôle** ↓ |
| Journalisation | **OFF** |

```
arn:aws:iam::632075073384:role/APS-StepFunctions-Execution
```

> Colle la **sonde**, pas `_journaux/asl-publish.json`. La sonde est déjà validée
> en console : si ça rate, c'est l'IAM et rien d'autre. La définition complète
> est en JSONata depuis le 14/08 et n'a jamais été soumise — un échec y serait
> ambigu.

> Le menu « choisir un rôle existant » reste **inerte** tant que `iam:ListRoles`
> manque. C'est **« Saisir un ARN de rôle »**, la 3e entrée du menu.

**Attendu** : création acceptée.
**Si ça rate** : `iam:PassRole` → document 1 de `iam-politiques-a-appliquer-2026-08-14.md`.

---

## Essai 2 — créer la connexion EventBridge

```
https://eu-west-3.console.aws.amazon.com/events/home?region=eu-west-3#/connections
```

**Créer une connexion**

| Champ | Valeur |
|---|---|
| Nom de la connexion | `aps-iconik` |
| Type d'API | Publique |
| Configuration de l'autorisation | Configuration personnalisée |
| Type d'autorisation | **Clé API** |
| Nom de clé de l'API | `Auth-Token` |
| Valeur | *le jeton Iconik* |
| Chiffrement | Utiliser une clé détenue par AWS |

Puis déplier **Paramètres Http d'appel** → **Ajouter un paramètre** :

| Paramètre | Clé | Valeur |
|---|---|---|
| En-tête confidentiel | `App-ID` | *l'identifiant d'application Iconik* |

> `Auth-Token` avec un **A majuscule** — c'est ce qu'envoie le client d'APS
> (`server/engine/wfd-engine-iconik-client.js:30`). Les en-têtes HTTP sont
> insensibles à la casse en théorie ; autant ne pas tester la théorie.

**Où sont les deux valeurs** : APS → **Administration → Connexions**, sur la
connexion Iconik. Ou dans Iconik : *Settings → Application tokens*.

**Attendu** : connexion créée.
**Si ça rate** : `events:CreateConnection` → document 2 (la frontière).

---

## Essai 3 — ce qui vient juste après

Copier l'**ARN de la connexion** (il finit par un UUID) et me le donner : il
remplace le `00000000-0000-0000-0000-000000000000` dans
`scripts/emettre-asl.js:67`.

Ne pas lancer d'exécution avant ça — le premier `http:invoke` échouerait sur
l'ARN factice, et ce ne serait pas un verdict.
