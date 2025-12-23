# Twelve Data Proxy Server - Indices & Commodities

Serveur proxy WebSocket pour les indices américains, européens, asiatiques et commodities.

## Symboles supportés

### Indices Américains
- **DJI** - Dow Jones Industrial Average
- **SPX** - S&P 500
- **NDX** - Nasdaq 100
- **IXIC** - Nasdaq Composite

### Indices Européens
- **FCHI** - CAC 40 (France)
- **GDAXI** - DAX (Allemagne)
- **FTSE** - FTSE 100 (UK)
- **STOXX50E** - Euro Stoxx 50
- **IBEX** - IBEX 35 (Espagne)

### Indices Asiatiques
- **N225** - Nikkei 225 (Japon)
- **HSI** - Hang Seng (Hong Kong)
- **AXJO** - ASX 200 (Australie)
- **KOSPI** - KOSPI (Corée du Sud)
- **SENSEX** - BSE Sensex (Inde)

### Commodities
- **COPPER** - Cuivre
- **ALUMINUM** - Aluminium
- **ZINC** - Zinc
- **WTICOUSD** - Pétrole WTI
- **COFFEE** - Café

### Forex (complémentaires)
- USD/CAD, NZD/USD, EUR/GBP, EUR/JPY, GBP/JPY
- AUD/CAD, AUD/NZD, NZD/JPY, CHF/JPY, EUR/CHF
- AUD/JPY, GBP/CHF, EUR/AUD, GBP/AUD, EUR/CAD

---

## 🚀 Déploiement sur Google Cloud Run

### Prérequis
1. Compte Google Cloud avec facturation activée
2. Google Cloud CLI installé
3. Clé API Twelve Data (gratuit sur https://twelvedata.com)

### Commandes à exécuter

```bash
# 1. Se connecter à Google Cloud
gcloud auth login

# 2. Sélectionner ton projet (remplace par ton ID projet)
gcloud config set project teste-brocker

# 3. Activer les APIs nécessaires
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# 4. Aller dans le dossier du proxy
cd /Users/paulamadry/Documents/GitHub/TESTE-BROCKER-/twelvedata-proxy

# 5. Construire et déployer sur Cloud Run
gcloud run deploy twelvedata-proxy \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "TWELVEDATA_API_KEY=TA_CLE_API_ICI" \
  --port 8080 \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 2
```

### ⚠️ Important
Remplace `TA_CLE_API_ICI` par ta vraie clé API Twelve Data !

---

## 📝 Obtenir une clé API Twelve Data

1. Va sur https://twelvedata.com
2. Crée un compte gratuit
3. Va dans "API Keys" dans ton dashboard
4. Copie ta clé API

**Plan gratuit inclut :**
- 800 requêtes API/jour
- WebSocket avec 8 symboles simultanés
- Données en temps réel

**Pour plus de symboles**, upgrade vers le plan "Grow" ($29/mois) ou "Pro" ($79/mois).

---

## 🔧 Test local

```bash
# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
# Éditer .env et ajouter ta clé API

# Lancer le serveur
npm start
```

Le serveur sera disponible sur:
- HTTP: http://localhost:8080
- WebSocket: ws://localhost:8080

---

## 📡 Format des messages WebSocket

### Message de prix (envoyé aux clients)
```json
{
  "type": "trade",
  "data": [{
    "s": "DJI",
    "p": 42150.25,
    "t": 1703347200000,
    "v": 0
  }]
}
```

### Souscription (reçu des clients)
```json
{
  "type": "subscribe",
  "symbol": "DJI"
}
```

---

## 🔗 Intégration avec le broker

Une fois déployé, tu obtiendras une URL comme:
`https://twelvedata-proxy-XXXXX-ew.a.run.app`

Ajoute cette URL dans ton broker pour les symboles indices/commodities.
