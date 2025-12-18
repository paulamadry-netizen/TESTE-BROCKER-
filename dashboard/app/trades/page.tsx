"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrades() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const tradesRef = collection(db, "trades");
        const q = query(
          tradesRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);

        const loadedTrades: Trade[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
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

        setTrades(loadedTrades);
      } catch (error) {
        console.error("Error loading trades:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadTrades();
    }
  }, [user, authLoading]);

  if (loading || authLoading) {
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
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trade History</h1>
        <p className="text-muted-foreground">
          Complete history of all your trades
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTrades}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTrades > 0 ? `${winRate}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              {winningTrades} winning trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">Net profit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTrades > 0 ? profitFactor : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Risk/Reward ratio</p>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length > 0 ? (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        Symbol
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        Type
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        Open Time
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">
                        Close Time
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        Open Price
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        Close Price
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        Volume
                      </th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-sm">
                        Profit/Loss
                      </th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-sm">
                        Status
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
                            {trade.status.toUpperCase()}
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
              <p className="text-lg font-semibold">No trades yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your trading history will appear here once you start trading
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trading Stats Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Winning Trades Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Wins:</span>
              <span className="font-semibold">{winningTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average Win:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(avgWin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best Trade:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(bestTrade)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Losing Trades Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Losses:</span>
              <span className="font-semibold">{losingTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average Loss:</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(avgLoss)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worst Trade:</span>
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
