# Intégration Stripe → Firebase Authentication

## Problème actuel
Les utilisateurs créés via Stripe n'ont pas d'email dans Firebase Authentication, donc ne peuvent pas se connecter au dashboard.

## Solution

### 1. Webhook Stripe
Quand un paiement est complété sur votre site vitrine, Stripe envoie un webhook. Dans ce webhook, vous devez :

```javascript
// Exemple de webhook Stripe (à implémenter sur votre backend)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "teste-brocker",
    // ... autres credentials
  })
});

app.post('/webhook', async (req, res) => {
  const event = req.body;

  // Quand un paiement est complété
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Récupérer l'email du client depuis Stripe
    const customerEmail = session.customer_details.email;
    const customerId = session.customer;

    try {
      // 1. Créer l'utilisateur dans Firebase Authentication
      const userRecord = await admin.auth().createUser({
        email: customerEmail,
        password: generateRandomPassword(), // Générer un mot de passe aléatoire
        emailVerified: false,
      });

      // 2. Envoyer un email de réinitialisation de mot de passe
      const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);

      // Envoyer cet email au client avec ses identifiants
      await sendWelcomeEmail(customerEmail, resetLink);

      // 3. Créer le document utilisateur dans Firestore
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        email: customerEmail,
        stripeCustomerId: customerId,
        challengeType: session.metadata.challengeType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        accountStatus: 'active',
        // ... autres données
      });

      console.log('✅ Utilisateur créé:', userRecord.uid);
    } catch (error) {
      console.error('❌ Erreur création utilisateur:', error);
    }
  }

  res.json({ received: true });
});

function generateRandomPassword() {
  return Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
}

async function sendWelcomeEmail(email, resetLink) {
  // Utiliser un service d'email (SendGrid, Mailgun, etc.)
  // Envoyer un email avec :
  // - Email de connexion : {email}
  // - Lien pour définir son mot de passe : {resetLink}
  // - Lien vers le dashboard : https://votre-dashboard.com/login
}
```

### 2. Alternative : Permettre la création de mot de passe lors de la première connexion

Si vous ne voulez pas gérer les webhooks immédiatement, vous pouvez :

1. Créer les utilisateurs Firebase avec juste l'email (sans mot de passe)
2. Sur la page de connexion, détecter si l'utilisateur existe mais n'a pas de mot de passe
3. Lui permettre de créer son mot de passe

### 3. Pour tester immédiatement

Créez un utilisateur de test avec email/password :

**Option A - Via Firebase Console :**
1. Allez sur : https://console.firebase.google.com/project/teste-brocker/authentication/users
2. Cliquez "Add user"
3. Email : `test@propfirm.com`
4. Password : `test123456`

**Option B - Via script Node.js :**
```bash
cd dashboard
npm install firebase
node scripts/create-test-user.js
```

Ensuite connectez-vous sur le dashboard avec :
- Email : `test@propfirm.com`
- Mot de passe : `test123456`

## Recommandation

Pour une solution complète et professionnelle :
1. Implémentez le webhook Stripe pour créer automatiquement les comptes Firebase Auth
2. Envoyez un email de bienvenue avec un lien pour définir le mot de passe
3. Le client reçoit ses identifiants et peut se connecter au dashboard

