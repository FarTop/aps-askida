# APS / AWS — les deux politiques à appliquer

*Compte **632075073384**, région **eu-west-3**. Jeu d'autorisations
`APS-permissions-test` (IAM Identity Center). Documents prêts à coller.*

---

## Où va quoi, et pourquoi deux endroits

Le diagnostic est net, parce qu'AWS ne donne pas la même cause dans les deux cas :

| Action tentée | Cause donnée par AWS | Conclusion |
|---|---|---|
| `iam:PassRole` | *no **identity-based policy** allows* | le jeu d'autorisations n'a pas IAM |
| `events:CreateConnection` | *no **permissions boundary** allows* | la frontière est plus étroite que le jeu |

Autrement dit : **le jeu d'autorisations est large** (il laisse passer Step
Functions, Lambda, EventBridge en lecture — un profil de type PowerUser, qui
exclut IAM par construction), et **c'est la frontière qui plafonne**.

Conséquence pratique, et c'est le seul piège de l'opération :

> **Une frontière ne donne rien, elle plafonne.** Une action doit être autorisée
> par le jeu **et** par la frontière pour passer. `iam:PassRole` manque des
> deux côtés : il figure donc dans les deux documents ci-dessous. Ce n'est pas
> une redite.

---

## Document 1 — à AJOUTER au jeu d'autorisations `APS-permissions-test`

Le droit d'attacher les rôles d'exécution déjà créés. Rien d'autre.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AttacherLesRolesAPS",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::632075073384:role/APS-StepFunctions-Execution",
        "arn:aws:iam::632075073384:role/APS-Lambda-Execution"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "states.amazonaws.com",
            "lambda.amazonaws.com"
          ]
        }
      }
    },
    {
      "Sid": "LireLesRolesPourLesChoisirDansLaConsole",
      "Effect": "Allow",
      "Action": ["iam:ListRoles", "iam:GetRole"],
      "Resource": "*"
    }
  ]
}
```

`APS-Lambda-Execution` est nommé par anticipation : il servira au premier
déploiement de Lambda. S'il n'existe pas encore, retirez la ligne.

Le second bloc est du **confort, pas un blocage** : sans lui, le menu « choisir
un rôle existant » de la console reste inerte et les ARN se saisissent à la
main. Retirez-le si une lecture globale des rôles vous gêne.

---

## Document 2 — la FRONTIÈRE d'autorisations, en entier

À poser comme *permissions boundary* du jeu `APS-permissions-test`. Ceci est le
document complet : il remplace la frontière actuelle plutôt que de s'y ajouter.

Tout est borné à **eu-west-3** sauf IAM, qui est un service global et n'accepte
pas de condition de région.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MonterEtFaireTournerLesMachinesDEtats",
      "Effect": "Allow",
      "Action": "states:*",
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-west-3" } }
    },
    {
      "Sid": "DeployerEtAppelerNosLambdas",
      "Effect": "Allow",
      "Action": "lambda:*",
      "Resource": "arn:aws:lambda:eu-west-3:632075073384:function:aps-*"
    },
    {
      "Sid": "ListerLesLambdasDansLaConsole",
      "Effect": "Allow",
      "Action": ["lambda:ListFunctions", "lambda:GetAccountSettings"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-west-3" } }
    },
    {
      "Sid": "LesConnexionsAuthentifiees",
      "Effect": "Allow",
      "Action": [
        "events:CreateConnection",
        "events:UpdateConnection",
        "events:DeleteConnection",
        "events:DescribeConnection",
        "events:ListConnections",
        "events:RetrieveConnectionCredentials"
      ],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-west-3" } }
    },
    {
      "Sid": "LesSecretsQueLesConnexionsFabriquent",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:TagResource"
      ],
      "Resource": [
        "arn:aws:secretsmanager:eu-west-3:632075073384:secret:events!connection/*",
        "arn:aws:secretsmanager:eu-west-3:632075073384:secret:aps/*"
      ]
    },
    {
      "Sid": "RelireCeQuiSestPasse",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
        "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy",
        "logs:DescribeResourcePolicies", "logs:DescribeLogGroups", "logs:DescribeLogStreams",
        "logs:GetLogEvents", "logs:FilterLogEvents"
      ],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-west-3" } }
    },
    {
      "Sid": "NosTablesEtRienDautre",
      "Effect": "Allow",
      "Action": "dynamodb:*",
      "Resource": "arn:aws:dynamodb:eu-west-3:632075073384:table/aps-*"
    },
    {
      "Sid": "AttacherLesRolesAPS",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::632075073384:role/APS-StepFunctions-Execution",
        "arn:aws:iam::632075073384:role/APS-Lambda-Execution"
      ]
    },
    {
      "Sid": "LeRoleLieAuServiceDesConnexionsEventBridge",
      "Effect": "Allow",
      "Action": "iam:CreateServiceLinkedRole",
      "Resource": "arn:aws:iam::632075073384:role/aws-service-role/apidestinations.events.amazonaws.com/AWSServiceRoleForAmazonEventBridgeApiDestinations",
      "Condition": {
        "StringEquals": {
          "iam:AWSServiceName": "apidestinations.events.amazonaws.com"
        }
      }
    },
    {
      "Sid": "LireLesRoles",
      "Effect": "Allow",
      "Action": ["iam:ListRoles", "iam:GetRole", "iam:ListAttachedRolePolicies"],
      "Resource": "*"
    },
    {
      "Sid": "VoirQuiJeSuis",
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity", "iam:ListAccountAliases"],
      "Resource": "*"
    }
  ]
}
```

