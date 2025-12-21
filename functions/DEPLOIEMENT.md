# 🚀 Guide de déploiement de la fonction corrigée

## Étape 1 : Installer Firebase CLI (si pas déjà fait)

```bash
npm install -g firebase-tools
```

## Étape 2 : Se connecter à Firebase

```bash
firebase login
```

## Étape 3 : Configurer les variables d'environnement

Vous devez configurer vos clés Stripe :

```bash
# Remplacez par vos vraies clés Stripe
firebase functions:config:set \
  stripe.secret_key="sk_test_votre_cle_secrete" \
  stripe.webhook_secret="whsec_votre_webhook_secret"
```

**Où trouver ces clés :**
- `stripe.secret_key` : https://dashboard.stripe.com/test/apikeys
- `stripe.webhook_secret` : https://dashboard.stripe.com/test/webhooks (créer un webhook si pas encore fait)

## Étape 4 : Installer les dépendances

```bash
cd functions
npm install
cd ..
```

## Étape 5 : Déployer la fonction

```bash
firebase deploy --only functions:stripeWebhook
```

## Étape 6 : Configurer le webhook dans Stripe

1. Allez sur : https://dashboard.stripe.com/test/webhooks
2. Cliquez "Add endpoint"
3. URL du webhook : `https://us-central1-teste-brocker.cloudfunctions.net/stripeWebhook`
4. Sélectionnez ces événements :
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Cliquez "Add endpoint"
6. Copiez le "Signing secret" (commence par `whsec_...`)
7. Configurez-le :
   ```bash
   firebase functions:config:set stripe.webhook_secret="whsec_copié_ici"
   firebase deploy --only functions:stripeWebhook
   ```

## Étape 7 : Tester

Faites un paiement test sur votre site vitrine et vérifiez dans Firebase Console que :
1. L'utilisateur est créé dans Authentication
2. ✅ **L'email est maintenant présent** (plus de "null" !)
3. Le document Firestore est créé dans la collection `users`

## Vérification des logs

Pour voir si ça fonctionne :

```bash
firebase functions:log --only stripeWebhook
```

Vous devriez voir :
```
✅ Utilisateur créé avec succès!
   - UID: xxxxx
   - Email: client@example.com
✅ Document Firestore créé
```

## En cas d'erreur

Si vous voyez `❌ ERREUR CRITIQUE: Aucun email trouvé`, c'est que Stripe n'envoie pas l'email dans le webhook. Vérifiez :
1. Que vous collectez l'email dans le formulaire Stripe Checkout
2. Que le mode de paiement inclut l'email du client

## Commandes utiles

```bash
# Voir les logs en temps réel
firebase functions:log --only stripeWebhook --follow

# Redéployer après modification
firebase deploy --only functions:stripeWebhook

# Voir la config actuelle
firebase functions:config:get
```
