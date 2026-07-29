# Journal APS — 2026-07-29

> Session en deux temps : **fin du chantier Administration** (contexte org,
> Ressources, Connexion→org, vue Organisations + patrimoine, cohérence visuelle),
> puis **socle du nouveau paradigme VodFactory** (Manifeste + Packager + moteur
> natif serveur). Récit chronologique. État technique → `cartographie-aps` ;
> processus et garde-fous → `methode-travail-aps`.

## Fil de la session

### Administration — cohérence visuelle (matin)
- **Header cohérent partout** (`navbar.css` partagé) : fond sombre + liseré +
  `.aps-header-center` remontés dans le partagé (replis `--header-bg`/`--border`).
  Fin des divergences. **Piège CRLF** sur navbar.css : `git am` échoue en boucle
  → livré en **fichier complet**, pas en patch.
- **Carte Ressources** puis **carte Organisations** ajoutées à l'accueil.
- **Fond Ressources** aligné (`#0f1011`) : tokens `--adm-*` inventés localement →
  réalignés sur la palette commune.
- **Sélecteur de contexte** : fond translucide illisible hors canvas → fond sombre
  **opaque autonome** (ne dépend plus des tokens `--bd-*`).
- Fil rouge : 3 fois le même problème (composant dépendant de tokens locaux
  absents ailleurs). Remède noté : **feuille de tokens partagée** (avec la make-up).

### Administration — Connexion → Organisation (étape 7, décision A)
- Cadrage : une connexion appartient à l'**org** (patrimoine), indépendante de la
  plateforme source (cas S3 depuis n'importe quelle source). Partage inter-org
  (Partner) = chantier futur, à mûrir.
- **Migration douce en 3 temps** : orgId ajouté (nullable) + backfill déterministe
  (`orgId = Environment.orgId`), envId conservé. Temps 3 (retrait envId) reporté.
- WFD intact : `fmt()` n'expose ni envId ni orgId → changement de clé invisible.
  Vérifié : connexions se chargent, WFD ne voit rien changer.

### Administration — vue Organisations + patrimoine
- Écran « org au sommet » (additif, l'écran Plateformes reste). `/api/organisations`
  enrichi : plateformes+environnements, puis **connexions + ressources** (jamais de
  secret). Patrimoine complet lisible d'un coup d'œil.

### VodFactory — cadrage du nouveau paradigme
- Restitution de la stratégie (sessions passées) : **Manifeste** décrit ce qui est
  livré (essences + cardinalité + sortie), objet nommé réutilisable = ressource
  d'org. **Packager** = mécanisme métier qui assemble les **essences éclatées**
  (artworks, audio, subs…) selon cardinalité. Frontière : manifeste décrit,
  packager assemble+vérifie, workflow publie à qui.
- Décisions actées : **gate = résidu de test** (supprimé) ; **ID** = calcul lisible
  (Transform timestamp+aléa) MAIS relation Iconik↔APS stockée dans le registre
  **BayardRegistry** (pas de balayage Iconik, pas de délai) ; **export
  multi-orchestrateur** (Node-RED/n8n/Make/Amazon) = **boussole**, pas contrainte.
- **Déclenchement réel** (config 29/07) : custom actions Iconik au niveau
  **COLLECTION** (clic droit), pas asset. 6 flux : CREER SERIE/SAISON/UNITAIRE/
  EPISODE, **PUBLISH V2 = 76 nœuds** (étalon 76→10), STATUSES 11.
- Réflexion épistémo : Iconik ne peut prouver la généralité (biais de l'acquis) →
  il sera l'**oracle de correction** (régénérer Iconik par le futur pipeline API
  Builder), une plateforme neuve prouvera la généralité. Voir carto.

### VodFactory — socle moteur natif (serveur, indépendant de WFD)
- `pivot-manifest.js` : structure + `valider` + `resumer` (narratif). Testé sur
  PUBLISH V2 réel (6 nœuds S3 identiques = 1 manifeste).
- `pivot-packager.js` : `assembler` (reconnaissance + cardinalité) + `resumer`.
  Requirable serveur ET client.
- `s3-service.js` : **SDK officiel** `@aws-sdk/client-s3` (ouvre le plus de champ :
  sert aussi le futur navigateur de buckets). `deposer`/`lister`/`tete`.
- `package-executor.js` + `iconik-service.js` (collecte collection→assets→files) +
  route `package.js` (`/api/package`).
- **Test réel OK** : collecte d'une collection Bayard (QA) → `nbFichiers: 4`,
  reconnaissance par nom OK, cardinalité OK.

### ERREUR DE MÉTHODE (à ne pas reproduire — voir methode)
- ~30% de la session brûlés à investiguer le `NEED_TO_GET_AUTH` et un mécanisme
  de transfert média **inexistant**. Ce workflow **ne manipule AUCUN octet, il fait
  UNIQUEMENT du pilotage API.** Iconik pousse via export location, APS orchestre et
  vérifie par listing. C'était balisé + documenté + visible dans WFD.
- Correction : `package-executor` réécrit en **pilotage API pur**
  (`verifierParListing` : constate S3, cardinalité sur le réel ; plus de
  `s3.deposer`). Route alignée (`/verifier-s3`, `/livrer` = constat, pas dépôt).

## État en fin de session
Socle moteur VodFactory complet et **cohérent avec le paradigme réel** (pilotage
API). Reste : écran de composition du manifeste (ressource d'org) + nœud Deliver
dans le Builder (déclenche export location + `/verifier-s3`). Analyse fine des 76
nœuds de PUBLISH V2 à faire (session fraîche, coûteuse).
