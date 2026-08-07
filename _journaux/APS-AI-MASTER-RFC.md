# APS-AI MASTER RFC

Version: 1.0
Status: Working Draft

---

# Executive Summary

APS AI est une capacité native d'Askida Platform Studio destinée à capitaliser l'expertise, les méthodes, les modèles et les connaissances accumulées autour d'APS.

L'objectif n'est pas de construire un chatbot mais un système unifié capable d'assister :

- le développement ;
- l'architecture ;
- la documentation ;
- la formation ;
- la modélisation ;
- la traduction de workflows ;
- l'analyse de plateformes ;
- la conception de systèmes.

Le principe fondateur est :

> Construire une mémoire APS plutôt qu'entraîner un modèle APS.

---

# Principes Fondateurs

## Le savoir est plus important que le modèle

LLM interchangeable.

Connaissance APS persistante.

## Offline First

APS AI doit fonctionner sans Internet.

## Internet comme source d'acquisition

La documentation externe peut être ingérée.

La vérité reste dans APS.

## Agnosticisme

APS reste indépendant des produits.

Les concepts priment sur les implémentations.

---

# Architecture Générale

```text
+------------------------------------------------+
|                APS STUDIO                      |
+------------------------------------------------+
| Designer | Mapper | Docs | Git | Workflows     |
+------------------------------------------------+
|                  APS AI                        |
+------------------------------------------------+
| Agents | Search | Discovery | Reasoning        |
+------------------------------------------------+
| Knowledge Graph | RAG | Semantic Layer         |
+------------------------------------------------+
| Git | Docs | APIs | RFC | Logs | Platforms     |
+------------------------------------------------+
| Vector DB | PostgreSQL | File Storage          |
+------------------------------------------------+
| Ollama / Future Models                         |
+------------------------------------------------+
```

---

# APS Knowledge Base

## Sources

### Code

- Git
- Commits
- Branches
- Tags
- Tests

### Documentation

- Markdown
- PDF
- Word
- HTML
- Wiki

### Architecture

- RFC
- Journaux
- Roadmaps
- Décisions

### APS

- Workflows
- Core Nodes
- Façades
- Mappers
- Templates
- Collections

### Plateformes

- Iconik
- Mimir
- Content Core
- AWS
- Node-RED
- n8n
- Pulse iT
- NMOS
- ST2110

---

# Agents APS

## APS Developer

- génération de code
- patchs
- tests
- revue de code
- analyse Git

## APS Architect

- refactoring
- rationalisation
- simplification de workflows
- modélisation

## APS Tutor

- onboarding
- formation
- explications

## APS Reviewer

- détection anti-patterns
- audit workflows
- portabilité

## APS Translator

- Node-RED
- n8n
- Step Functions
- Pulse iT
- futures plateformes

## APS Platform Builder

À partir de :

- OpenAPI
- Swagger
- guides admin
- guides utilisateurs
- documentation produit

Produit :

- façades
- mappers
- workflows
- documentation

## APS Documenter

- guides
- cartographie
- inventaires
- documentation consolidée

---

# Search & Discovery Engine (RFC-002)

APS doit supporter plusieurs générations de recherche.

## Search V1 - Keyword Search

Basé sur ElasticSearch.

Recherche :

- assets
- workflows
- documents
- collections
- métadonnées

## Search V2 - Semantic Search

Questions naturelles.

Exemple :

"Comment publier vers Amazon ?"

Retrouve les workflows et documents associés.

## Search V3 - Vector Search

Recherche par similarité.

Technologies possibles :

- Qdrant
- Chroma
- pgvector
- Weaviate

Exemple :

"Trouve-moi un workflow similaire à celui-ci."

## Search V4 - Knowledge Graph

Relations entre objets APS.

```text
Platform
 ├─ API
 ├─ Workflow
 ├─ Mapper
 └─ Documentation
```

Navigation par connaissances.

## Search V5 - Agentic Search

APS AI :

- recherche
- corrèle
- raisonne
- synthétise

Exemple :

"Explique-moi la publication Bayard."

APS construit lui-même la réponse à partir de plusieurs sources.

---

# Knowledge Graph

Chaque objet APS est relié.

```text
Workflow
 ├─ Nodes
 ├─ Documentation
 ├─ Platforms
 ├─ APIs
 └─ Mappers
```

```text
Facade
 ├─ Core Node
 ├─ Workflow
 ├─ Documentation
 └─ Translator
```

---

# Permissions

## Reader

Lecture uniquement.

## Designer

Workflow + documentation.

## Developer

Code + patchs.

## Architect

Modèles et plateformes.

## Administrator

Gestion mémoire APS.

---

# Cas d'Usage Stratégiques

## S3 Browser Builder