### Ce qui n'y est PAS, et c'est délibéré

- **Aucune création ni modification de rôle** (`iam:CreateRole`,
  `iam:PutRolePolicy`, `iam:AttachRolePolicy`…). Nous nous passons de créer des
  rôles : les vôtres suffisent. Nous demandons seulement à les **attacher**.

  *La seule exception est le `iam:CreateServiceLinkedRole` ci-dessus, et elle
  n'en est pas vraiment une.* Un rôle lié à un service n'est pas un rôle qu'on
  écrit : AWS le prédéfinit, seul EventBridge peut l'assumer, et sa politique
  ne peut être attachée à rien d'autre. La condition le borne à ce seul rôle et
  à ce seul service. C'est **EventBridge qui le crée**, en notre nom, la
  première fois qu'une connexion est créée dans le compte — la politique
  managée `AmazonEventBridgeFullAccess` d'AWS contient exactement ce bloc, pour
  cette raison.

  **C'est un besoin de PREMIÈRE FOIS.** Une fois le rôle présent dans le
  compte, plus aucune connexion n'en a besoin. Si vous préférez, créez
  vous-même une connexion EventBridge quelconque : le rôle apparaîtra, et ce
  bloc pourra être retiré. Le résultat est le même.
- **Aucun `s3:*`.** Nos workflows ne déplacent aucun octet, et la vérification
  de ce qu'Iconik a livré passe par notre propre code, avec les identifiants de
  la connexion concernée — pas par le rôle d'exécution.
- **Rien hors eu-west-3**, rien sur le réseau, rien sur l'existant du compte.
- **Aucun `events:PutEvents` ni règle EventBridge** : nous n'utilisons
  d'EventBridge que ses *Connections*, comme coffre à identifiants.

---

## Après application — les cinq essais, dans l'ordre

À faire côté APS ; chacun échoue de façon distincte si une pièce manque.

| # | Geste | Attendu | Si ça rate |
|---|---|---|---|
| 1 | Step Functions → créer une machine d'états, **rôle existant** `APS-StepFunctions-Execution` | création acceptée | `iam:PassRole` — document 1 · ✅ **obtenu le 14/08** |
| 2 | EventBridge → Connexions → créer `aps-iconik` (clé API) | connexion créée, secret rangé | `events:CreateConnection` ✅ puis `iam:CreateServiceLinkedRole` ← **c'est là que ça bloque** |
| 3 | Copier l'ARN de la connexion, le poser dans la définition | — | — |
| 4 | Démarrer une exécution | le premier appel HTTP part authentifié | `events:RetrieveConnectionCredentials` sur le RÔLE, pas sur nous |
| 5 | Relire l'exécution dans la console | historique état par état | rien à faire, c'est natif en workflow *Standard* |

L'essai 4 est le seul qui prouve quelque chose de neuf : jusqu'ici la console a
toujours **accepté** nos définitions sans que rien n'ait jamais tourné.

---

*Une question annexe, si elle se pose de votre côté : un **SCP** au niveau de
l'organisation peut annuler tout ceci sans qu'aucun message ne le dise
clairement. Si les essais 1 et 2 échouent encore après application, c'est la
première piste.*
