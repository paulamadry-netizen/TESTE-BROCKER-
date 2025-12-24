"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Loader2,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { PerformanceChart } from "@/components/charts/PerformanceChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercentage } from "@/lib/utils";

interface UserData {
  email: string;
  accountBalance: number;
  accountStatus: string;
  challengeType: string;
  profitTarget: number;
  maxDrawdown: number;
  tradingDays: number;
  stripeCustomerId: string;
  stripeSessionId?: string;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserData() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          setUserData(userDocSnap.data() as UserData);
        } else {
          console.error("No user document found in Firestore");
        }

        // Load trades for performance chart
        const tradesRef = collection(db, "trades");
        const q = query(tradesRef, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);

        const loadedTrades: any[] = [];
        querySnapshot.forEach((doc) => {
          loadedTrades.push({ id: doc.id, ...doc.data() });
        });

        // Sort by openedAt
        loadedTrades.sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
        setTrades(loadedTrades);
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadUserData();
    }
  }, [user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{t("common.noData")}</p>
      </div>
    );
  }

  // Check if user has an active trading account
  if (userData.accountStatus !== 'active' || !userData.accountBalance || userData.accountBalance === 0) {
    return (
      <div className="flex flex-col gap-6 p-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        
        <Card className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Target className="h-16 w-16 text-orange-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t("dashboard.noActiveAccount") || "Pas de compte actif"}</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              {t("dashboard.purchaseAccountMessage") || "Vous n'avez pas encore de compte de trading actif. Achetez un plan pour commencer à trader et accéder à votre capital."}
            </p>
            <a
              href="/#pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-12 py-3 px-8"
            >
              <DollarSign className="mr-2 h-5 w-5" />
              {t("dashboard.purchasePlan") || "Acheter un plan"}
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate stats from real trades
  const closedTrades = trades.filter(t => t.status === 'closed');
  const recentTrades = closedTrades.slice(-5).reverse(); // Last 5 trades
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.pnl > 0);
  const losingTrades = closedTrades.filter(t => t.pnl < 0);
  const winningTradesCount = winningTrades.length;
  const losingTradesCount = losingTrades.length;

  // Win Rate: (trades gagnants / trades totaux) * 100
  const winRate = totalTrades > 0 ? ((winningTradesCount / totalTrades) * 100).toFixed(2) : "0.00";

  // Calculate initial balance (before first trade) and current balance
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const initialBalance = userData.accountBalance - totalPnl; // Reconstruct initial balance
  const currentBalance = userData.accountBalance;
  const profitLoss = currentBalance - initialBalance;
  const profitLossPercentage = initialBalance !== 0
    ? ((profitLoss / initialBalance) * 100).toFixed(2)
    : "0.00";
  const profitTargetAmount = (initialBalance * userData.profitTarget) / 100;
  const maxDrawdownAmount = (initialBalance * userData.maxDrawdown) / 100;
  const dailyMaxLoss = (initialBalance * 3) / 100; // 3% daily max loss

  // Calculate Average Win: moyenne des trades gagnants uniquement
  const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = winningTradesCount > 0 ? totalWins / winningTradesCount : 0;

  // Calculate Average Loss: moyenne des trades perdants uniquement (en valeur absolue)
  const totalLosses = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0);
  const avgLoss = losingTradesCount > 0 ? totalLosses / losingTradesCount : 0;

  // Profit Factor: (total gains / total pertes absolues) ou 0 si pas de pertes
  const profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : (totalWins > 0 ? "∞" : "0.00");

  // Calculate Current Drawdown: différence entre le pic le plus haut et le solde actuel
  let peakBalance = initialBalance;
  let currentDrawdown = 0;
  let runningBalanceForDD = initialBalance;

  closedTrades.forEach((trade) => {
    runningBalanceForDD += trade.pnl || 0;
    if (runningBalanceForDD > peakBalance) {
      peakBalance = runningBalanceForDD;
    }
  });

  currentDrawdown = peakBalance - currentBalance;
  const currentDrawdownPercentage = peakBalance !== 0
    ? ((currentDrawdown / peakBalance) * 100).toFixed(2)
    : "0.00";

  // Build performance chart data from trades
  const performanceData: { date: string; balance: number; profit: number }[] = [];

  // Helper function to format date safely
  const formatTradeDate = (dateValue: any): string => {
    try {
      if (!dateValue) return new Date().toLocaleDateString('fr-FR');
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return new Date().toLocaleDateString('fr-FR');
      return date.toLocaleDateString('fr-FR');
    } catch {
      return new Date().toLocaleDateString('fr-FR');
    }
  };

  // Start with initial balance
  let runningBalance = initialBalance;
  const startDate = closedTrades.length > 0
    ? formatTradeDate(closedTrades[0].openedAt)
    : new Date().toLocaleDateString('fr-FR');

  performanceData.push({
    date: startDate,
    balance: Number.isFinite(initialBalance) ? initialBalance : 0,
    profit: 0
  });

  // Add each closed trade to build the curve
  closedTrades.forEach((trade) => {
    const tradePnl = Number.isFinite(trade.pnl) ? trade.pnl : 0;
    runningBalance += tradePnl;
    performanceData.push({
      date: formatTradeDate(trade.closedAt || trade.openedAt),
      balance: Number.isFinite(runningBalance) ? runningBalance : initialBalance,
      profit: tradePnl
    });
  });

  // If no trades, add current date with initial balance
  if (performanceData.length === 1) {
    performanceData.push({
      date: new Date().toLocaleDateString('fr-FR'),
      balance: Number.isFinite(initialBalance) ? initialBalance : 0,
      profit: 0
    });
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* Trading Platform Link */}
      <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/20">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h3 className="text-xl font-bold mb-1">{t("dashboard.readyToTrade")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.accessPlatform")}
            </p>
          </div>
          <a
            href="https://teste-brocker.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-6"
          >
            <Activity className="mr-2 h-4 w-4" />
            {t("dashboard.launchBroker")}
          </a>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("dashboard.accountBalance")}
          value={formatCurrency(currentBalance)}
          change={`${formatPercentage(parseFloat(profitLossPercentage))} ${t("dashboard.fromStart")}`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          title={t("dashboard.totalProfit")}
          value={formatCurrency(profitLoss)}
          change={`${t("dashboard.target")}: ${formatCurrency(profitTargetAmount)}`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <StatCard
          title={t("dashboard.currentDrawdown")}
          value={formatCurrency(currentDrawdown)}
          change={`${t("dashboard.max")}: ${formatCurrency(maxDrawdownAmount)} (${userData.maxDrawdown}%)`}
          changeType={currentDrawdown === 0 ? "positive" : currentDrawdown < maxDrawdownAmount ? "neutral" : "negative"}
          icon={TrendingDown}
        />
        <StatCard
          title={t("dashboard.winRate")}
          value={totalTrades > 0 ? `${winRate}%` : "N/A"}
          change={`${winningTradesCount}/${totalTrades} ${t("dashboard.trades")}`}
          changeType={parseFloat(winRate) >= 60 ? "positive" : "negative"}
          icon={Activity}
        />
      </div>

      {/* Challenge Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t("dashboard.challengeProgress")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("dashboard.profitTarget")}</span>
              <span className="font-semibold">
                {formatCurrency(profitLoss)} / {formatCurrency(profitTargetAmount)}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `${
                    profitTargetAmount > 0
                      ? Math.min(Math.max((profitLoss / profitTargetAmount) * 100, 0), 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">{t("dashboard.tradingDays")}</p>
              <p className="text-2xl font-bold">
                {userData.tradingDays}/30
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("dashboard.accountType")}</p>
              <Badge variant="secondary" className="mt-1">
                {userData.challengeType.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("dashboard.status")}</p>
              <Badge
                variant={userData.accountStatus === "active" ? "success" : "destructive"}
                className="mt-1"
              >
                {t(`status.${userData.accountStatus}`)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Chart */}
      <PerformanceChart data={performanceData} />

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentTrades")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentTrades.length > 0 ? (
              recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <Badge variant={trade.side === "BUY" ? "success" : "destructive"}>
                      {trade.side}
                    </Badge>
                    <div>
                      <p className="font-semibold">{trade.symbol}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(trade.closedAt || trade.openedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        (trade.pnl || 0) >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {(trade.pnl || 0) >= 0 ? "+" : ""}
                      {formatCurrency(trade.pnl || 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {trade.lots} {trade.lots > 1 ? t("dashboard.lots") : t("dashboard.lot")}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t("dashboard.noTrades")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trading Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("dashboard.profitFactor")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              profitFactor === "∞" ? "text-green-500" :
              parseFloat(profitFactor) >= 2 ? "text-green-500" :
              parseFloat(profitFactor) >= 1 ? "text-yellow-500" : "text-red-500"
            }`}>
              {profitFactor}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.profitFactorDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("dashboard.averageWin")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(avgWin)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.perWinningTrade")} ({winningTradesCount} {t("dashboard.trades")})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("dashboard.averageLoss")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(avgLoss)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.perLosingTrade")} ({losingTradesCount} {t("dashboard.trades")})
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}