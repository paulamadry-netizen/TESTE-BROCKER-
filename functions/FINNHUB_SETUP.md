# Configuration Finnhub pour validation des prix

## 🔑 Étape 1: Obtenir une clé API Finnhub

### Option A: Gratuit (Pour tester)
1. Aller sur https://finnhub.io/register
2. Créer un compte gratuit
3. Copier ta clé API

**Limites gratuit:**
- 60 appels/minute
- Idéal pour tester avec 1-10 clients

### Option B: Payant (Pour production)
- **Starter:** $29/mois (300 calls/min) → Jusqu'à 100 clients
- **Pro:** $79/mois (1000 calls/min) → Jusqu'à 500 clients

---

## 🚀 Étape 2: Configurer le secret dans Firebase

```bash
cd ~/TESTE-BROCKER-/functions

# Définir le secret (Firebase te demandera la clé)
firebase functions:secrets:set FINNHUB_API_KEY
# Coller ta clé API Finnhub quand demandé

# Vérifier que le secret existe
firebase functions:secrets:access FINNHUB_API_KEY
```

---

## 🔧 Étape 3: Modifier index.ts

Le fichier `functions/src/index.ts` doit exporter les fonctions avec les secrets:

```typescript
import { finnhubApiKey } from './priceService';

// Ajouter le secret aux fonctions
export {
  executeTrade,
  closeTrade,
  updateTradingDays,
  calculateDrawdowns
} from './tradeSecurity';
```

Et dans `tradeSecurity.ts`, ajouter le secret dans les options:

```typescript
export const executeTrade = onCall(
  { secrets: [finnhubApiKey] },  // ← Ajouter ça
  async (request) => {
    // ...
  }
);

export const closeTrade = onCall(
  { secrets: [finnhubApiKey] },  // ← Ajouter ça
  async (request) => {
    // ...
  }
);
```

---

## 🧪 Étape 4: Compiler et déployer

```bash
cd ~/TESTE-BROCKER-/functions

# Compiler TypeScript
npm run build

# Vérifier qu'il n'y a pas d'erreurs
ls -la lib/priceService.js

# Déployer les Cloud Functions
cd ..
firebase deploy --only functions

# Tu devrais voir:
# ✔ functions[executeTrade(us-central1)]
# ✔ functions[closeTrade(us-central1)]
```

---

## 🎯 Étape 5: Tester

### Test 1: Ouvrir un trade en semaine

Sur le broker en semaine, ouvre un trade EUR/USD. Dans les logs Firebase:

```
✅ Prix validé serveur: EUR_USD = 1.0850
```

### Test 2: Vérifier qu'on ne peut PAS manipuler le prix

Console navigateur:
```javascript
// Essayer de tricher avec un faux prix
const result = await window.firebaseFunctions.httpsCallable('executeTrade')({
  userId: window.firebaseUser.uid,
  symbol: 'EUR/USD',
  symbolApi: 'EUR_USD',
  side: 'BUY',
  lots: 1,
  price: 0.50  // ← PRIX FAUX
});
```

**Résultat attendu:**
Le trade sera créé avec le VRAI prix (1.08), pas le faux prix (0.50).

Les logs Firebase montreront:
```
⚠️ Price mismatch: Client=0.50, Server=1.0850, Diff=53.70%
✅ Prix validé serveur: EUR_USD = 1.0850
```

---

## 🔄 Alternative: Utiliser ton proxy existant (GRATUIT)

Si tu préfères ne pas payer Finnhub, tu peux utiliser ton proxy:

**Avantages:**
- ✅ GRATUIT (utilise ton proxy existant)
- ✅ Pas de limite de rate

**Désavantage:**
- ⚠️ Dépend de ton proxy (s'il tombe, tout tombe)

**Configuration:**

Dans `priceService.ts`, la fonction `fetchPriceFromProxy()` est déjà configurée pour utiliser ton proxy. Elle essaie le proxy en premier, puis fallback vers Finnhub si le proxy échoue.

**Ajouter une route à ton proxy:**

Ton proxy doit exposer:
```
GET https://finnhub-proxy-477220862918.europe-west1.run.app/api/quote/EUR_USD
→ { "price": 1.0850, "timestamp": 1234567890 }
```

Si ton proxy n'expose pas encore cette route, tu peux soit:
1. L'ajouter au code du proxy
2. Utiliser directement Finnhub (plus simple)

---

## 💰 Coûts estimés

### Avec Finnhub gratuit (test)
- **Coût:** $0/mois
- **Clients:** 1-10 max

### Avec Finnhub Starter (production)
- **Coût:** $29/mois
- **Clients:** Jusqu'à 100

### Avec ton proxy (gratuit)
- **Coût:** $0/mois (si proxy déjà déployé)
- **Clients:** Illimité
- **Risque:** Single point of failure

---

## 🎯 Recommandation

**Pour tester maintenant:**
1. Utilise Finnhub gratuit
2. Configure le secret
3. Déploie et teste

**Pour la production:**
1. Si budget serré: utilise ton proxy + Finnhub gratuit en fallback
2. Si budget OK: utilise Finnhub Starter ($29/mois) pour la fiabilité

---

## ❓ Questions fréquentes

**Q: Finnhub a les prix de tous les symboles?**
R: Oui, forex, actions, indices, crypto, commodités. 60,000+ symboles.

**Q: Les prix sont-ils en temps réel?**
R: Oui, avec moins de 100ms de latence.

**Q: Que se passe-t-il si Finnhub est down?**
R: Le trade est rejeté avec le message "Impossible de valider le prix". Le client doit réessayer.

**Q: Peut-on cacher les prix pour améliorer les perfs?**
R: Oui, mais attention: le prix doit être < 5 secondes d'âge pour éviter la manipulation.

---

Besoin d'aide? Dis-moi où tu bloques ! 🚀
