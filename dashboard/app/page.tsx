import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Calendar,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { PerformanceChart } from "@/components/charts/PerformanceChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  mockAccounts,
  mockTrades,
  mockPerformanceData,
  mockStatistics,
} from "@/data/mockData";
import { formatCurrency, formatPercentage } from "@/lib/utils";

export default function DashboardPage() {
  const activeAccount = mockAccounts[0];
  const recentTrades = mockTrades.slice(0, 5);
  const profitLoss = activeAccount.balance - activeAccount.initialBalance;
  const profitLossPercentage =
    ((profitLoss / activeAccount.initialBalance) * 100).toFixed(2);

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
          value={formatCurrency(activeAccount.balance)}
          change={`${formatPercentage(parseFloat(profitLossPercentage))} from start`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          title="Total Profit"
          value={formatCurrency(profitLoss)}
          change={`Target: ${formatCurrency(activeAccount.profitTarget)}`}
          changeType={profitLoss >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <StatCard
          title="Current Drawdown"
          value={formatCurrency(activeAccount.currentDrawdown)}
          change={`Max: ${formatCurrency(activeAccount.maxDrawdown)}`}
          changeType={
            activeAccount.currentDrawdown < activeAccount.maxDrawdown / 2
              ? "positive"
              : "negative"
          }
          icon={TrendingDown}
        />
        <StatCard
          title="Win Rate"
          value={`${mockStatistics.winRate}%`}
          change={`${mockStatistics.winningTrades}/${mockStatistics.totalTrades} trades`}
          changeType={mockStatistics.winRate >= 60 ? "positive" : "negative"}
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
                {formatCurrency(profitLoss)} / {formatCurrency(activeAccount.profitTarget)}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `${Math.min((profitLoss / activeAccount.profitTarget) * 100, 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Trading Days</p>
              <p className="text-2xl font-bold">
                {activeAccount.daysTraded}/{activeAccount.totalDays}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Type</p>
              <Badge variant="secondary" className="mt-1">
                {activeAccount.type}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge
                variant={activeAccount.status === "ACTIVE" ? "success" : "destructive"}
                className="mt-1"
              >
                {activeAccount.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Chart */}
      <PerformanceChart data={mockPerformanceData} />

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentTrades.map((trade) => (
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
            ))}
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
            <div className="text-2xl font-bold">{mockStatistics.profitFactor}</div>
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
              {formatCurrency(mockStatistics.averageWin)}
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
              {formatCurrency(mockStatistics.averageLoss)}
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
