import { History, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockTrades, mockStatistics } from "@/data/mockData";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function TradesPage() {
  const totalProfit = mockTrades
    .filter((t) => t.status === "CLOSED")
    .reduce((sum, trade) => sum + trade.profit, 0);

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
            <div className="text-2xl font-bold">{mockStatistics.totalTrades}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockStatistics.winRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {mockStatistics.winningTrades} winning trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
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
            <div className="text-2xl font-bold">{mockStatistics.profitFactor}</div>
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
                  {mockTrades.map((trade, index) => (
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
                        {formatDate(trade.openTime)}
                      </td>
                      <td className="p-4 align-middle text-sm text-muted-foreground">
                        {trade.closeTime ? formatDate(trade.closeTime) : "-"}
                      </td>
                      <td className="p-4 align-middle text-right text-sm">
                        {trade.openPrice.toFixed(trade.symbol.includes("JPY") ? 2 : 4)}
                      </td>
                      <td className="p-4 align-middle text-right text-sm">
                        {trade.closePrice
                          ? trade.closePrice.toFixed(trade.symbol.includes("JPY") ? 2 : 4)
                          : "-"}
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
              <span className="font-semibold">{mockStatistics.winningTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average Win:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(mockStatistics.averageWin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best Trade:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(mockStatistics.bestTrade)}
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
              <span className="font-semibold">{mockStatistics.losingTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average Loss:</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(mockStatistics.averageLoss)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worst Trade:</span>
              <span className="font-semibold text-red-500">
                {formatCurrency(mockStatistics.worstTrade)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
