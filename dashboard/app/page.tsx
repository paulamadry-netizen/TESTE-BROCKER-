"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
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
  const [userData, setUserData] = useState<UserData | null>(null);
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
        <p className="text-muted-foreground">No account data found</p>
      </div>
    );
  }

  // TODO: Load real trades from Firestore
  const recentTrades: any[] = []; // Empty for new accounts
  const totalTrades = 0;
  const winningTrades = 0;
  const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;

  const initialBalance = userData.accountBalance;
  const currentBalance = userData.accountBalance; // TODO: Update with real-time balance from trades
  const profitLoss = currentBalance - initialBalance;
  const profitLossPercentage = ((profitLoss / initialBalance) * 100).toFixed(2);
  const profitTargetAmount = (initialBalance * userData.profitTarget) / 100;
  const maxDrawdownAmount = (initialBalance * userData.maxDrawdown) / 100;

  // Performance data - flat line at initial balance for new accounts
  const performanceData = [
    { date: new Date().toLocaleDateString(), balance: initialBalance, profit: 0 }
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's your trading overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Account Balance"
          value={formatCurrency(currentBalance)}
          change={`${formatPercentage(parseFloat(profitLossPercentage))} from start`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          title="Total Profit"
          value={formatCurrency(profitLoss)}
          change={`Target: ${formatCurrency(profitTargetAmount)}`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <StatCard
          title="Current Drawdown"
          value={formatCurrency(0)}
          change={`Max: ${formatCurrency(maxDrawdownAmount)}`}
          changeType="positive"
          icon={TrendingDown}
        />
        <StatCard
          title="Win Rate"
          value={totalTrades > 0 ? `${winRate}%` : "N/A"}
          change={`${winningTrades}/${totalTrades} trades`}
          changeType={winRate >= 60 ? "positive" : "negative"}
          icon={Activity}
        />
      </div>

      {/* Challenge Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Challenge Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Profit Target</span>
              <span className="font-semibold">
                {formatCurrency(profitLoss)} / {formatCurrency(profitTargetAmount)}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `${Math.min((profitLoss / profitTargetAmount) * 100, 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Trading Days</p>
              <p className="text-2xl font-bold">
                {userData.tradingDays}/30
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Type</p>
              <Badge variant="secondary" className="mt-1">
                {userData.challengeType.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge
                variant={userData.accountStatus === "active" ? "success" : "destructive"}
                className="mt-1"
              >
                {userData.accountStatus.toUpperCase()}
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
          <CardTitle>Recent Trades</CardTitle>
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
                    <Badge variant={trade.type === "BUY" ? "success" : "destructive"}>
                      {trade.type}
                    </Badge>
                    <div>
                      <p className="font-semibold">{trade.symbol}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(trade.openTime).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        trade.profit >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {formatCurrency(trade.profit)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Vol: {trade.volume}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No trades yet. Start trading to see your activity here.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trading Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">N/A</div>
            <p className="text-xs text-muted-foreground mt-1">
              Ratio of gross profit to gross loss
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Win</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per winning trade
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per losing trade
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}