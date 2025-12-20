# 🔒 DÉPLOIEMENT DES FONCTIONS DE SÉCURITÉ - CRITIQUE

## ⚠️ AVANT DE LANCER EN PRODUCTION

**CES ÉTAPES SONT OBLIGATOIRES** avant d'accepter le premier client payant.

---

## 1. DÉPLOYER LES FIRESTORE SECURITY RULES

```bash
cd /home/user/TESTE-BROCKER-

# Déployer les règles Firestore
firebase deploy --only firestore:rules
```

**Vérification:**
- Aller sur Firebase Console → Firestore Database → Rules
- Vérifier que les rules sont actives
- Tester qu'un utilisateur NE PEUT PAS modifier les données d'un autre user

---

## 2. DÉPLOYER LES CLOUD FUNCTIONS

```bash
cd /home/user/TESTE-BROCKER-/functions

# Installer les dépendances
npm install

# Build TypeScript
npm run build

# Déployer TOUTES les fonctions
firebase deploy --only functions
```

**Fonctions déployées:**
- ✅ `executeTrade` - Valide et exécute un trade de manière sécurisée
- ✅ `closeTrade` - Ferme un trade et met à jour la balance
- ✅ `updateTradingDays` - Scheduled function quotidienne (00:00 UTC)
- ✅ `calculateDrawdowns` - Calcule les drawdowns en temps réel
- ✅ `stripeWebhookV2` - Webhook Stripe (déjà déployé)

---

## 3. TESTER LES FONCTIONS

### Test 1: Vérifier les Firestore Rules

```javascript
// Dans la console du navigateur, connecté comme user normal:
import { doc, updateDoc } from 'firebase/firestore';

// Essayer de modifier SA balance (doit ÉCHOUER)
await updateDoc(doc(db, 'users', 'mon-uid'), {
  accountBalance: 999999
});
// ❌ Doit retourner: "Missing or insufficient permissions"

// Essayer de modifier les données d'UN AUTRE USER (doit ÉCHOUER)
await updateDoc(doc(db, 'users', 'autre-uid'), {
  accountBalance: 0
});
// ❌ Doit retourner: "Missing or insufficient permissions"
```

**Si ça fonctionne = GRAVE PROBLÈME, NE PAS LANCER**

### Test 2: Tester executeTrade

```javascript
// Dans le broker, appeler la Cloud Function:
const executeTrade = httpsCallable(functions, 'executeTrade');

try {
  const result = await executeTrade({
    userId: auth.currentUser.uid,
    symbol: 'EUR / USD',
    symbolApi: 'EUR_USD',
    side: 'BUY',
    lots: 1,
    price: 1.0850
  });

  console.log('✅ Trade créé:', result.data);
} catch (error) {
  console.error('❌ Erreur:', error.message);
}
```

### Test 3: Tester les heures interdites

```javascript
// Modifier temporairement l'heure du serveur pour tester (via code)
// Ou attendre 22h UTC pour tester en réel

const result = await executeTrade({...});
// Doit retourner: "Trading interdit entre 22h et 00h (UTC)"
```

### Test 4: Tester le drawdown

```javascript
// 1. Ouvrir un trade
// 2. Le fermer avec une grosse perte (> 8% du solde initial)
// 3. Vérifier que le compte est SUSPENDU
// 4. Essayer d'ouvrir un nouveau trade
// 5. Doit retourner: "Compte suspended. Trading désactivé."
```

---

## 4. REFACTORER LE BROKER HTML

**Fichier:** `/home/user/TESTE-BROCKER-/dashboard/public/index.html`

### Changements à faire:

**AVANT (non sécurisé):**
```javascript
const openPosition = async (symObj, side, lots) => {
  // Validation côté client (contournable)
  const hoursCheck = checkTradingHours();
  if (!hoursCheck.allowed) {
    showToast('❌ Interdit');
    return;
  }

  // Sauvegarde directe dans Firestore (dangereux!)
  await window.saveTrade(tradeData);
};
```

