"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { useAccount } from "@/context/AccountContext";
import { useLanguage } from "@/context/LanguageContext";
import { History, TrendingUp, TrendingDown, DollarSign, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  closePrice?: number;
  lots: number;
  pnl?: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
}

export default function TradesPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeAccount, loading: accountLoading } = useAccount();
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrades() {
      if (!user || !activeAccount) {
        setLoading(false);
        return;
      }

      try {
        const tradesRef = collection(db, "trades");
        // Query by userId only (avoid composite index), then filter by active account
        const q = query(tradesRef, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);

        const loadedTrades: Trade[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (!data) return;
          if (!data.accountId || data.accountId !== activeAccount.id) return;
          loadedTrades.push({
            id: doc.id,
            symbol: data.symbol,
            side: data.side,
            entryPrice: data.entryPrice,
            closePrice: data.closePrice,
            lots: data.lots,
            pnl: data.pnl,
            status: data.status,
            openedAt: data.openedAt,
            closedAt: data.closedAt,
          });
        });

        // Sort in JavaScript instead of Firestore
        loadedTrades.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

        setTrades(loadedTrades);
        console.log('✅ Trades loaded:', loadedTrades.length);
      } catch (error) {
        console.error("Error loading trades:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && !accountLoading) {
      loadTrades();
    }
  }, [user, authLoading, activeAccount, accountLoading]);

  if (loading || authLoading || accountLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Calculate statistics from real trades
  const closedTrades = trades.filter(t => t.status === "closed");
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).length;
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;
  const totalProfit = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  const grossWins = closedTrades.filter(t => (t.pnl || 0) > 0).reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLosses = Math.abs(closedTrades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLosses > 0 ? (grossWins / grossLosses).toFixed(2) : "N/A";

  const avgWin = winningTrades > 0 ? grossWins / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? grossLosses / losingTrades : 0;
  const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnl || 0)) : 0;
  const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnl || 0)) : 0;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("trades.title")}</h1>
        <p className="text-muted-foreground">
          {t("trades.subtitle")}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("trades.totalTrades")}</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTrades}</div>
            <p className="text-xs text-muted-foreground">{t("trades.allTime")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("trades.winRate")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTrades > 0 ? `${winRate}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {winningTrades} {t("trades.winningTrades")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("trades.totalProfit")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{t("trades.netProfit")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("trades.profitFactor")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTrades > 0 ? profitFactor : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">{t("trades.riskReward")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("trades.allTrades")}</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length > 0 ? (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        {t("trades.symbol")}
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        {t("trades.type")}
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        {t("trades.openTime")}
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        {t("trades.closeTime")}
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        {t("trades.openPrice")}
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        {t("trades.closePrice")}
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        {t("trades.volume")}
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        {t("trades.profitLoss")}
                      </th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-sm">
                        {t("trades.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr
                        key={trade.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-4 align-middle">
                          <span className="font-semibold">{trade.symbol}</span>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge
                            variant={trade.side === "BUY" ? "success" : "destructive"}
                          >
                            {trade.side}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {new Date(trade.openedAt).toLocaleString()}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {trade.closedAt ? new Date(trade.closedAt).toLocaleString() : "-"}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.entryPrice.toFixed(5)}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.closePrice ? trade.closePrice.toFixed(5) : "-"}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.lots}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <span
                            className={`font-semibold ${
                              (trade.pnl || 0) >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {(trade.pnl || 0) >= 0 ? "+" : ""}
                            {formatCurrency(trade.pnl || 0)}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-center">
                          <Badge
                            variant={trade.status === "closed" ? "secondary" : "outline"}
                          >
                            {t(`trades.${trade.status}`).toUpperCase()}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold">{t("trades.noTradesYet")}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {t("trades.tradingHistoryWillAppear")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trading Stats Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("trades.winningStatistics")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.totalWins")}</span>
              <span className="font-semibold">{winningTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.averageWin")}</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(avgWin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.bestTrade")}</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(bestTrade)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("trades.losingStatistics")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.totalLosses")}</span>
              <span className="font-semibold">{losingTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.averageLoss")}</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(avgLoss)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("trades.worstTrade")}</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(worstTrade)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
