# Journal — 2026-08-13 (soir) — le jour où ASL a cessé d'être muet

*Seconde session du 13. La première avait réglé le flux de données ASL et bâti
les comptes ; celle-ci ouvre l'accès AWS et retourne l'émetteur.*

---

## Ce qu'on croyait vrai et qui ne l'était pas

Le fichier `CLAUDE.md` portait, comme principe de conception :

> ASL has no global namespace — a workflow relying on ambient variables is not
> translatable to it at all.

**C'est faux.** Step Functions a `Assign` / `$maVariable` et JSONata comme
langage de requête, et la documentation est explicite : *« Parallel branches and
Map iterations can access variable values from outer scopes »*.

Cette phrase avait une descendance. Tout l'échafaudage du « contrat d'entrée du
Map » — `traversantes`, `besoinsDuCorps`, la projection à la main dans
l'`ItemSelector` — existait pour contourner une contrainte qui n'existe pas. Il
a été retiré dans la journée et remplacé par un `Pass` qui NOMME ce que la
boucle emprunte : un état de plus, et un contrat qui se lit dans le graphe au
lieu de se cacher dans la définition du Map.

La leçon n'est pas « la doc a changé ». Elle est : **une contrainte de cible
notée une fois se périme, et personne ne va la revérifier tant qu'elle sert de
prémisse.** Celle-ci datait du 12 août — elle avait un jour.

## La conversion, et ce qu'elle a rendu possible

`ResultPath` devient `Assign`. `Variable` + comparateur devient `Condition` —
et les 20 opérateurs du pivot passent désormais, contre 18, parce que
`$contains` accepte un littéral regex. `filebase()` cesse d'être intraduisible.
`{now}` devient `$now()`.

Un gain qu'on n'avait pas anticipé : **une référence absente lève
`States.QueryEvaluationError`** au lieu de lire du vide. Le langage rattrape
maintenant ce que notre contrôle « sans porteur » traquait à la main.

## `appel()` — le catalogue déclare enfin les appels HTTP

L'émetteur Make n'a jamais eu besoin de savoir quelle URL Iconik répond à quoi :
Make avait des modules natifs, l'adresse était l'affaire du module. ASL n'a que
`http:invoke`. Cette connaissance manquait donc à *tous* les émetteurs sans que
ça se voie — et comme elle ne dépend d'aucune cible, elle vit au catalogue.

Une façade déclare la **liste ordonnée** de ses requêtes. Le vocabulaire s'est
construit verbe après verbe, chacun en réclamant juste ce dont il avait besoin :

| mécanisme | né de |
|---|---|
| `fusionne` | Iconik n'accepte que PUT : écrire trois champs effacerait les autres |
| `tolereAbsence` | une vue jamais initialisée répond 404, le moteur le pardonne |
| `pourChaque` | `foreach` : un Map, pas un appel |
| `codesToleres` | 409 « existe déjà » n'est pas un échec |
| `sauterSi` | `skipIfEmpty` |
| `journal` | `history` ALLONGE un champ, il ne le remplace pas |
| `nonDecrit` | un appel qu'on ne sait pas décrire garde sa place, marqué |

**Le compteur** qui va avec est ce qui compte le plus : à chaque émission,
combien d'états retombent sur le gabarit générique. **31 le matin, 20 le soir.**
Mesuré, pas estimé.

## Le chiffre qui dit tout : 1 → 7

`vodfactory.partner` sortait en **un** état générique. La séquence réelle en
compte **sept** : cinq boucles sur des listes de personnes, puis le contenu,
puis la vidéo. PUBLISH est passé de 46 à 63 états en déclarant ce seul verbe.

C'est exactement le genre de chiffre qu'APS existe pour produire. Un état
générique ne coûte rien à émettre et cache l'ordre, le nombre et la nature de ce
qui se passe.

## Deux arbitrages revus en cours de route

**Le tout-ou-rien.** J'avais posé qu'une séquence dont une étape est
indescriptible ne s'émet pas du tout. En la voyant tourner, j'ai changé d'avis :
six états justes plus un marqué « non décrit », à sa place dans la chaîne, en
disent beaucoup plus qu'un seul état pour sept appels. La règle des aiguillages
— *ce qui trie faux est pire que ce qui manque* — s'applique dans l'autre sens
pour ce qui manque : **ce qui manque se montre**.

