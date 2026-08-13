# Demande d'habilitations AWS — projet APS / AWS Step Functions

*Compte **632075073384**, région **eu-west-3** (Paris), rôle actuel
`PowerUserAccess/Farid`. Réécrite le 2026-08-13 : la première version demandait
deux rôles figés, ce qui aurait résolu un cas et rouvert la question à chaque
suivant.*

---

## Le contexte en trois lignes

Nous portons des workflows de publication média (Iconik → S3 → partenaire) sur
**AWS Step Functions**. Les définitions sont écrites et **acceptées par la
console** — 41 états pour la plus grosse, elle s'affiche et se dessine. Il ne
manque que le droit de les **faire tourner**.

`PowerUserAccess` donne accès à tout **sauf IAM**. Or Step Functions et Lambda
exigent chacun un **rôle d'exécution**, et créer un rôle est une action IAM.
C'est le seul et unique blocage.

## Ce que c'est, pour situer la demande

Un **banc d'essai**, pas de la production. Nous validons des mécanismes pour
nos clients : chaque nouveau test veut sa machine d'états, souvent sa Lambda,
parfois un autre domaine Iconik. Une demande d'habilitation par expérience
n'est pas tenable — ni pour nous, ni pour vous. D'où la forme de ce qui suit :
**un cadre une fois, plutôt qu'une autorisation à chaque fois.**

---

## OPTION A — un compte dédié (ce que nous préférons)

Un compte « bac à sable » dans l'organisation, avec `AdministratorAccess`
dessus pour Farid et un **plafond de dépense** (AWS Budgets, alerte + action).

Pourquoi c'est la meilleure forme pour les deux parties :

- le cloisonnement est réel — rien de ce qui s'y fait ne peut toucher au reste ;
- plus aucune demande d'habilitation à traiter, jamais ;
- le coût est borné par construction, et visible séparément ;
- l'offre gratuite Step Functions (**4 000 transitions/mois, sans expiration**)
  couvre largement notre régime : ~80 publications mensuelles gratuites.

Si cette option est retenue, **le reste de ce document est sans objet.**

## OPTION B — la délégation encadrée (si un nouveau compte est exclu)

Le motif standard d'AWS pour laisser une équipe se servir sans lui donner IAM :
une **politique-plafond** (permissions boundary) que l'administrateur écrit une
fois, et le droit de créer des rôles **à condition qu'ils la portent**. Un rôle
que nous fabriquons ne peut alors jamais dépasser ce que vous avez permis.

**B1. Une politique-plafond `APS-Boundary`**, à votre main : ce que nos rôles
auront le droit de faire au maximum. De notre côté le besoin réel est
`states:*`, `lambda:*`, `logs:*`, `events:RetrieveConnectionCredentials`,
`secretsmanager:GetSecretValue`, `dynamodb:*` sur nos tables, tous en
eu-west-3. Aucun besoin d'EC2, de RDS, de réseau, ni d'aucune action IAM.

