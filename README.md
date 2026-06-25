# App Stats — Vue 3 + Vite + TypeScript

Application web d'import, mapping et analyse de fichiers `.xlsx`.

## Prérequis

- Node.js 20+
- npm

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ouvrir l'URL affichée (généralement http://localhost:5173).

## Build production

```bash
npm run build
npm run preview
```

## Déploiement GitHub Pages

1. Adapter le nom du dépôt dans `vite.config.ts` ou définir `BASE_PATH` :

```bash
# Exemple pour https://username.github.io/App_stats-TS/
set BASE_PATH=/App_stats-TS/
npm run build
```

2. Déployer :

```bash
npm run deploy
```

Ou via GitHub Actions (workflow `.github/workflows/deploy.yml`) en poussant sur `master`/`main`.

## Structure

- `src/core/` — logique métier (filtres, mensuel, graphiques, PDF, XLSX)
- `src/stores/` — état Pinia
- `src/components/` — interface Vue
- `legacy/` — ancienne version vanilla JS

## Optimisations

- Tableau virtualisé pour l'affichage des grandes listes
- `shallowRef` pour les jeux de données volumineux
- Chargement paresseux des vues lourdes (stats, mensuel, graphiques)
- Chunk séparé pour la librairie XLSX
