export interface Trade {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  openTime: Date;
  closeTime?: Date;
  openPrice: number;
  closePrice?: number;
  volume: number;
  profit: number;
  status: "OPEN" | "CLOSED";
  commission: number;
}

export interface Account {
  id: string;
  accountNumber: string;
  type: "CHALLENGE" | "FUNDED";
  status: "ACTIVE" | "INACTIVE" | "PASSED" | "FAILED";
  balance: number;
  equity: number;
  initialBalance: number;
  profitTarget: number;
  maxDrawdown: number;
  currentDrawdown: number;
  daysTraded: number;
  totalDays: number;
  createdAt: Date;
}

export interface ChallengeRule {
  name: string;
  current: number;
  target: number;
  status: "PASSED" | "FAILED" | "IN_PROGRESS";
  description: string;
}

// Mock User Data
export const mockUser = {
  id: "user_001",
  name: "John Trader",
  email: "john@propfirm.com",
  joinedAt: new Date("2024-01-15"),
};

// Mock Accounts
export const mockAccounts: Account[] = [
  {
    id: "acc_001",
    accountNumber: "PF-CH-001234",
    type: "CHALLENGE",
    status: "ACTIVE",
    balance: 54750,
    equity: 54750,
    initialBalance: 50000,
    profitTarget: 5000,
    maxDrawdown: 2500,
    currentDrawdown: 750,
    daysTraded: 8,
    totalDays: 30,
    createdAt: new Date("2024-11-01"),
  },
  {
    id: "acc_002",
    accountNumber: "PF-FD-005678",
    type: "FUNDED",
    status: "ACTIVE",
    balance: 102350,
    equity: 103100,
    initialBalance: 100000,
    profitTarget: 10000,
    maxDrawdown: 5000,
    currentDrawdown: 250,
    daysTraded: 45,
    totalDays: 90,
    createdAt: new Date("2024-09-15"),
  },
];

// Mock Trades
export const mockTrades: Trade[] = [
  {
    id: "trade_001",
    symbol: "EURUSD",
    type: "BUY",
    openTime: new Date("2024-12-10T08:30:00"),
    closeTime: new Date("2024-12-10T14:20:00"),
    openPrice: 1.0550,
    closePrice: 1.0580,
    volume: 1.5,
    profit: 450,
    status: "CLOSED",
    commission: 15,
  },
  {
    id: "trade_002",
    symbol: "GBPUSD",
    type: "SELL",
    openTime: new Date("2024-12-10T09:15:00"),
    closeTime: new Date("2024-12-10T11:45:00"),
    openPrice: 1.2720,
    closePrice: 1.2690,
    volume: 2.0,
    profit: 600,
    status: "CLOSED",
    commission: 20,
  },
  {
    id: "trade_003",
    symbol: "USDJPY",
    type: "BUY",
    openTime: new Date("2024-12-10T13:00:00"),
    openPrice: 149.50,
    volume: 1.0,
    profit: 125,
    status: "OPEN",
    commission: 10,
  },
  {
    id: "trade_004",
    symbol: "XAUUSD",
    type: "SELL",
    openTime: new Date("2024-12-09T10:30:00"),
    closeTime: new Date("2024-12-09T15:20:00"),
    openPrice: 2045.50,
    closePrice: 2038.20,
    volume: 0.5,
    profit: 365,
    status: "CLOSED",
    commission: 8,
  },
  {
    id: "trade_005",
    symbol: "EURUSD",
    type: "SELL",
    openTime: new Date("2024-12-09T08:00:00"),
    closeTime: new Date("2024-12-09T09:30:00"),
    openPrice: 1.0565,
    closePrice: 1.0575,
    volume: 1.0,
    profit: -100,
    status: "CLOSED",
    commission: 10,
  },
  {
    id: "trade_006",
    symbol: "BTCUSD",
    type: "BUY",
    openTime: new Date("2024-12-08T14:00:00"),
    closeTime: new Date("2024-12-08T18:30:00"),
    openPrice: 42100,
    closePrice: 42850,
    volume: 0.1,
    profit: 750,
    status: "CLOSED",
    commission: 25,
  },
];

// Mock Challenge Rules
export const mockChallengeRules: ChallengeRule[] = [
  {
    name: "Profit Target",
    current: 4750,
    target: 5000,
    status: "IN_PROGRESS",
    description: "Atteindre l'objectif de profit",
  },
  {
    name: "Max Daily Loss",
    current: 0,
    target: 1250,
    status: "PASSED",
    description: "Ne pas dépasser la perte journalière maximale",
  },
  {
    name: "Max Total Drawdown",
    current: 750,
    target: 2500,
    status: "PASSED",
    description: "Ne pas dépasser le drawdown total maximal",
  },
  {
    name: "Trading Days",
    current: 8,
    target: 5,
    status: "PASSED",
    description: "Trader au moins 5 jours",
  },
];

// Mock Performance Data for Charts
export const mockPerformanceData = [
  { date: "Dec 1", balance: 50000, profit: 0 },
  { date: "Dec 2", balance: 50500, profit: 500 },
  { date: "Dec 3", balance: 51200, profit: 700 },
  { date: "Dec 4", balance: 50800, profit: -400 },
  { date: "Dec 5", balance: 51500, profit: 700 },
  { date: "Dec 6", balance: 52300, profit: 800 },
  { date: "Dec 7", balance: 52100, profit: -200 },
  { date: "Dec 8", balance: 53200, profit: 1100 },
  { date: "Dec 9", balance: 53650, profit: 450 },
  { date: "Dec 10", balance: 54750, profit: 1100 },
];

// Mock Statistics
export const mockStatistics = {
  totalTrades: 24,
  winningTrades: 18,
  losingTrades: 6,
  winRate: 75,
  profitFactor: 2.8,
  averageWin: 485,
  averageLoss: -180,
  bestTrade: 1250,
  worstTrade: -380,
  averageTradeDuration: "4h 32m",
};
