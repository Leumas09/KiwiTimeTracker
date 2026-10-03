# Kiwi Time Tracker

Suivi de temps personnel, inspiré de Toggl Track, en plus simple. Le temps est organisé sur deux niveaux dont tu choisis les noms : **Client → Projet** pour un consultant, **Matière → Sujet** pour un étudiant.

![Logo](public/logo.svg)

## Fonctionnalités

| Domaine | Ce que fait l'app |
|---|---|
| Saisie | Timer start/stop, saisie manuelle, « continuer » une entrée, suggestions à partir des entrées récentes, timer synchronisé entre appareils (onglet fermé, téléphone, ordinateur) |
| Pomodoro | Cycles travail / pause courte / pause longue, notifications, le cycle survit à un rechargement |
| Vues | Tableau de bord, liste par jour, calendrier (glisser-déposer, redimensionner, créer par sélection), timesheet semaine (saisie de durées dans les cases) |
| Organisation | Niveau 1 et niveau 2 renommables, tags, couleurs, archivage |
| Budgets | Budget total en jours, objectif récurrent en heures ou jours par semaine ou par mois, projection de la date d'épuisement |
| Rapports | Synthèse graphique (par niveau 1, niveau 2 ou tag), détaillé filtrable, matrice hebdo / mensuelle, budgets et objectifs, affichage en heures ou en jours |
| Préférences | FR / EN, thème clair / sombre / système, premier jour de la semaine, durée d'une journée, format des durées, arrondi |
| Comptes | Connexion Google ou Microsoft, données isolées par compte |
| Mobile | PWA installable, navigation adaptée au téléphone |

L'arrondi est appliqué entrée par entrée dans les rapports, le tableau de bord et les budgets. Les entrées gardent leur durée réelle.

## Démarrage rapide (mode démo)

```bash
npm install
npm run dev
```

Sans configuration Supabase, l'app démarre en **mode démo** : un jeu de données d'exemple est stocké dans le navigateur. Pratique pour essayer l'app ou travailler sur l'interface.

## Mise en service avec Supabase

### 1. Créer le projet

1. Créer un projet sur [supabase.com](https://supabase.com) (l'offre gratuite suffit).
2. Appliquer la migration `supabase/migrations/20261003000000_init.sql` :
   - soit dans **SQL Editor**, en collant le fichier ;
   - soit avec la CLI : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
3. Dans **Project Settings → API**, récupérer l'URL et la clé `anon`, puis créer `.env.local` :

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
```

### 2. Connexion Google

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web application*.
2. *Authorized redirect URI* : `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Sign In / Providers → Google** : activer, coller *Client ID* et *Client secret*.

### 3. Connexion Microsoft

1. Microsoft Entra admin center → **App registrations → New registration**.
   - *Supported account types* : comptes de n'importe quel annuaire et comptes Microsoft personnels (ou ton seul tenant si l'app reste interne).
   - *Redirect URI* (Web) : `https://<ref>.supabase.co/auth/v1/callback`.
2. **Certificates & secrets → New client secret**, copier la *Value*.
3. Supabase → **Authentication → Sign In / Providers → Azure** : activer, coller l'*Application (client) ID* et le secret. *Azure Tenant URL* : laisser vide (multi-tenant) ou `https://login.microsoftonline.com/<tenant-id>` pour un seul tenant.

### 4. URLs autorisées

Supabase → **Authentication → URL Configuration** :
- *Site URL* : l'URL de production (ex. `https://kiwi-time.vercel.app`).
- *Redirect URLs* : ajouter `http://localhost:5173` et l'URL de production.

### 5. Déploiement

Le front est un site statique. Sur Vercel : importer le dépôt, ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d'environnement, déployer. `vercel.json` gère la réécriture des routes vers `index.html`. Netlify ou Cloudflare Pages fonctionnent de la même façon (prévoir une règle SPA équivalente).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Typecheck et build de production (avec service worker PWA) |
| `npm run preview` | Sert le build localement |
| `npm run lint` | ESLint |
| `npm run icons` | Régénère le logo SVG et les icônes PWA (Chromium requis) |

