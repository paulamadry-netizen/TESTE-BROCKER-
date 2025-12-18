"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { History, TrendingUp, TrendingDown, DollarSign, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface UserData {
  email: string;
  accountBalance: number;
  accountStatus: string;
}

export default function TradesPage() {
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
  const trades: any[] = [];
  const totalTrades = 0;
  const winningTrades = 0;
  const losingTrades = 0;
  const winRate = 0;
  const totalProfit = 0;
  const profitFactor = 0;

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
                            variant={trade.type === "BUY" ? "success" : "destructive"}
                          >
                            {trade.type}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {new Date(trade.openTime).toLocaleString()}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {trade.closeTime ? new Date(trade.closeTime).toLocaleString() : "-"}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.openPrice}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.closePrice || "-"}
                        </td>
                        <td className="p-4 align-middle text-right text-sm">
                          {trade.volume}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <span
                            className={`font-semibold ${
                              trade.profit >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {trade.profit >= 0 ? "+" : ""}
                            {formatCurrency(trade.profit)}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-center">
                          <Badge
                            variant={trade.status === "CLOSED" ? "secondary" : "outline"}
                          >
                            {trade.status}
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
                {formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best Trade:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(0)}
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
                {formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worst Trade:</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
