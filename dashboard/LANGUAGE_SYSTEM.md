# Système de Changement de Langue

Ce document explique le système de multi-langue implémenté dans le dashboard Next.js.

## Langues Supportées

1. **Français (FR)** - Langue par défaut
2. **English (EN)**
3. **Español (ES)**

## Architecture

### 1. LanguageContext (`/context/LanguageContext.tsx`)

Le contexte de langue gère l'état global de la langue sélectionnée et fournit:
- `currentLanguage`: La langue actuellement sélectionnée ('fr' | 'en' | 'es')
- `setLanguage(lang)`: Fonction pour changer la langue
- `t(key)`: Fonction de traduction qui prend une clé (ex: 'sidebar.dashboard')
- `translations`: L'objet complet des traductions pour la langue actuelle

**Fonctionnalités:**
- Sauvegarde automatique dans localStorage
- Chargement automatique de la langue sauvegardée au démarrage
- Fallback en français si une traduction est manquante

### 2. Fichiers de Traduction (`/locales/`)

Trois fichiers de traduction:
- `/locales/fr.ts` - Traductions françaises
- `/locales/en.ts` - Traductions anglaises
- `/locales/es.ts` - Traductions espagnoles

**Structure des clés:**
Les traductions sont organisées par section avec une notation par points:
```typescript
{
  sidebar: {
    dashboard: "Tableau de bord",
    trades: "Trades",
    // ...
  },
  dashboard: {
    title: "Tableau de bord",
    subtitle: "Bienvenue ! Voici votre aperçu de trading.",
    // ...
  },
  // ...
}
```

### 3. Sélecteur de Langue (Sidebar)

Le sélecteur de langue se trouve dans la sidebar, juste au-dessus de la section utilisateur.

**Fonctionnalités:**
- Affichage de la langue actuelle avec drapeau et nom
- Menu déroulant avec les 3 langues disponibles
- Icône de globe pour faciliter l'identification
- Indication visuelle de la langue sélectionnée (icône check)
- Changement instantané sans rechargement de page

### 4. Intégration dans ClientLayout

Le `LanguageProvider` enveloppe toute l'application dans `ClientLayout.tsx`, permettant à tous les composants d'accéder au contexte de langue.

## Utilisation dans les Composants

### Import du Hook
```typescript
import { useLanguage } from "@/context/LanguageContext";
```

### Utilisation de la Fonction de Traduction
```typescript
const { t } = useLanguage();

// Utilisation simple
<h1>{t("dashboard.title")}</h1>

// Dans des templates
<p>{t("dashboard.subtitle")}</p>

// Avec des valeurs dynamiques
<span>{`${t("dashboard.target")}: ${formatCurrency(amount)}`}</span>
```

### Accès à la Langue Actuelle
```typescript
const { currentLanguage, setLanguage } = useLanguage();

// Changer la langue
setLanguage("en");

// Vérifier la langue actuelle
if (currentLanguage === "fr") {
  // faire quelque chose
}
```

## Pages Traduites

Toutes les pages principales du dashboard sont entièrement traduites:

1. **Dashboard** (`/app/page.tsx`)
   - Statistiques de compte
   - Progression du challenge
   - Trades récents
   - Statistiques de trading

2. **Trades** (`/app/trades/page.tsx`)
   - Liste complète des trades
   - Statistiques de trades
   - Tableau détaillé

3. **Challenge** (`/app/challenge/page.tsx`)
   - Progression du challenge
   - Règles du challenge
   - Gestion des risques
   - Timeline

4. **Settings** (`/app/settings/page.tsx`)
   - Paramètres du profil
   - Préférences de notification
   - Sécurité
   - Apparence

5. **Sidebar** (`/components/dashboard/Sidebar.tsx`)
   - Navigation
   - Nouveau Challenge
   - Section utilisateur

## Clés de Traduction Disponibles

### Common
- `common.loading`, `common.noData`, `common.error`
- `common.save`, `common.cancel`, `common.delete`, etc.

### Sidebar
- `sidebar.dashboard`, `sidebar.challenge`, `sidebar.trades`
- `sidebar.accounts`, `sidebar.analytics`, `sidebar.payout`
- `sidebar.settings`, `sidebar.logout`, `sidebar.newChallenge`

### Dashboard
- Toutes les clés liées à la page dashboard
- Statistiques, progress, trades récents

### Trades
- Toutes les clés liées à la page trades
- Tableau, statistiques, filtres

### Challenge
- Toutes les clés liées à la page challenge
- Règles, progression, risk management

### Settings
- Toutes les clés liées aux paramètres
- Profil, notifications, sécurité, apparence

### Status
- `status.active`, `status.inactive`, `status.pending`
- `status.completed`, `status.failed`

## Ajout d'une Nouvelle Langue

Pour ajouter une nouvelle langue:

1. Créer un nouveau fichier dans `/locales/` (ex: `/locales/de.ts` pour l'allemand)
2. Copier la structure d'un fichier existant (ex: `fr.ts`)
3. Traduire toutes les clés
4. Ajouter le type dans `LanguageContext.tsx`:
   ```typescript
   export type Language = "fr" | "en" | "es" | "de";
   ```
5. Ajouter les traductions dans `translationsMap`:
   ```typescript
   import { de } from "@/locales/de";

   const translationsMap: Record<Language, Translations> = {
     fr,
     en,
     es,
     de,
   };
   ```
6. Ajouter la langue dans le sélecteur (Sidebar):
   ```typescript
   const languages = [
     { code: "fr", name: "Français", flag: "🇫🇷" },
     { code: "en", name: "English", flag: "🇬🇧" },
     { code: "es", name: "Español", flag: "🇪🇸" },
     { code: "de", name: "Deutsch", flag: "🇩🇪" },
   ];
   ```

## Ajout de Nouvelles Clés de Traduction

Pour ajouter de nouvelles traductions:

1. Ajouter la clé dans **tous** les fichiers de langue (`fr.ts`, `en.ts`, `es.ts`)
2. Suivre la structure existante (organisation par section)
3. Utiliser la notation par points pour l'accès (ex: `section.subsection.key`)
4. Utiliser la fonction `t()` dans les composants

Exemple:
```typescript
// Dans fr.ts
export const fr = {
  // ...
  newSection: {
    newKey: "Nouvelle traduction",
  },
};

// Dans le composant
const { t } = useLanguage();
<p>{t("newSection.newKey")}</p>
```

## Bonnes Pratiques

1. **Toujours traduire**: Ne jamais laisser de texte en dur dans les composants
2. **Clés cohérentes**: Utiliser des clés descriptives et organisées
3. **Fallback**: Le système utilise automatiquement le français si une traduction manque
4. **LocalStorage**: La langue est automatiquement sauvegardée et restaurée
5. **Performance**: Le changement de langue est instantané sans rechargement
6. **Accessibilité**: Le sélecteur est visible et accessible depuis toutes les pages

## Testing

Le système a été testé avec succès:
- Build Next.js réussit sans erreurs
- Toutes les pages principales sont traduites
- Le changement de langue fonctionne instantanément
- La persistance dans localStorage fonctionne correctement