**B2. Le droit de créer des rôles sous ce plafond**, et seulement là :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreerNosRolesSousLePlafond",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:TagRole"],
      "Resource": "arn:aws:iam::632075073384:role/aps/*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::632075073384:policy/APS-Boundary"
        }
      }
    },
    {
      "Sid": "LesRangerEtLesDefaire",
      "Effect": "Allow",
      "Action": ["iam:DeleteRole", "iam:DeleteRolePolicy", "iam:DetachRolePolicy",
                 "iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies",
                 "iam:ListAttachedRolePolicies"],
      "Resource": "arn:aws:iam::632075073384:role/aps/*"
    },
    {
      "Sid": "LesAttacherAUnService",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::632075073384:role/aps/*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": ["states.amazonaws.com", "lambda.amazonaws.com",
                                  "events.amazonaws.com"]
        }
      }
    },
    {
      "Sid": "NePasPouvoirRetirerLePlafond",
      "Effect": "Deny",
      "Action": ["iam:DeleteRolePermissionsBoundary", "iam:PutRolePermissionsBoundary"],
      "Resource": "*"
    }
  ]
}
```

> **Les deux points qu'on oublie, et qui font échouer la moitié des délégations
> de ce type.** `iam:PassRole` : créer un rôle ne suffit pas, il faut le droit
> de l'**attacher** — sans lui, la création d'une machine d'états échoue même
> quand le rôle existe. Et le **Deny** final : sans lui le plafond s'enlève, et
> la délégation ne vaut rien. Ils sont ici pour que la politique soit
> utilisable du premier coup.

## OPTION C — le strict minimum (si A et B sont refusées)

Deux rôles créés par vos soins, plus `iam:PassRole` sur leurs deux ARN.

**`APS-StepFunctions-Execution`** — confiance sur `states.amazonaws.com` avec
`aws:SourceAccount` = 632075073384. Politique :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "AppelerLesLambdasAPS",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:eu-west-3:632075073384:function:aps-*" },
    { "Sid": "AppelsHttpSortants",
      "Effect": "Allow",
      "Action": "states:InvokeHTTPEndpoint",
      "Resource": "*" },
    { "Sid": "LireLesIdentifiantsDesConnexions",
      "Effect": "Allow",
      "Action": "events:RetrieveConnectionCredentials",
      "Resource": "arn:aws:events:eu-west-3:632075073384:connection/aps-*/*" },
    { "Sid": "LireLeSecretDUneConnexion",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:eu-west-3:632075073384:secret:events!connection/*" },
    { "Sid": "JournaliserLaMachineDEtats",
      "Effect": "Allow",
      "Action": ["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
                 "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy",
                 "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"],
      "Resource": "*" }
  ]
}
```

> **`states:InvokeHTTPEndpoint` sans condition de domaine, et c'est délibéré.**
> Une première rédaction le bornait à `https://*.iconik.io/*`. C'était une
> erreur : nos workflows appellent aussi l'API du partenaire de diffusion, et
> chaque nouvelle intégration serait redevenue une demande à traiter. Le
> garde-fou réel est ailleurs — un appel sortant ne part qu'à travers une
> **EventBridge Connection**, et celles-ci sont bornées par le `Sid` précédent.

**`APS-Lambda-Execution`** — confiance sur `lambda.amazonaws.com`, avec
`AWSLambdaBasicExecutionRole` plus :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:eu-west-3:632075073384:table/aps-*" },
    { "Sid": "LireLesIdentifiantsDunClient",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-west-3:632075073384:secret:aps/*" }
  ]
}
```

Et `iam:PassRole` sur ces deux ARN, avec la même condition
`iam:PassedToService` qu'en B2.

---

## Ce qui N'EST PAS demandé, et pourquoi c'est court

- **Aucun accès S3.** Nos workflows ne déplacent aucun octet : c'est Iconik qui
  pousse vers S3, nous ne faisons que vérifier ce qui est arrivé. Et cette
  vérification passe par notre propre code, avec les identifiants de la
  connexion concernée — pas par le rôle d'exécution. Aucun `s3:*` n'est donc
  nécessaire dans ces politiques.
- **Aucune action IAM en option A**, et en option B uniquement sur le chemin
  `/aps/`, sous plafond, sans pouvoir retirer le plafond.
- **Rien hors eu-west-3.** Rien qui touche au réseau, aux données, ou à
  quoi que ce soit d'existant dans le compte.

## Deux questions annexes

1. Une **frontière d'autorisations** ou un **SCP** au niveau de l'organisation
   risque-t-il d'annuler ces autorisations une fois posées ?
2. Confirmez-vous **eu-west-3** comme région du projet ?

---

*Par ordre de préférence : A, puis B, puis C. Chacune débloque la totalité du
chantier ; seules A et B évitent que la question revienne.*
