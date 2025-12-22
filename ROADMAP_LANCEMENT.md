# 🚀 ROADMAP AVANT LANCEMENT CLIENT

**Status actuel :** ⚠️ 70% prêt
**Estimation lancement :** 3-4 semaines

---

## ✅ DÉJÀ FAIT (70%)

### Sécurité ✅
- [x] Firestore Rules (client ne peut rien modifier)
- [x] Cloud Functions validation serveur
- [x] Prix validés serveur (Finnhub API)
- [x] Drawdown automatique (8% total, 3% journalier)
- [x] Heures de trading (weekend + 22h-00h bloqués)
- [x] Audit logs complets

### Plateforme ✅
- [x] Broker professionnel (forex, indices, ETFs)
- [x] Dashboard Next.js
- [x] Stripe checkout
- [x] Multi-langues (FR/EN)
- [x] TradingView charts

---

## 🔴 BLOQUANTS (À faire AVANT lancement)

### 1. Système de Payout (CRITIQUE)
**Priorité :** 🔴 URGENT
**Estimation :** 1 semaine

**À créer :**
```typescript
// Cloud Function
requestPayout(userId, amount, bankDetails)
  - Vérifier challenge réussi
  - Vérifier balance minimale
  - Créer demande dans payout_requests collection
  - Envoyer email admin

// Cloud Function (admin only)
approvePayout(payoutId, kycStatus)
  - Vérifier KYC validé
  - Déclencher virement Stripe/Wise
  - Mettre à jour statut
```

**Interface :**
- Bouton "Demander payout" dans dashboard
- Page admin pour approuver/rejeter
- Historique des payouts

**Coût :** $0 dev + frais Stripe/Wise (2-3% par virement)

---

### 2. KYC (Stripe Identity)
**Priorité :** 🔴 URGENT (légal)
**Estimation :** 2-3 jours

**Workflow validé :**
1. Achat challenge → **Pas de KYC** ✅
2. Client trade → **Pas de KYC** ✅
3. Challenge réussi → Email "Complétez KYC pour payout"
4. Demande payout → **KYC vérifié** → Admin approuve → Virement

**Intégration :**
```typescript
// Client demande payout
→ Redirect vers Stripe Identity
→ Stripe vérifie ID + selfie
→ Webhook retourne résultat
→ Si OK: admin peut approuver payout
```

**Coût :** $1-3 par vérification (uniquement si utilisé)

**Exemple :**
- 100 challenges vendus = €20,000
- 5 réussissent (5%)
- KYC : 5 × $3 = **$15 total**
- **Marge : 99.9%** 🚀

---

### 3. CGV + Privacy Policy (LÉGAL)
**Priorité :** 🔴 URGENT
**Estimation :** 1 semaine

**Plan validé :**
1. Claude crée draft complet adapté prop firm
2. Relecture LegalPlace/Captain Contrat (~€200)
3. Intégration sur le site (pages + checkbox Stripe)

**Clauses critiques prop firm :**
- ✅ Disclaimer risque trading
- ✅ "Argent virtuel, pas vrai trading"
- ✅ Règles exactes du challenge
- ✅ Conditions de payout
- ✅ Droit de suspension si triche
- ✅ Politique RGPD complète
- ✅ Cookies policy

**Coût :** ~€200 (validation avocat)

---

### 4. Système d'Upgrade Compte
**Priorité :** 🔴 URGENT (business)
**Estimation :** 3-4 jours

**Problème actuel :**
Client atteint profit target (10%) → **Rien ne se passe** ❌

**Solution :**
```typescript
// Cloud Function déclenchée après chaque trade fermé
checkChallengeProgress(userId)
  - Vérifier si profitTarget atteint
  - Vérifier si tradingDays >= minimum
  - Vérifier drawdown < 8%
  - Si tout OK:
    → Upgrade accountStatus = 'funded'
    → Email félicitations
    → Débloquer fonction payout
```

**UI :**
- Badge "Challenge réussi !" dans dashboard
- Bouton "Demander payout" activé

---

## 🟠 IMPORTANTS (Avant scaling)

### 5. Dashboard Admin
**Priorité :** 🟠 IMPORTANT
**Estimation :** 1 semaine

**Fonctionnalités :**
- Liste des comptes (statut, balance, drawdown)
- Graphiques de performance
- Payouts en attente (approuver/rejeter)
- Audit logs
- Détection anomalies (trading suspects)
- Stats globales (CA, conversions, etc.)

