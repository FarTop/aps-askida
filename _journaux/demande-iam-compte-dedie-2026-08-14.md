# Nouveau compte AWS — deux points à confirmer

*2026-08-14. Fait suite à `demande-iam-aws-2026-08-13.md` et à son complément.*

> **RÉPONDU LE JOUR MÊME — ce document est conservé pour la trace, ses deux
> questions sont closes.**
>
> **Point 2** : c'était une bévue, reconnue — « je me suis emmêlé les pinceaux
> et créé l'user aps-iam dans le mauvais account, je refais ». Il n'y a donc PAS
> de compte dédié à ce stade, et j'avais conclu trop vite en lisant « on va
> tenter la version A » : la phrase parlait des DROITS, pas du compte. La clé
> livrée a été supprimée dans la foulée — d'où un `InvalidClientTokenId` surgi
> quinze minutes après un test vert, sans que rien ne bouge côté APS.
>
> **Point 1** : accordé pour le test. Sa remarque était fondée — nous avions
> fourni une policy précise la veille avant de réclamer le full admin le
> lendemain. La réponse : ce sont deux options distinctes du même document, pas
> une surenchère. L'**option B** (policy précise) vise un compte PARTAGÉ, où le
> moindre privilège protège les voisins ; l'**option A** (`AdministratorAccess`)
> vise un compte DÉDIÉ. Dans un compte dédié vide, le moindre privilège ne
> protège plus grand-chose et coûte un aller-retour par capacité manquante.

Merci pour l'utilisateur `aps-iam` et la clé — elle fonctionne, elle est en
place dans APS, et APS parle à Step Functions.

Deux points seulement, et le banc tourne.

---

## 1. Le compte a changé — on confirme que c'est voulu ?

La clé livrée appartient au compte **975049904888** :

```
arn:aws:iam::975049904888:user/aps-iam
```

Tout ce qui a été monté le 13 août vit dans le compte **632075073384** : le rôle
`APS-StepFunctions-Execution`, les deux connexions EventBridge (`aps-iconik`,
`aps-vodfactory-preprod-api`) et la machine d'états `APS-sonde-formes`. Le
nouveau compte est vide — `ListStateMachines` y répond zéro.

C'est cohérent avec « pour le test on va tenter la version A » : l'**option A**
de notre document du 13, c'était précisément *un compte dédié*, et c'est celle
que nous préférions. **On part donc du principe que 975049904888 est le banc
d'essai à partir de maintenant**, et on y refait le nécessaire — dis-nous
seulement si ce n'est pas le cas.

À refaire dans le nouveau compte, de notre côté et sans intervention :
les deux connexions EventBridge, et la machine d'états.

---

## 2. Les droits annoncés ne sont pas encore actifs

Ce qui est attaché aujourd'hui est le jeu partiel de l'option B. Constaté :

| Appel | Résultat |
|---|---|
| `states:ListStateMachines` | ✅ passe |
| `events:ListConnections` | ❌ *no identity-based policy allows* |
| `iam:GetRole` | ❌ *no identity-based policy allows* |

`AdministratorAccess` sur `aps-iam` — ce que tu annonçais — lève les trois d'un
coup, et nous n'aurons plus rien à demander : APS crée le rôle et sa relation
d'approbation, les connexions EventBridge, les machines d'états, et les lance.
C'est exactement l'objectif du chantier — que rien ne passe par la console.

---

## 3. Le rôle, si tu le recrées toi-même

Sa relation d'approbation doit autoriser Step Functions à l'endosser. C'est le
point qui bloquait hier ; l'erreur ne surgit qu'à l'exécution, jamais à la
création — d'où le temps qu'elle prend à trouver.

```json
{ "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "states.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "aws:SourceAccount": "975049904888" } }
  }] }
```

Avec `AdministratorAccess`, nous l'écrivons nous-mêmes — ce paragraphe ne sert
que si tu préfères garder la main dessus.

---

*Nom Bitwarden suggéré, comme tu le proposais :*
`AWS — aps-iam — banc d'essai APS (975049904888)`
