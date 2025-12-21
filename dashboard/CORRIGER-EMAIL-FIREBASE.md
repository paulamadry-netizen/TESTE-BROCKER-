# 🔧 Corriger le problème d'email null dans Firebase

## Le problème
Quand un paiement Stripe est effectué, un utilisateur est créé dans Firebase avec un mot de passe, mais l'email reste "null". Cela empêche la connexion au dashboard.

## Solution 1 : Vérifier votre intégration actuelle

### Étape 1 : Identifier où se trouve le code d'intégration

Vérifiez dans cet ordre :

1. **Firebase Extensions** (le plus probable)
   - Allez sur : https://console.firebase.google.com/project/teste-brocker/extensions
   - Cherchez une extension Stripe installée
   - Si vous voyez "Run Payments with Stripe" ou similaire, c'est là

2. **Cloud Functions Firebase**
   - Allez sur : https://console.firebase.google.com/project/teste-brocker/functions
   - Cherchez une fonction qui s'appelle comme "stripeWebhook" ou "createUser"

3. **Webhook externe** (dans votre site Framer ou ailleurs)
   - Vérifiez dans les paramètres de votre site vitrine

### Étape 2 : Corriger le code

Le code actuel crée probablement l'utilisateur comme ça (INCORRECT) :

```javascript
// ❌ CODE ACTUEL (INCORRECT)
const userRecord = await admin.auth().createUser({
  uid: someId,
  password: somePassword,
  // L'email manque !
});
```

Il faut le corriger pour inclure l'email (CORRECT) :

```javascript
// ✅ CODE CORRIGÉ
const userRecord = await admin.auth().createUser({
  uid: someId,
  email: customerEmail,  // ← AJOUTER CETTE LIGNE
  password: somePassword,
  emailVerified: false,
});
```

## Solution 2 : Utiliser une Cloud Function Firebase (recommandé)

Si vous ne trouvez pas le code existant, créez une nouvelle Cloud Function qui va :
1. Écouter les paiements Stripe
2. Créer correctement l'utilisateur avec email

### Fichier : functions/index.js

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);

admin.initializeApp();

// Webhook Stripe qui écoute les paiements
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = functions.config().stripe.webhook_secret;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Quand un paiement est complété
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Récupérer l'email du client
    const customerEmail = session.customer_details?.email || session.customer_email;

    if (!customerEmail) {
      console.error('Pas d\'email trouvé dans la session Stripe');
      return res.status(400).send('Email manquant');
    }

    try {
      // Générer un mot de passe aléatoire
      const randomPassword = Math.random().toString(36).slice(-12) +
                            Math.random().toString(36).slice(-12);

      // ✅ CRÉER L'UTILISATEUR AVEC EMAIL
      const userRecord = await admin.auth().createUser({
        email: customerEmail,  // ← EMAIL ICI !
        password: randomPassword,
        emailVerified: false,
      });

      console.log('✅ Utilisateur créé avec email:', customerEmail);

      // Créer le document Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        email: customerEmail,
        stripeCustomerId: session.customer,
        challengeType: session.metadata?.challengeType || 'standard',
        accountBalance: session.amount_total / 100,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        accountStatus: 'active',
      });

      // Envoyer un email de réinitialisation de mot de passe
      const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);

      // TODO : Envoyer cet email au client
      console.log('🔗 Lien de réinitialisation:', resetLink);

      res.json({ success: true, uid: userRecord.uid });
    } catch (error) {
      console.error('❌ Erreur création utilisateur:', error);

      // Si l'utilisateur existe déjà, mettre à jour Firestore
      if (error.code === 'auth/email-already-exists') {
        const existingUser = await admin.auth().getUserByEmail(customerEmail);
        await admin.firestore().collection('users').doc(existingUser.uid).update({
          stripeCustomerId: session.customer,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('✅ Utilisateur existant mis à jour');
        return res.json({ success: true, uid: existingUser.uid });
      }

      res.status(500).json({ error: error.message });
    }
  }

  res.json({ received: true });
});
```

## Solution 3 : Correction manuelle temporaire

En attendant de corriger le code, vous pouvez manuellement corriger les utilisateurs existants :

### Via Firebase Console :
1. Allez sur : https://console.firebase.google.com/project/teste-brocker/authentication/users
2. Pour chaque utilisateur avec email "null" :
   - Cliquez sur l'utilisateur
   - Cliquez sur "Edit user"
   - Ajoutez l'email manuellement
   - Sauvegardez

### Via script (plus rapide si beaucoup d'utilisateurs) :

Créez un fichier `scripts/fix-null-emails.js` :

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Téléchargez depuis Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function fixNullEmails() {
  const listUsersResult = await admin.auth().listUsers();

  for (const user of listUsersResult.users) {
    if (!user.email) {
      console.log('❌ Utilisateur sans email trouvé:', user.uid);

      // Vous devrez trouver l'email depuis Stripe ou Firestore
      // Exemple si l'email est dans Firestore :
      const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
      const email = userDoc.data()?.email;

      if (email) {
        await admin.auth().updateUser(user.uid, {
          email: email
        });
        console.log('✅ Email mis à jour:', email);
      }
    }
  }
}

fixNullEmails().then(() => {
  console.log('Terminé !');
  process.exit(0);
});
```

## Comment déployer la Cloud Function

```bash
# 1. Installer Firebase CLI
npm install -g firebase-tools

# 2. Se connecter
firebase login

# 3. Initialiser Functions (si pas déjà fait)
firebase init functions

# 4. Configurer les secrets Stripe
firebase functions:config:set stripe.secret_key="sk_test_..." stripe.webhook_secret="whsec_..."

# 5. Déployer
firebase deploy --only functions

# 6. Configurer le webhook dans Stripe Dashboard
# URL du webhook : https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhook
# Événements à écouter : checkout.session.completed
```

## Résumé

**Pour corriger immédiatement** : Ajoutez manuellement l'email dans Firebase Console

**Pour corriger définitivement** : Modifiez le code qui crée les utilisateurs pour inclure `email: customerEmail`

**Où chercher le code** :
1. Firebase Extensions
2. Cloud Functions Firebase
3. Webhook dans votre site vitrine

L'important est de trouver la ligne qui fait `admin.auth().createUser()` et de s'assurer qu'elle inclut l'email du client Stripe.