## Tests

| Niveau | Commande | Ce qui est vérifié |
|---|---|---|
| Unitaires | `npm test` | Durées, arrondis, saisie des heures, agrégations, budgets, projection |
| SQL | `npm run test:sql` | Migrations sur PGlite : RLS, un seul timer en cours, nettoyage des tags |
| Intégration | `npm run test:integration` | La couche `supabaseApi` contre un vrai Postgres + PostgREST : profils, CRUD, RPC du timer, pagination au-delà de 1 000 lignes, isolation des comptes |
| End-to-end | `npm run test:e2e` | Toute l'interface en mode démo, sur ordinateur et mobile : timer, saisie manuelle, éditeur, calendrier (sélection, glisser-déposer), timesheet, rapports et filtres, projets, tags, réglages, Pomodoro, synchro entre onglets, PWA, accessibilité (axe), absence d'erreurs console |
| End-to-end Supabase | `E2E_SUPABASE=1 npm run test:e2e` | L'app construite pour Supabase : page de connexion et redirection OAuth, onboarding enregistré en base, timer conservé côté serveur, isolation, perte de réseau, déconnexion |

Les tests d'intégration et le mode Supabase des tests E2E ont besoin d'un Postgres et d'un PostgREST locaux :

```bash
scripts/integration-env.sh start   # Postgres 16 + PostgREST (binaire local ou Docker)
npm run test:all                   # tout, du lint aux tests E2E Supabase
scripts/integration-env.sh stop
```

La CI GitHub (`.github/workflows/ci.yml`) lance l'ensemble à chaque pull request.

## Architecture

```
src/
  auth/AuthProvider.tsx   Session Supabase, OAuth Google / Microsoft, bascule en mode démo
  data/api.ts             Contrat d'accès aux données (DataApi)
  data/supabaseApi.ts     Implémentation Supabase (Postgres + RLS + Realtime)
  data/demoApi.ts         Implémentation locale (localStorage), même contrat
  data/hooks.ts           Hooks TanStack Query, mises à jour optimistes, synchro temps réel
  lib/                    Logique pure : durées, dates, statistiques, couleurs, thème
  components/             Barre de timer, sélecteurs, éditeur d'entrée, Pomodoro, graphiques
  pages/                  Tableau de bord, Timer, Calendrier, Timesheet, Rapports, Projets, Réglages
  i18n/                   Dictionnaires FR et EN
supabase/migrations/      Schéma, RLS, triggers, RPC start_timer
```

**Stack** : React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, FullCalendar 6, Recharts, i18next, Supabase.

### Modèle de données

| Table | Contenu |
|---|---|
| `profiles` | Préférences et libellés des niveaux, une ligne par utilisateur (créée à l'inscription) |
| `categories` | Niveau 1 (Client, Matière…) : nom, couleur, budget, objectif, archivage |
| `projects` | Niveau 2 (Projet, Sujet…), rattaché ou non à un niveau 1 |
| `tags` | Étiquettes libres, uniques par utilisateur |
| `time_entries` | Description, projet, tags (`uuid[]`), début, fin (`null` = timer en cours) |

Points structurants :
- Chaque table est protégée par RLS (`user_id = auth.uid()`). Un compte ne voit jamais les données d'un autre.
- Un index unique partiel garantit **un seul timer en cours par utilisateur**, tous appareils confondus. La fonction `start_timer` arrête l'éventuel timer en cours et en démarre un nouveau dans la même transaction.
- Supprimer un projet ou un client conserve les entrées de temps. L'archivage est préférable pour garder l'historique.
- La timesheet ne stocke rien de plus : augmenter une case ajoute une entrée en fin de journée, la réduire raccourcit ou supprime les dernières entrées.

## Charte

Couleurs et typographie reprises de la charte Kiwi Consulting : verts `#99CB38`, `#729928`, `#63A537`, `#4A7C29`, gris `#404040` à `#D9D9D9`, police Aptos avec repli système. La palette des projets a été validée pour la distinction des couleurs (daltonisme compris) en thème clair et sombre.