Construction automatique d'un navigateur AWS.

## API Builder

Création automatique d'une plateforme APS depuis OpenAPI.

## API Maintenance

Comparaison de versions d'API.

Analyse d'impact.

## Workflow Translation Builder

Création ou amélioration de traducteurs.

## HTML Builder

Création d'interfaces métier :

- calendrier
- scheduler
- audiothèque
- ludothèque
- catalogue
- dashboard

## Platform Builder

Conception accélérée de nouvelles plateformes APS.

## Documentation Builder

Production documentaire automatique.

## Reverse Engineering

Analyse de plateformes existantes.

## ST2110 / NMOS Designer

Import, cartographie et modélisation des infrastructures broadcast.

---

# Technologies Cibles

## LLM

- Qwen
- DeepSeek
- Llama
- Mistral

## Runtime

- Ollama

## Vector DB

- Qdrant
- Chroma

## Stockage

- PostgreSQL
- Filesystem APS

---

# Stratégie Git

Vision long terme :

```text
APS Studio
+
Git intégré
+
IA intégrée
```

Fonctions :

- commit
- diff
- merge
- branches
- rollback

VS Code devient optionnel.

---

# Offline vs Online

## Offline

Mode principal.

Utilise uniquement les connaissances indexées.

## Online

Mode acquisition.

- nouvelles documentations
- veille technologique
- découverte de plateformes

---

# Risques

## Hallucinations

Référence obligatoire aux sources APS.

## Dette documentaire

Versionnement et gouvernance.

## Dépendance à un modèle

Modèles interchangeables.

## Explosion volumétrique

Indexation et archivage.

## Dépendance Internet

Architecture Offline First.

## Dépendance produit

Conserver une approche Core + Façades.

---

# Roadmap Consolidée

## Phase 1
Knowledge Base

## Phase 2
Search Engine

- Elastic
- indexation APS

## Phase 3
Semantic Search

## Phase 4
Knowledge Graph

## Phase 5
Tutor APS

## Phase 6
Developer APS

## Phase 7
Platform Builder

## Phase 8
Translator Engine

## Phase 9
Documentation Builder

## Phase 10
System Designer

- ST2110
- NMOS

## Phase 11
APS IDE

- Git intégré
- IA intégrée
- Knowledge intégré

---

# Vision Finale

APS AI devient une vue transverse du Studio.

La valeur stratégique réside dans :

```text
APS Knowledge Base
+
APS Methods
+
APS Models
+
APS Experience
```

Le LLM n'est qu'un moteur remplaçable.

La mémoire APS devient l'actif principal du Studio.

# APS-AI MASTER RFC v2

## Addendum - Application Builder & Browser Builder

### Vision

APS ne se limite pas aux workflows et aux plateformes.

APS doit également pouvoir générer des artefacts autonomes destinés à enrichir l'expérience utilisateur de plateformes existantes.

Exemples :

- Extensions Chromium
- Applications HTML spécialisées
- Dashboards métier
- Audiothèques
- Ludothèques
- Schedulers
- Calendriers éditoriaux
- Cutting Rooms légères

L'objectif est de combler les lacunes UX des plateformes sans modifier les plateformes elles-mêmes.

---

## APS Output Types

### Runtime Targets

Artefacts destinés à être exécutés par un moteur externe.

- APS Runtime
- Node-RED
- n8n
- AWS Step Functions
- Pulse iT

### Generated Artifacts

Artefacts autonomes générés par APS.

- Extensions Chromium
- Applications HTML
- Documentation
- Cartographies
- Dashboards
- Audiothèques
- Cutting Rooms
- Schedulers

Une fois générés, ces artefacts ne dépendent plus d'APS pour fonctionner.

---

## Browser Builder

### Objectif

Permettre à APS de générer des extensions Chromium capables d'enrichir une plateforme SaaS existante.

### Cas d'usage

#### Iconik Advanced Search

Ajout d'opérateurs de recherche avancés :

- AND
- OR
- NOT
- Parenthèses
- Requêtes complexes

#### Collection View Manager

Association d'une vue spécifique à une collection.

#### Context Panels

Ajout de panneaux métier.

#### Metadata Enhancer

Ajout d'informations ou de visualisations supplémentaires.

---

## Application Builder

### Objectif

Générer des applications métier spécialisées à partir du modèle APS.

### Exemples

- Audio Library
- Video Library
- Planning
- Scheduler
- Catalogue VOD
- Cutting Room

---

## Runtime Adapters

Les applications générées ne doivent pas connaître directement les plateformes.

Elles utilisent un adaptateur.

### Exemples

- Iconik Adapter
- Mimir Adapter
- Content Core Adapter
- Generic Web API Adapter
- APS Native Adapter

---

