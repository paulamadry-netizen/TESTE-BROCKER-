"use client";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockTrades, mockStatistics } from "@/data/mockData";
import { formatCurrency } from "@/lib/utils";

export default function AnalyticsPage() {
  // Prepare data for charts
  const symbolData = mockTrades
    .filter((t) => t.status === "CLOSED")
    .reduce((acc: any, trade) => {
      const existing = acc.find((item: any) => item.symbol === trade.symbol);
      if (existing) {
        existing.trades += 1;
        existing.profit += trade.profit;
      } else {
        acc.push({ symbol: trade.symbol, trades: 1, profit: trade.profit });
      }
      return acc;
    }, []);

  const winLossData = [
    { name: "Winning", value: mockStatistics.winningTrades, color: "#10b981" },
    { name: "Losing", value: mockStatistics.losingTrades, color: "#ef4444" },
  ];

  const typeData = mockTrades
    .filter((t) => t.status === "CLOSED")
    .reduce((acc: any, trade) => {
      const existing = acc.find((item: any) => item.type === trade.type);
      if (existing) {
        existing.count += 1;
        existing.profit += trade.profit;
      } else {
        acc.push({ type: trade.type, count: 1, profit: trade.profit });
      }
      return acc;
    }, []);

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Detailed analysis of your trading performance
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStatistics.profitFactor}</div>
            <p className="text-xs text-muted-foreground mt-1">Excellent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Trade Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStatistics.averageTradeDuration}</div>
            <p className="text-xs text-muted-foreground mt-1">Per trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Best Trade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(mockStatistics.bestTrade)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Single trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Worst Trade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(mockStatistics.worstTrade)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Single trade</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Win/Loss Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Win/Loss Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={winLossData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {winLossData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Win Rate:</span>
                <span className="font-semibold text-green-500">
                  {mockStatistics.winRate}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Loss Rate:</span>
                <span className="font-semibold text-red-500">
                  {100 - mockStatistics.winRate}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit by Symbol */}
        <Card>
          <CardHeader>
            <CardTitle>Profit by Symbol</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={symbolData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="symbol"
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Bar dataKey="profit" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Buy vs Sell Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Buy vs Sell Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="type"
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trading Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Total Trades</span>
                <span className="font-semibold">{mockStatistics.totalTrades}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Winning Trades</span>
                <span className="font-semibold text-green-500">
                  {mockStatistics.winningTrades}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Losing Trades</span>
                <span className="font-semibold text-red-500">
                  {mockStatistics.losingTrades}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Average Win</span>
                <span className="font-semibold text-green-500">
                  {formatCurrency(mockStatistics.averageWin)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Average Loss</span>
                <span className="font-semibold text-red-500">
                  {formatCurrency(mockStatistics.averageLoss)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Profit Factor</span>
                <span className="font-semibold text-blue-500">
                  {mockStatistics.profitFactor}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