**Le listing S3.** `--listing lambda` est devenu le défaut, et l'arbitrage ne
s'est pas joué au prix (0,09 $ d'écart sur 1000 runs). Il s'est joué quand la
console a refusé de générer la politique S3 : en natif, c'est le RÔLE de la
machine d'états qui liste, et sur le bucket d'un client aucune politique de
notre côté ne suffit — il faut une action de son propriétaire. Une négociation
par client. En Lambda, un nouveau client redevient une ligne en base.

## Le slug, ou pourquoi un émetteur n'améliore rien

JSONata ne sait pas normaliser l'Unicode. Traduire `_wfdSlugify` demandait donc
une table de translittération — et une table écrite à la main aurait été fausse.
Elle a été **dérivée de la règle du moteur** (tout caractère latin dont NFD rend
une seule lettre ASCII), puis vérifiée par balayage exhaustif de U+0020 à
U+024F : zéro écart.

Ce qu'elle ne contient pas compte autant. `œ`, `æ`, `ß`, `ł` ne se décomposent
pas en NFD : le moteur les écrase en tiret. « Sœur » devient `s-ur`. Ma première
table donnait `soeur` — plus joli, et **faux** : c'est un `external_id` chez le
partenaire, une clé d'identité. Deux implémentations qui « améliorent »
différemment ne se retrouvent plus.

## L'accès AWS : sept refus, et ce qu'ils apprennent

La journée a consisté, pour moitié, à franchir des portes IAM une par une :

```
iam:CreateRole              no permissions boundary allows
iam:ListRoles               no permissions boundary allows
iam:PassRole                no identity-based policy allows   → obtenu
events:CreateConnection     no permissions boundary allows    → obtenu
iam:CreateServiceLinkedRole caller does not have sufficient…  → obtenu
secretsmanager:UpdateSecret user is not authorized…           → contourné
iam:GetRole                 no identity-based policy allows   → bloque encore
```

**Le motif de l'erreur désigne le geste**, et c'est le seul enseignement qui se
transpose : *no permissions boundary allows* → élargir la frontière ; *no
identity-based policy allows* → compléter le jeu d'autorisations. Une frontière
ne donne rien, elle plafonne : une action doit passer les deux.

Et une erreur de rédaction, la nôtre, qui se reproduira au prochain client si on
ne la note pas : la demande initiale listait ce dont les **rôles** ont besoin à
l'exécution, jamais ce dont l'**opérateur** a besoin pour construire
(`events:CreateConnection`). La frontière plafonne les deux. Il faut énumérer ce
que le banc *fabrique*, pas seulement ce qu'il *exécute*.

## Le premier run réel du chantier — et son échec utile

`sonde-auth.json` : un seul appel, en lecture seule, sur le point d'Iconik qui
répond « qui êtes-vous ». Le plus petit test possible, choisi pour qu'un échec
soit lisible.

Il a échoué en 20 ms :

> The principal states.amazonaws.com is not authorized to assume the provided
> role.

Ce n'est pas la définition. C'est la **relation d'approbation** du rôle — qui
dit *qui a le droit de l'endosser*, et qu'on confond volontiers avec la
politique d'autorisations, qui dit *ce qu'il peut faire*. Le défaut ne se voit
ni à la création de la machine d'états, ni au dessin : uniquement quand une
tâche a besoin des identifiants.

Le mécanisme, lui, a fonctionné : `TaskScheduled` pointait bien sur la connexion
EventBridge.

## Ce que la console a validé, et ce qu'elle ne prouve pas

PUBLISH entier en JSONata : **65 états, 122 expressions, aucune erreur.** Trois
choses s'y jouaient et tiennent — les Map **imbriqués** (les cinq boucles du
Partner vivent dans le corps de la boucle principale), les liaisons `$l := …`
de la syntaxe de bloc, et `$sift` avec une lambda à deux paramètres.

Le dessin a même appris quelque chose d'inattendu : un `skipIfEmpty` traduit
devient un **embranchement visible**, là où le moteur natif le cache dans une
condition interne. La cible rend ici le workflow plus lisible que l'original.

**Et ça ne prouve que la forme.** La journée a fourni deux contre-exemples
imparables : la console a dit oui quand l'ARN de connexion était un UUID de
zéros, et quand l'URL du partenaire pointait sur `app.iconik.io`. Deux
définitions parfaitement valides et parfaitement fausses.