**Tech :** Next.js page protégée (role='admin')

---

### 6. Rate Limiting
**Priorité :** 🟠 IMPORTANT
**Estimation :** 1 jour

**Problème :**
Client peut spam 1000 requêtes/sec → Coûts explosent

**Solution :**
```typescript
import { RateLimiter } from 'firebase-functions-rate-limiter';

const limiter = RateLimiter({
  maxCalls: 10,
  periodSeconds: 60
});

export const executeTrade = onCall(async (request) => {
  await limiter.rejectOnQuotaExceeded(request.auth.uid);
  // ...
});
```

**Coût :** $0

---

### 7. Calcul P&L Précis
**Priorité :** 🟠 IMPORTANT
**Estimation :** 2 jours

**Problème actuel :**
```typescript
const pipValue = 10; // FIXE pour tous les symboles ❌
```

**Solution :**
Créer table de configuration par symbole :
```typescript
const SYMBOL_CONFIG = {
  'EUR_USD': { pipValue: 10, pipStep: 0.0001, contractSize: 100000 },
  'USD_JPY': { pipValue: 9.12, pipStep: 0.01, contractSize: 100000 },
  'US500': { pipValue: 50, pipStep: 1, contractSize: 50 },
  'AAPL': { pipValue: 1, pipStep: 0.01, contractSize: 100 },
  // etc.
}
```

---

## 🟡 RECOMMANDÉS (Nice to have)

### 8. Notifications Email
**Priorité :** 🟡 NICE TO HAVE
**Estimation :** 2 jours

**Templates :**
- Trade fermé (P&L positif/négatif)
- Compte suspendu (drawdown dépassé)
- Challenge réussi
- Payout approuvé

**Tech :** Firebase Extension "Trigger Email" (gratuit)

---

### 9. Optimisation Performance
**Priorité :** 🟡 OPTIMIZATION
**Estimation :** 1 jour

**Cache des métriques dans user doc :**
```typescript
{
  userId: "xxx",
  accountBalance: 52000,
  peakBalance: 54000,      // ← Cached
  currentDrawdown: 3.7,    // ← Cached
  todayPnl: -150,          // ← Cached
}
```

Évite de charger 1000 trades à chaque validation.

---

### 10. Monitoring / Alertes
**Priorité :** 🟡 OPS
**Estimation :** 1 jour

**Google Cloud Monitoring :**
- Alerte si Cloud Functions > 500ms
- Alerte si erreurs > 5%
- Alerte si coûts > budget
- Notifications Slack/Email

---

### 11. Backups Automatiques
**Priorité :** 🟡 SÉCURITÉ
**Estimation :** 1 jour

**Activer Firestore Backups :**
```bash
gcloud firestore export gs://backup-bucket/
```

Script quotidien + plan de restauration testé.

---

## 📊 PLANNING RECOMMANDÉ

### Semaine 1-2 : SÉCURITÉ + BUSINESS
- [ ] Système de payout complet
- [ ] Système d'upgrade compte
- [ ] KYC (Stripe Identity)

### Semaine 2-3 : LÉGAL
- [ ] CGV + Privacy Policy (draft)
- [ ] Validation avocat
- [ ] Intégration site

### Semaine 3-4 : OPTIMISATION
- [ ] Dashboard admin
- [ ] Rate limiting
- [ ] Calcul P&L précis
- [ ] Tests complets

### Semaine 4+ : LANCEMENT
- [ ] Tests utilisateurs beta
- [ ] Marketing
- [ ] Support client

---

## 💰 BUDGET TOTAL

### Coûts one-time
- **Avocat CGV :** €200
- **Total :** €200

### Coûts mensuels (100 clients)
- **Finnhub API :** $0 (gratuit jusqu'à 60 calls/min)
- **Firebase :** $30-50
- **KYC (5 winners) :** $15
- **Total :** ~€50-70/mois

### ROI
- **Revenus :** 100 × €200 = €20,000/mois
- **Coûts :** €70/mois
- **Marge :** **99.6%** 🚀

---

## 🎯 PROCHAINE ÉTAPE

**Choisis une priorité :**

1. 🔴 **Système de payout** (1 semaine)
2. 🔴 **Système d'upgrade compte** (3 jours)
3. 🔴 **CGV + Privacy** (1 semaine)
4. 🔴 **KYC Stripe Identity** (2 jours)

Ou on teste d'abord le trading en semaine pour valider que tout fonctionne ? 🚀
