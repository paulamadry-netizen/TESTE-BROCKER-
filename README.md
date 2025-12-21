# AmABrocker - Complete Trading Platform

## Overview
Unified production-ready trading platform with broker interface, Next.js dashboard, and Firebase Cloud Functions.

## 📦 Project Structure

```
TESTE-BROCKER-/
├── index.html              # Main broker trading interface
├── index.js                # Backend Express server (Yahoo Finance API)
├── dashboard/              # Next.js 14 PropFirm Dashboard
│   ├── app/               # App routes (dashboard, accounts, analytics, trades, etc.)
│   ├── components/        # React components (UI, charts, auth)
│   ├── lib/               # Utilities and Firebase config
│   ├── context/           # React contexts (Auth)
│   ├── data/              # Mock data for development
│   ├── package.json       # Dashboard dependencies
│   ├── tsconfig.json      # TypeScript configuration
│   ├── tailwind.config.ts # TailwindCSS configuration
│   ├── next.config.js     # Next.js configuration
│   └── postcss.config.js  # PostCSS configuration
└── functions/             # Firebase Cloud Functions
    ├── index.js           # Cloud Functions (trade execution, validation)
    └── package.json       # Functions dependencies
```

## 🎯 Trading Assets (29 Total)

### Forex Pairs (20)
1. EUR/USD
2. USD/JPY
3. GBP/USD
4. USD/CHF
5. AUD/USD
6. EUR/GBP
7. EUR/JPY
8. GBP/JPY
9. EUR/CHF
10. USD/CAD
11. NZD/USD
12. AUD/JPY
13. GBP/CHF
14. EUR/AUD
15. GBP/AUD
16. EUR/CAD
17. AUD/CAD
18. AUD/NZD
19. NZD/JPY
20. CHF/JPY

### Metals (2)
1. Gold (XAU/USD)
2. Silver (XAG/USD)

### Commodities (4)
1. Copper
2. Zinc
3. Coffee
4. WTI Crude Oil

### ETFs (3)
1. SPY (S&P 500)
2. DIA (Dow Jones)
3. QQQ (Nasdaq 100)

## ✨ Features

### Broker Interface (index.html)
- ✅ 29 tradable assets with real-time pricing
- ✅ TradingView chart integration
- ✅ Position management (open/close trades)
- ✅ Take Profit / Stop Loss functionality
- ✅ P&L calculation in real-time
- ✅ WebSocket connection for live prices
- ✅ Commodity-specific calculations
  - Different lot sizes (commodity: 1000 units, silver: 5000 oz)
  - Adapted pip steps and margin requirements
  - Display "contrat" instead of "lot" for commodities

### Dashboard (dashboard/)
- ✅ Next.js 14 with App Router
- ✅ TypeScript for type safety
- ✅ TailwindCSS for styling
- ✅ Recharts for analytics
- ✅ Firebase Auth integration structure
- ✅ Multiple pages:
  - Dashboard overview
  - Trade history
  - Account management
  - Analytics
  - Settings
  - Login/Auth
  - Challenge tracking
  - Payout management

### Cloud Functions (functions/)
- ✅ Trade execution validation
- ✅ Position closing with PnL calculation
- ✅ Balance updates
- ✅ Drawdown validation
- ✅ Trading hours verification

## 🚀 Quick Start

### Broker Interface
```bash
# The broker runs standalone with index.html
# Start the backend server:
node index.js

# Open index.html in a browser
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev
# Dashboard runs on http://localhost:3000
```

### Cloud Functions
```bash
cd functions
npm install
# Deploy to Firebase (requires Firebase CLI)
firebase deploy --only functions
```

## 🔧 Technical Details

### Pip Steps Configuration
```javascript
PIP_STEPS = {
  default: 0.0001,  // Standard forex
  jpy: 0.01,        // JPY pairs
  xau: 0.1,         // Gold
  xag: 0.01,        // Silver
  commodity: 0.01,  // Commodities
  etf: 0.01         // ETFs
}
```

### Lot Units
- Forex: 100,000 units (standard lot)
- Gold: 100 oz
- Silver: 5,000 oz
- Commodities: 1,000 units
- ETFs: 1 share

### Margin Requirements
- Leverage: 1:20 (configurable)
- Commodity margin: `(price × lotUnits × lots) / leverage`
- Forex margin: standard calculation based on base currency

## 📝 Development Notes

This repository was created by merging:
1. Base files from main branch (index.html, index.js)
2. 20+ new tradable assets from PR #2 with commodity support
3. Complete Next.js dashboard from PR #1
4. Firebase Cloud Functions structure from PR #1

## 🔐 Security
- Balance updates server-side only (via Cloud Functions)
- Trade validation on backend
- Drawdown monitoring
- Authentication required for dashboard access

## 📄 License
Private project - All rights reserved