**APRÈS (sécurisé):**
```javascript
const openPosition = async (symObj, side, lots, price) => {
  try {
    // Appeler la Cloud Function sécurisée
    const executeTrade = httpsCallable(window.firebaseFunctions, 'executeTrade');

    const result = await executeTrade({
      userId: window.firebaseUser.uid,
      symbol: symObj.label,
      symbolApi: symObj.api,
      side,
      lots,
      price,  // Prix actuel du marché
      tp: null,
      sl: null
    });

    console.log('✅ Trade validé par le serveur:', result.data);

    // Recharger les positions depuis Firestore
    await loadOpenPositions();

    showToast(`✅ ${side}: ${symObj.label}`, 'success');

  } catch (error) {
    console.error('❌ Trade refusé:', error.message);
    showToast(`❌ ${error.message}`, 'error');

    // Si compte suspendu, bloquer l'interface
    if (error.message.includes('suspendu')) {
      accountSuspended = true;
      alert('⚠️ COMPTE SUSPENDU\n\n' + error.message);
    }
  }
};
```

---

## 5. SURVEILLANCE POST-DÉPLOIEMENT

### Logs à surveiller:

```bash
# Logs des Cloud Functions en temps réel
firebase functions:log --only executeTrade,closeTrade

# Vérifier les tentatives de triche
firebase firestore:query audit_logs \
  --where action==trade_rejected \
  --order-by timestamp desc \
  --limit 50
```

### Métriques à surveiller:

1. **Taux de rejection des trades**
   - Si > 10% = possibles problèmes de code
   - Si 0% = possibles failles de sécurité

2. **Comptes suspendus**
   - Vérifier les raisons (drawdown, heures interdites, etc.)
   - Détecter patterns suspects (win rate > 95%, jamais de perte)

3. **Coûts Firebase**
   - Cloud Functions: ~$0.40 par million d'invocations
   - Firestore: ~$0.18 par million de lectures
   - Budget mensuel estimé: $50-200 selon le volume

---

## 6. CHECKLIST AVANT PRODUCTION

- [ ] Firestore Rules déployées et testées
- [ ] Cloud Functions déployées et testées
- [ ] Broker refactoré pour utiliser Cloud Functions
- [ ] Tests de sécurité passés (ne peut pas tricher)
- [ ] Tests des heures interdites (22h-00h, weekend)
- [ ] Tests de drawdown (suspension automatique)
- [ ] Logs d'audit fonctionnels
- [ ] Monitoring Firebase configuré
- [ ] Budget Firebase configuré (limites)
- [ ] Plan de backup Firestore activé

---

## 7. EN CAS DE PROBLÈME

### Rollback rapide:

```bash
# Revenir aux anciennes règles Firestore
firebase deploy --only firestore:rules --config firebase.old.json

# Rollback d'une Cloud Function spécifique
firebase functions:delete executeTrade
```

### Support:

- Firebase Console: https://console.firebase.google.com
- Firebase Support: https://firebase.google.com/support
- Logs d'erreurs: Firebase Console → Functions → Logs

---

## 8. COÛTS ESTIMÉS

**Avec 100 clients actifs:**
- Cloud Functions: ~$20/mois
- Firestore: ~$15/mois
- Storage: ~$5/mois
- **TOTAL: ~$40/mois**

**Avec 1000 clients actifs:**
- Cloud Functions: ~$150/mois
- Firestore: ~$100/mois
- Storage: ~$30/mois
- **TOTAL: ~$280/mois**

**Note:** Configurer des alertes de budget dans Google Cloud Console.

---

## 9. PROCHAINES ÉTAPES

Après déploiement:
1. Créer le dashboard admin
2. Implémenter le système KYC
3. Créer le système de payout
4. Ajouter les notifications email
5. Implémenter le passage automatique en funded

**MAIS D'ABORD: Sécuriser ce qui existe!**