## Authentication Broker

### Principe

L'extension Chromium exploite la session déjà ouverte sur la plateforme cible.

Elle devient un intermédiaire entre :

- l'application générée ;
- la plateforme ;
- les autorisations utilisateur.

### Avantages

L'application générée n'a pas besoin de gérer :

- OAuth
- Cookies
- Tokens
- Refresh Tokens
- CORS

L'extension fournit un point d'accès standardisé.

Exemple conceptuel :

```javascript
window.APS.search(...)
window.APS.getCollection(...)
window.APS.getMetadata(...)
```

---

## Modes d'exploitation

### Mode Designer

APS pilote la conception de l'extension ou de l'application.

### Mode Runtime autonome

L'artefact est installé chez les utilisateurs.

APS n'est plus nécessaire.

### Mode Piloté APS

L'artefact reste autonome mais peut consommer des configurations produites par APS.

### Mode Agnostique

Le même composant métier peut cibler plusieurs plateformes via des adaptateurs.

---

## UX Gap Strategy

APS maintient progressivement un catalogue des lacunes UX identifiées.

Exemple :

### Iconik

- Recherche avancée
- Vue par collection
- Dashboard métier
- Planning éditorial
- Cutting Room légère

### Content Core

- Vues métier
- Recherche enrichie
- Navigation transverse

### Mimir

- Outils éditoriaux spécialisés
- Dashboards de publication

Le Browser Builder permet alors de générer la réponse adaptée.

---

## Architecture Conceptuelle

```text
APS Studio
    |
    +-- Workflow Builder
    +-- Platform Builder
    +-- Documentation Builder
    +-- Browser Builder
    +-- Application Builder
                |
                v
        Generated Artifact
                |
                +-- Chromium Extension
                +-- HTML Application
                +-- Dashboard
                +-- Cutting Room
```

---

## Positionnement

APS ne cherche pas à remplacer les plateformes.

APS permet :

- d'orchestrer ;
- de documenter ;
- de traduire ;
- de modéliser ;
- d'augmenter les plateformes existantes.

Les extensions et applications générées deviennent des produits autonomes consommables par les utilisateurs finaux.


# APS Knowledge Publisher RFC Addendum

## Vision

APS n'est pas un générateur de documents.

APS est un système de modélisation de connaissances.

La documentation, les schémas, les tableurs, les slides, les workflows et les applications sont des représentations différentes d'une même connaissance.

```text
Connaissance
        ↓
APS Model
        ↓

├── Workflow
├── Diagramme
├── Excel
├── PDF
├── Word
├── PowerPoint
├── Dashboard
├── HTML App
├── Chromium Extension
└── Cartographie
```

---

## Principe fondateur

Une information ne doit être saisie qu'une seule fois.

APS devient la source de vérité.

Tous les livrables sont générés à partir du modèle APS.

---

## Narration Déductive

APS peut construire un récit à partir des relations connues.

Exemple :

```text
Utilisateur
↓
Team
↓
Permission
↓
Metadata View
↓
Metadata
↓
Custom Action
↓
Workflow
↓
YouTube
```

La documentation est générée à partir de la structure réelle du système.

---

## Documentation Contextualisée

La même connaissance peut être publiée différemment selon l'organisation cible.

Exemples :

- France Médias Monde
- Bayard
- ARTE
- M6

Chaque organisation possède :

- son vocabulaire ;
- son ton ;
- ses conventions ;
- ses sections obligatoires ;
- ses formats attendus.

---

## Narrative Profile

Un profil documentaire peut être associé à une organisation.

Exemples :

- FMM Administration
- FMM Exploitation
- FMM Projet
- Bayard Technique
- Bayard Métier

Le profil définit :

- Audience
- Vocabulaire
- Structure
- Profondeur
- Style rédactionnel
- Glossaire
- Charte documentaire

---

## Livrables Cibles

### Gestion de projet

- SOW
- Dossier projet
- Planning
- Compte-rendu

### Validation

- Cahier de recette
- Matrice de tests
- Matrice de conformité

### Architecture

- Schémas
- Cartographies
- Inventaires

### Exploitation

- Guide administrateur
- Guide utilisateur
- Procédures opérationnelles

### Audit

- Analyse d'impact
- Traçabilité
- Dépendances

---

## Multi-Publication

Une même connaissance APS peut produire :

```text
Word
PDF
Excel
PowerPoint
HTML
Markdown
Mermaid
JSON
OpenAPI
```

sans ressaisie.

---

## Positionnement

APS ne génère pas des documents.

APS publie de la connaissance.

Les documents deviennent des vues spécialisées du modèle APS.

---

## Formule Résumée

> Modéliser une fois.
>
> Comprendre une fois.
>
> Publier partout.

