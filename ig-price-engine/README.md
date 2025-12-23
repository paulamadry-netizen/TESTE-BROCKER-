# IG Markets Price Engine

Real-time price streaming server for IG Markets API integration. Designed for Google Cloud Run deployment.

## Features

- **IG Markets Live API Integration** - Real-time price data from IG Markets
- **Auto-Recovery Authentication** - Automatic re-authentication on 401/403 errors
- **Session Heartbeat** - Silent session refresh every 30 minutes
- **WebSocket Streaming** - Real-time price push via Socket.io
- **REST API Fallback** - HTTP endpoints for price queries
- **Cloud Run Ready** - Optimized Dockerfile for GCP deployment

## Supported Instruments

### Indices (12)
- France 40 (CAC), Allemagne 40 (DAX), Wall Street (DOW)
- US Tech 100 (NASDAQ), US 500 (S&P500), UK 100 (FTSE)
- Australie 200 (ASX), Euro Stoxx 50, Espagne 35 (IBEX)
- Japon 225 (NIKKEI), Suisse (SMI), Hong Kong (HSI)

### Forex (20)
- EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF
- EUR/GBP, EUR/JPY, GBP/JPY, EUR/CHF, AUD/JPY, EUR/AUD
- GBP/AUD, NZD/USD, CAD/JPY, GBP/CAD, CHF/JPY, EUR/NZD
- AUD/CAD, NZD/JPY

### Commodities (6)
- Or (Gold), Argent (Silver), Pétrole Brut (Crude Oil)
- Café (Coffee), Zinc, Cuivre (Copper)

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your IG Markets credentials

# Start development server
npm run dev

# Or start production server
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IG_API_KEY` | IG Markets API Key | Required |
| `IG_IDENTIFIER` | IG Markets Username | Required |
| `IG_PASSWORD` | IG Markets Password | Required |
| `IG_BASE_URL` | IG API Base URL | `https://api.ig.com/gateway/deal` |
| `PORT` | Server port | `8080` |
| `SESSION_REFRESH_INTERVAL_MS` | Session refresh interval | `1800000` (30 min) |
| `PRICE_POLL_INTERVAL_MS` | Price polling interval | `1000` (1 sec) |

## API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Basic health check |
| `/health` | GET | Detailed health status |
| `/api/epics` | GET | List all available instruments |
| `/api/prices` | GET | Get all cached prices |
| `/api/prices/:epic` | GET | Get price for specific instrument |
| `/api/status` | GET | Get service status |
| `/api/auth/refresh` | POST | Force re-authentication |

### WebSocket Events

**Client → Server:**
- `subscribe` - Subscribe to price updates for specific epics
- `unsubscribe` - Unsubscribe from price updates
- `ping` - Connection health check

**Server → Client:**
- `prices` - Price update event
- `epics` - Available instruments list
- `pong` - Ping response

## WebSocket Usage Example

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://your-cloud-run-url.run.app');

socket.on('connect', () => {
  console.log('Connected to price engine');
  
  // Subscribe to specific instruments
  socket.emit('subscribe', ['CS.D.EURUSD.CFD.IP', 'CS.D.GD.CFD.IP']);
});

socket.on('prices', (data) => {
  console.log('Price update:', data);
  // data.data contains array of price objects
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

## Google Cloud Run Deployment

### Build and Deploy

```bash
# Set your GCP project
export PROJECT_ID=your-project-id
export REGION=europe-west1

# Build the container
gcloud builds submit --tag gcr.io/$PROJECT_ID/ig-price-engine

# Deploy to Cloud Run
gcloud run deploy ig-price-engine \
  --image gcr.io/$PROJECT_ID/ig-price-engine \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "IG_API_KEY=ig-api-key:latest,IG_IDENTIFIER=ig-identifier:latest,IG_PASSWORD=ig-password:latest" \
  --min-instances 1 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 1000
```

### Using Google Secret Manager

```bash
# Create secrets
echo -n "your-api-key" | gcloud secrets create ig-api-key --data-file=-
echo -n "your-identifier" | gcloud secrets create ig-identifier --data-file=-
echo -n "your-password" | gcloud secrets create ig-password --data-file=-

# Grant access to Cloud Run service account
gcloud secrets add-iam-policy-binding ig-api-key \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloud Run Service                     │
│  ┌─────────────────────────────────────────────────────┐│
│  │                   Express Server                     ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ ││
│  │  │  REST API   │  │  Socket.io  │  │   Health    │ ││
│  │  │  Endpoints  │  │   Server    │  │   Checks    │ ││
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘ ││
│  │         │                │                          ││
│  │  ┌──────┴────────────────┴──────┐                  ││
│  │  │        Price Service          │                  ││
│  │  │   (Polling & Broadcasting)    │                  ││
│  │  └──────────────┬────────────────┘                  ││
│  │                 │                                    ││
│  │  ┌──────────────┴────────────────┐                  ││
│  │  │      IG API Client            │                  ││
│  │  │  (Auto-Recovery Interceptor)  │                  ││
│  │  └──────────────┬────────────────┘                  ││
│  │                 │                                    ││
│  │  ┌──────────────┴────────────────┐                  ││
│  │  │     IG Auth Service           │                  ││
│  │  │  (CST & Token Management)     │                  ││
│  │  └───────────────────────────────┘                  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   IG Markets API      │
              │  (Live Trading API)   │
              └───────────────────────┘
```

## License

ISC
