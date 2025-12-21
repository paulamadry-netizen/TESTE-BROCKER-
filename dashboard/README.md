# PropFirm Dashboard

Professional trading prop firm dashboard for managing challenges and funded accounts.

## Features

- 📊 **Dashboard Overview**: Real-time account metrics and performance
- 🎯 **Challenge Tracking**: Monitor challenge rules and progress
- 📈 **Trade History**: Complete history of all trades
- 💼 **Account Management**: Manage multiple challenge and funded accounts
- 📉 **Analytics**: Detailed performance analytics with charts
- ⚙️ **Settings**: Customize notifications and preferences

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Charts**: Recharts
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for Production

```bash
npm run build
npm start
```

## Deploy to Render

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Set the following:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node

## Project Structure

```
dashboard/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard home
│   ├── challenge/         # Challenge progress
│   ├── trades/            # Trade history
│   ├── accounts/          # Account management
│   ├── analytics/         # Analytics & charts
│   └── settings/          # User settings
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   ├── dashboard/        # Dashboard-specific components
│   └── charts/           # Chart components
├── data/                 # Mock data
├── lib/                  # Utility functions
└── public/               # Static assets
```

## Firebase Integration (Coming Soon)

The dashboard is prepared for Firebase integration. To connect with your broker:

1. Set up Firebase project
2. Configure Firestore database
3. Update environment variables
4. Connect broker data stream

## Features in Development

- Firebase real-time data synchronization
- User authentication
- Real-time notifications
- Advanced analytics
- Multi-language support
- Mobile responsive improvements

## License

ISC