## Ce que les contrôles ont attrapé

Le contrôle « sans porteur » a payé cinq fois : le `Catch` d'étape qui écrasait
la tolérance au 404 ; `{now}` émis en variable au lieu de fonction ;
`{trigger.X}` pris pour un chemin alors que c'est une variable PLATE dont le nom
contient un point ; la racine nommée `trigger` alors que le moteur pose
`_trigger` ; et un faux négatif que j'avais moi-même introduit une heure plus
tôt — un `Pass` assignant `ancestorPath: {% $ancestorPath %}`, une variable qui
se lit elle-même et rendait le contrôle aveugle.

Il a aussi crié à tort deux fois, sur `$v` puis sur `$l`/`$a` : les deux façons
qu'a une expression JSONata de déclarer un nom. **Un faux positif use un
contrôle aussi sûrement qu'un faux négatif l'aveugle**, et c'est le sens
d'erreur qu'on préfère.

## À côté

- **Import de spécification en YAML.** La machine existait (OpenAPI, Postman) ;
  seul le parseur manquait, et l'en-tête `Accept` réclamait déjà
  `application/yaml`. L'OpenAPI du partenaire est en base : 57 opérations.
- **Un bouton « copier » sur les secrets** de l'écran Connexions. APS chiffre
  ces valeurs et ne les rendait lisibles nulle part ; récupérer un jeton
  demandait de passer par la console du navigateur.
- **Une erreur de date sur toute la session** : j'ai daté fichiers et
  commentaires du 14 alors qu'on était le 13. Corrigé, sauf un message de commit
  déjà poussé.

## La direction, arrêtée en fin de session

Le mot de la fin appartient au maintainer, et il déplace la cible :

> *« Je veux pouvoir créer des machines depuis APS. Le but étant de ne pas avoir
> besoin d'aller sur AWS, à part si incidents — mais ça reste, à mon sens, un
> travail d'IT. On a des architectes certifiés AWS ; moi, je veux tout faire à
> partir des builders. »*

Ce n'est pas un élargissement du périmètre, c'est la suite prévue. J'ai eu le
tort de parler d'APS « passant de lecteur à acteur » sur AWS — c'était faux :
APS écrit depuis toujours, et l'émission vers un orchestrateur tiers a déjà eu
lieu chez Make, app et scénarios compris.

Et l'écran existe déjà. `wf-interpreter.js` porte un sélecteur de cible où `asl`
figure, et son en-tête annonçait la suite depuis le 11 août : *« un plan, au
sens de `terraform plan`. Lire et approuver d'abord, soumettre ensuite — deux
gestes, pas un. »* Le second geste n'a jamais été construit ; pour Make,
l'émission s'est faite en ligne de commande.

Il manque trois choses : une clé (utilisateur IAM dédié — un rôle n'a pas de
clé), un `sfn-service.js` sur le modèle de `s3-service.js`, et le bouton
**Soumettre** dans l'Interpréteur *avec le retour du run dans le Builder*. Sans
ce dernier point, on aurait déplacé le clic sans supprimer l'aller-retour.

La fiche Infrastructure de la plateforme et sa connexion sont créées, inactives,
en attente de la clé.

**MCP a été écarté, après vérification.** `stepfunctions-tool-mcp-server` existe
mais fait l'inverse : il expose des machines d'états déjà créées comme outils
pour un agent. Un serveur de gestion n'est qu'une RFC. Les serveurs génériques
sauraient créer, mais MCP existe pour qu'une IA *choisisse* un outil — APS sait
exactement lequel appeler, et n'a pas besoin d'une couche de sélection.

Ce serveur mérite quand même d'être noté, pour une raison qui n'était pas au
programme : il rend une machine d'états **invocable par un agent**. Le jour où
PUBLISH tournera sur AWS, un tag suffira pour que le workflow qu'APS a émis
devienne un outil. C'est l'image en miroir du chantier.

## Demain

Un copier-coller de l'admin sur la relation d'approbation, et le premier run
réel de PUBLISH devient possible. Ensuite, dans l'ordre : la clé et
`sfn-service.js`, puis `history` en mode `update`, `verify`,
`resolve_ancestors`, et la première Lambda.
