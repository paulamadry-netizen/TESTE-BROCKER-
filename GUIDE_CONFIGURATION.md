# 🚀 Guide de Configuration Rapide

## ✅ Ce qui fonctionne déjà

Votre serveur démarre et peut :
- ✅ Servir votre interface web (index.html)
- ✅ Fournir les prix des marchés via `/quotes`
- ✅ Recevoir les webhooks Stripe sur `/webhook/stripe`

## ⚠️ Ce qu'il reste à configurer

### 1. Firebase (obligatoire pour créer des comptes)

#### Étape 1 : Créer un projet Firebase
1. Aller sur https://console.firebase.google.com/
2. Cliquer sur "Ajouter un projet"
3. Nommer le projet (ex: "amabrocker-prod")
4. Désactiver Google Analytics (optionnel)
5. Cliquer sur "Créer le projet"

#### Étape 2 : Activer Firestore
1. Dans le menu de gauche, cliquer sur "Firestore Database"
2. Cliquer sur "Créer une base de données"
3. Choisir "Démarrer en mode test" (pour l'instant)
4. Sélectionner une région (ex: europe-west1)
5. Cliquer sur "Activer"

#### Étape 3 : Télécharger la clé privée
1. Cliquer sur l'icône ⚙️ > "Paramètres du projet"
2. Aller dans l'onglet "Comptes de service"
3. Cliquer sur "Générer une nouvelle clé privée"
4. Télécharger le fichier JSON
5. **IMPORTANT** : Renommer le fichier en `serviceAccountKey.json`
6. Placer le fichier à la racine du projet (à côté de index.js)

### 2. Stripe (obligatoire pour les paiements)

#### Étape 1 : Créer un compte Stripe
1. Aller sur https://dashboard.stripe.com/register
2. Créer un compte
3. Activer le mode test

#### Étape 2 : Récupérer la clé secrète
1. Dans le dashboard Stripe, cliquer sur "Développeurs" > "Clés API"
2. Copier la "Clé secrète" (commence par `sk_test_...`)
3. Ouvrir le fichier `.env`
4. Remplacer `STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE` par votre vraie clé

#### Étape 3 : Configurer le webhook
1. Dans Stripe, aller dans "Développeurs" > "Webhooks"
2. Cliquer sur "Ajouter un endpoint"
3. URL de l'endpoint : `https://votre-domaine.com/webhook/stripe`
   - **Pour tester en local**, voir section "Test en local" ci-dessous
4. Sélectionner les événements :
   - ✅ `checkout.session.completed`
   - ✅ `payment_intent.succeeded`
5. Cliquer sur "Ajouter un endpoint"
6. Copier le "Secret de signature" (commence par `whsec_...`)
7. Dans le fichier `.env`, remplacer `STRIPE_WEBHOOK_SECRET=whsec_...`

### 3. Test en local avec Stripe CLI

Pour tester les webhooks Stripe sur votre machine locale :

```bash
# 1. Installer Stripe CLI
# Sur macOS :
brew install stripe/stripe-cli/stripe

# Sur Linux :
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.0/stripe_1.19.0_linux_x86_64.tar.gz
tar -xvf stripe_1.19.0_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/

# 2. Se connecter à Stripe
stripe login

# 3. Démarrer votre serveur dans un terminal
npm start

# 4. Dans un autre terminal, écouter les webhooks
stripe listen --forward-to localhost:4000/webhook/stripe

# 5. Copier le webhook secret affiché (whsec_...) et le mettre dans .env

# 6. Tester avec un événement simulé
stripe trigger checkout.session.completed
```

## 🎯 Vérifier que tout fonctionne

### Test 1 : Le serveur démarre
```bash
npm start
```

Vous devriez voir :
```
✅ Firebase Admin initialisé
Backend prêt sur http://localhost:4000
```

Si vous voyez :
```
⚠️ Firebase non configuré
```
→ Vérifiez que le fichier `serviceAccountKey.json` existe

### Test 2 : Les prix marchés fonctionnent
Ouvrir dans le navigateur :
```
http://localhost:4000/quotes
```

Vous devriez voir un JSON avec les prix.

### Test 3 : Le webhook Stripe fonctionne
Avec Stripe CLI :
```bash
stripe trigger checkout.session.completed
```

Dans les logs du serveur, vous devriez voir :
```
💳 Paiement reçu via Checkout: cs_test_...
✅ Compte créé pour test@example.com
📧 Mot de passe généré: XyZ123...
```

## 📊 Voir les comptes créés

1. Aller sur https://console.firebase.google.com/
2. Sélectionner votre projet
3. Cliquer sur "Firestore Database"
4. Vous verrez la collection `users` avec tous les comptes

Chaque compte contient :
- email
- password (mot de passe généré)
- balance (50000 par défaut)
- status (active)
- stripeCustomerId
- createdAt

## 🔐 Sécurité IMPORTANTE

### ⚠️ Avant de mettre en production :

1. **Hasher les mots de passe**
   - Actuellement stockés en clair
   - Installer bcrypt : `npm install bcrypt`
   - Modifier la fonction `createUserAccount()`

2. **Configurer les règles Firestore**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.token.email == userId;
       }
     }
   }
   ```

3. **Utiliser HTTPS**
   - Obligatoire en production
   - Utiliser un service comme Heroku, Railway, ou Render

4. **Ne JAMAIS commit**
   - `.env`
   - `serviceAccountKey.json`
   - Ces fichiers sont déjà dans `.gitignore`

## 🚀 Déploiement

### Option 1 : Railway (recommandé, gratuit)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option 2 : Render
1. Connecter votre repo GitHub
2. Créer un nouveau "Web Service"
3. Ajouter les variables d'environnement
4. Déployer

## 📧 TODO : Envoyer les emails

Pour envoyer automatiquement les identifiants par email :

1. Installer nodemailer :
```bash
npm install nodemailer
```

2. Configurer Gmail/SendGrid/Mailgun

3. Modifier `createUserAccount()` pour envoyer l'email

## ❓ Besoin d'aide ?

- Firebase : https://firebase.google.com/docs
- Stripe : https://stripe.com/docs
- Stripe Webhooks : https://stripe.com/docs/webhooks

## 🎉 Prochaines étapes

1. ✅ Configurer Firebase
2. ✅ Configurer Stripe
3. ✅ Tester un paiement
4. 📧 Ajouter l'envoi d'emails
5. 🔐 Hasher les mots de passe
6. 🚀 Déployer en production
