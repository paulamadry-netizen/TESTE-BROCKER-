# AmABrocker - Backend

Backend pour la plateforme de trading AmABrocker avec intégration Stripe et Firebase.

## 🚀 Installation

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configuration Firebase

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Créer un nouveau projet (ou utiliser un existant)
3. Activer **Firestore Database**
4. Aller dans **Paramètres du projet** > **Comptes de service**
5. Cliquer sur **Générer une nouvelle clé privée**
6. Télécharger le fichier JSON
7. Renommer le fichier en `serviceAccountKey.json`
8. Placer le fichier à la racine du projet

### 3. Configuration Stripe

1. Aller sur [Stripe Dashboard](https://dashboard.stripe.com/)
2. Récupérer votre **clé secrète** (sk_test_... pour les tests)
3. Créer un webhook :
   - Aller dans **Développeurs** > **Webhooks**
   - Cliquer sur **Ajouter un endpoint**
   - URL : `https://votre-domaine.com/webhook/stripe`
   - Événements à écouter :
     - `checkout.session.completed`
     - `payment_intent.succeeded`
   - Copier le **secret de signature** (whsec_...)

### 4. Variables d'environnement

Créer un fichier `.env` à partir de `.env.example` :

```bash
cp .env.example .env
```

Remplir avec vos vraies valeurs :

```env
PORT=4000
STRIPE_SECRET_KEY=sk_test_votre_vraie_cle
STRIPE_WEBHOOK_SECRET=whsec_votre_vraie_cle
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FRONTEND_URL=http://localhost:3000
```

## 🎯 Démarrer le serveur

### Mode production
```bash
npm start
```

### Mode développement (avec auto-reload)
```bash
npm run dev
```

Le serveur démarre sur `http://localhost:4000`

## 📡 Endpoints

### GET /quotes
Récupère les prix des symboles financiers depuis Yahoo Finance.

**Exemple :**
```bash
curl http://localhost:4000/quotes?symbols=DJI,SPX
```

### POST /webhook/stripe
Endpoint webhook pour Stripe (ne pas appeler manuellement).
Déclenché automatiquement par Stripe après un paiement.

## 🔄 Flux de paiement

1. Client effectue un paiement sur Stripe
2. Stripe envoie un webhook à `/webhook/stripe`
3. Le backend :
   - Vérifie la signature du webhook
   - Récupère l'email du client
   - Génère un mot de passe aléatoire
   - Crée le compte dans Firestore
   - Affiche le mot de passe dans la console

## 📊 Structure Firestore

```
users/
  ├── [email]/
  │   ├── email: "client@example.com"
  │   ├── password: "motdepasse_genere"
  │   ├── stripeCustomerId: "cus_..."
  │   ├── paymentIntentId: "pi_..."
  │   ├── balance: 50000
  │   ├── status: "active"
  │   ├── createdAt: timestamp
  │   └── lastLogin: null
```

## 🧪 Tester le webhook Stripe en local

### Utiliser Stripe CLI

1. Installer Stripe CLI :
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.0/stripe_1.19.0_linux_x86_64.tar.gz
tar -xvf stripe_1.19.0_linux_x86_64.tar.gz
```

2. Se connecter :
```bash
stripe login
```

3. Écouter les webhooks :
```bash
stripe listen --forward-to localhost:4000/webhook/stripe
```

4. Copier le webhook secret affiché et le mettre dans `.env`

5. Déclencher un test :
```bash
stripe trigger checkout.session.completed
```

## 📝 TODO

- [ ] Ajouter l'envoi d'email automatique avec les identifiants
- [ ] Hasher les mots de passe (bcrypt)
- [ ] Ajouter une route de login
- [ ] Ajouter la vérification d'email

## ⚠️ Sécurité

- Les mots de passe sont actuellement stockés en clair (À CHANGER EN PRODUCTION !)
- Toujours utiliser HTTPS en production
- Ne jamais commit le fichier `.env` ou `serviceAccountKey.json`

## 📞 Support

Pour toute question, ouvrir une issue sur GitHub.
