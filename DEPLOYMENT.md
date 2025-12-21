# DEPLOYMENT GUIDE - AmABrocker Unified Platform

## 🎯 Quick Deployment Overview

This unified platform consists of three main components:
1. **Trading Broker** (index.html + index.js)
2. **PropFirm Dashboard** (dashboard/)
3. **Cloud Functions** (functions/)

---

## 📦 Component 1: Trading Broker

### Files
- `index.html` - Main broker interface
- `index.js` - Express backend for Yahoo Finance API proxy

### Deployment to Render.com
1. **Backend (index.js)**:
   ```bash
   # Build Command: npm install
   # Start Command: npm start
   # Environment: Node 18+
   ```

2. **Frontend (index.html)**:
   - Deploy as static site, or
   - Serve from Express (add route in index.js)

### Environment Variables
```
PORT=3000
NODE_ENV=production
```

### Testing Locally
```bash
npm install
npm start
# Open http://localhost:3000
```

---

## 📦 Component 2: Next.js Dashboard

### Location
`dashboard/` directory

### Deployment to Vercel/Render
1. **Build Settings**:
   ```bash
   # Root Directory: dashboard/
   # Build Command: npm install && npm run build
   # Start Command: npm start
   # Output Directory: .next/
   ```

2. **Environment Variables** (Create `.env.local`):
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

### Testing Locally
```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

---

## 📦 Component 3: Firebase Cloud Functions

### Location
`functions/` directory

### Deployment
1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Initialize Firebase** (if not already done):
   ```bash
   firebase init
   # Select: Functions, Firestore
   # Choose existing project or create new
   ```

3. **Deploy**:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```

### Environment Variables (Firebase)
```bash
firebase functions:config:set stripe.secret_key="sk_test_..."
firebase functions:config:set firebase.api_key="your_key"
```

---

## 🔧 Trading Assets Configuration

### 29 Assets Configured
- **20 Forex pairs** with standard lot size (100,000 units)
- **2 Metals** (Gold: 100 oz, Silver: 5,000 oz)
- **4 Commodities** (1,000 units each)
- **3 ETFs** (1 share each)

### Pip Steps
```javascript
default: 0.0001   // Standard forex
jpy: 0.01        // JPY pairs
xau: 0.1         // Gold
xag: 0.01        // Silver
commodity: 0.01  // Commodities
etf: 0.01        // ETFs
```

### Margin Calculation
- Leverage: 1:20 (default)
- Formula: `(price × lotUnits × lots) / leverage`

---

## 🔐 Security Checklist

### Before Production
- [ ] Replace hardcoded Firebase config with environment variables
- [ ] Enable Firebase Authentication
- [ ] Set up Firestore security rules
- [ ] Configure CORS properly in backend
- [ ] Enable HTTPS only
- [ ] Set up rate limiting
- [ ] Add API key validation
- [ ] Review Cloud Functions permissions

### Firestore Security Rules Example
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /trades/{tradeId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 🧪 Testing Checklist

### Broker Interface
- [ ] Load all 29 assets
- [ ] Open position for each asset type
- [ ] Verify pip calculations for commodities
- [ ] Test TP/SL functionality
- [ ] Verify margin calculations
- [ ] Check P&L updates
- [ ] Test WebSocket connection

### Dashboard
- [ ] Login/Logout flow
- [ ] View all pages (8 routes)
- [ ] Check responsive design
- [ ] Verify Firebase connection
- [ ] Test chart rendering

### Cloud Functions
- [ ] Test trade execution
- [ ] Test position closing
- [ ] Verify balance updates
- [ ] Test drawdown validation

---

## 📊 Monitoring

### Key Metrics to Track
1. **Broker**:
   - WebSocket connection uptime
   - Price update latency
   - Trade execution time
   - Error rates

2. **Dashboard**:
   - Page load times
   - Authentication success rate
   - API response times

3. **Cloud Functions**:
   - Function execution time
   - Error rates
   - Cold start frequency
   - Costs per invocation

---

## 🆘 Troubleshooting

### Broker Not Loading
1. Check Express backend is running
2. Verify WebSocket connection URL
3. Check browser console for errors
4. Verify Yahoo Finance API is accessible

### Dashboard Not Connecting to Firebase
1. Check environment variables are set
2. Verify Firebase project is active
3. Check Firebase config in `dashboard/lib/firebase/config.ts`
4. Review browser console for auth errors

### Cloud Functions Failing
1. Check Firebase billing is enabled
2. Verify function deployment: `firebase functions:list`
3. Check function logs: `firebase functions:log`
4. Verify environment variables are set

---

## 📞 Support Resources

- **Express.js**: https://expressjs.com/
- **Next.js**: https://nextjs.org/docs
- **Firebase**: https://firebase.google.com/docs
- **TradingView**: https://www.tradingview.com/widget-docs/
- **TailwindCSS**: https://tailwindcss.com/docs

---

## 🎓 Development Workflow

### Making Changes
```bash
# 1. Pull latest changes
git pull origin copilot/merge-all-dev-branches

# 2. Make your changes

# 3. Test locally
npm start                    # Test broker
cd dashboard && npm run dev  # Test dashboard

# 4. Commit and push
git add .
git commit -m "Description of changes"
git push origin copilot/merge-all-dev-branches
```

### Adding New Assets
1. Add to `WATCHLIST` array in index.html
2. Update `PIP_STEPS` if needed
3. Test calculations for the new asset
4. Update README.md with new count

---

## ✅ Final Verification

Run these commands to verify everything is ready:

```bash
# Check structure
ls -la index.html index.js README.md package.json
ls -la dashboard/ functions/

# Verify asset count
grep -c "tv:'" index.html  # Should show 29

# Check dashboard dependencies
cd dashboard && npm list --depth=0

# Check functions dependencies
cd ../functions && npm list --depth=0

# Return to root
cd ..
```

---

**Last Updated**: December 21, 2024
**Version**: 1.0.0 (Unified Production Branch)
**Status**: ✅ Ready for Deployment
