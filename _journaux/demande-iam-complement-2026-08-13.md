# APS / AWS — il manque deux autorisations

*Compte **632075073384**, région **eu-west-3**. Jeu d'autorisations
`APS-permissions-test`. Fait suite à la demande du 2026-08-13 — inutile de la
rouvrir, tout ce qui est nécessaire est ici.*

---

## Merci, et où nous en sommes

Le rôle `APS-StepFunctions-Execution` est en place et nous pouvons le désigner.
Nous chargeons une définition de machine d'états de 38 états, la console
l'accepte et la dessine.

Il reste **deux autorisations** pour qu'une machine d'états puisse être créée
puis exécutée. Elles sont indépendantes et se posent à deux endroits
différents — c'est le seul point délicat, et il est expliqué plus bas.

---

## 1 — `iam:PassRole`, au jeu d'autorisations `APS-permissions-test`

Créer un rôle et l'**attacher** à un service sont deux actions distinctes.
Vous avez créé le rôle ; il nous manque le droit de le passer à Step Functions.

```
Utilisateur : arn:aws:sts::632075073384:assumed-role/AWSReservedSSO_APS-permissions-test_ec6a7009e48b2d94/APS
Action      : iam:PassRole
Ressource   : arn:aws:iam::632075073384:role/APS-StepFunctions-Execution
Contexte    : no identity-based policy allows the action
```

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AttacherLesRolesAPS",
    "Effect": "Allow",
    "Action": "iam:PassRole",
    "Resource": [
      "arn:aws:iam::632075073384:role/APS-StepFunctions-Execution",
      "arn:aws:iam::632075073384:role/APS-Lambda-Execution"
    ],
    "Condition": {
      "StringEquals": {
        "iam:PassedToService": ["states.amazonaws.com", "lambda.amazonaws.com"]
      }
    }
  }]
}
```

La condition restreint le droit à ces deux services : le rôle ne peut être
passé à rien d'autre. `APS-Lambda-Execution` est nommé par anticipation — s'il
n'existe pas encore, retirez la ligne, nous reviendrons vers vous le moment
venu.

## 2 — `events:CreateConnection`, à la frontière d'autorisations

Nos workflows appellent l'API d'Iconik. L'authentification ne se met pas dans
la définition : elle passe par une **EventBridge Connection**, qui range les
identifiants dans Secrets Manager. C'est le mécanisme recommandé par AWS, et
c'est ce qui nous évite d'écrire un jeton en clair où que ce soit.

```
Utilisateur : arn:aws:sts::632075073384:assumed-role/AWSReservedSSO_APS-permissions-test_ec6a7009e48b2d94/APS
Action      : events:CreateConnection
Ressource   : arn:aws:events:eu-west-3:632075073384:connection/aps-iconik
Contexte    : no permissions boundary allows the events:CreateConnection action
```

À ajouter à la frontière, en eu-west-3 :

```
events:CreateConnection
events:UpdateConnection
events:DeleteConnection
events:DescribeConnection
events:ListConnections
```

---

## Le point à ne pas manquer : les deux ne se posent pas au même endroit

Les deux messages d'erreur ne disent pas la même chose, et c'est ce qui décide
du geste :

| Message d'AWS | Ce qu'il faut modifier |
|---|---|
| *no identity-based policy allows* | le **jeu d'autorisations** |
| *no permissions boundary allows* | la **frontière d'autorisations** |

**Une frontière ne donne rien, elle plafonne.** Donc `iam:PassRole` ajouté au
jeu d'autorisations restera sans effet si la frontière n'autorise pas
`iam:PassRole` non plus. Le point 1 demande vraisemblablement les deux gestes ;
le point 2, seulement la frontière.

C'est ce qui nous a valu plusieurs allers-retours de notre côté, et c'est
pourquoi nous le signalons plutôt que de vous laisser le découvrir.

---

## Deux ajouts pendant que vous y êtes — pour ne pas revenir

Ni l'un ni l'autre ne bloque aujourd'hui.

**Confort.** `iam:ListRoles` et `iam:GetRole` en lecture. Sans eux le menu
« choisir un rôle existant » de la console est inerte et nous saisissons les
ARN à la main, ce qui marche mais se prête aux fautes de frappe.

**Prochaine étape prévisible.** Nous déploierons trois fonctions Lambda
(`aps-essences`, `aps-lookup`, `aps-registry`). Si la frontière ne couvre pas
`lambda:CreateFunction`, `lambda:UpdateFunctionCode` et
`lambda:UpdateFunctionConfiguration` en eu-west-3, nous reviendrons vous voir
pour ça — autant le régler maintenant si c'est sans difficulté.

---

*Rien de tout ceci ne sort d'eu-west-3, ne touche au réseau, ni à quoi que ce
soit d'existant dans le compte.*
