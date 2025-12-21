import { Wallet, TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockAccounts } from "@/data/mockData";
import { formatCurrency } from "@/lib/utils";

export default function AccountsPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Accounts</h1>
          <p className="text-muted-foreground">
            Manage your challenge and funded accounts
          </p>
        </div>
        <Button>
          <Wallet className="mr-2 h-4 w-4" />
          New Challenge
        </Button>
      </div>

      {/* Accounts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {mockAccounts.map((account) => {
          const profitLoss = account.balance - account.initialBalance;
          const profitLossPercentage = ((profitLoss / account.initialBalance) * 100).toFixed(2);
          const progressToTarget = (profitLoss / account.profitTarget) * 100;
          const drawdownPercentage = (account.currentDrawdown / account.maxDrawdown) * 100;

          return (
            <Card key={account.id} className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{account.accountNumber}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Created {account.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Badge
                      variant={account.type === "FUNDED" ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {account.type}
                    </Badge>
                    <Badge
                      variant={
                        account.status === "ACTIVE"
                          ? "success"
                          : account.status === "PASSED"
                          ? "success"
                          : account.status === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {account.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Balance Info */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Balance</p>
                      <p className="text-3xl font-bold">{formatCurrency(account.balance)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Profit/Loss</p>
                      <p
                        className={`text-2xl font-bold ${
                          profitLoss >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {profitLoss >= 0 ? "+" : ""}
                        {formatCurrency(profitLoss)}
                      </p>
                      <p
                        className={`text-sm ${
                          profitLoss >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {profitLoss >= 0 ? "+" : ""}
                        {profitLossPercentage}%
                      </p>
                    </div>
                  </div>

                  {/* Equity */}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Equity:</span>
                    <span className="font-semibold">{formatCurrency(account.equity)}</span>
                  </div>
                </div>

                {/* Profit Target Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Profit Target</span>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatCurrency(profitLoss)} / {formatCurrency(account.profitTarget)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(progressToTarget, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {progressToTarget.toFixed(1)}% achieved
                  </p>
                </div>

                {/* Drawdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Drawdown</span>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatCurrency(account.currentDrawdown)} / {formatCurrency(account.maxDrawdown)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        drawdownPercentage < 50
                          ? "bg-green-500"
                          : drawdownPercentage < 80
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${drawdownPercentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {drawdownPercentage.toFixed(1)}% of max drawdown
                  </p>
                </div>

                {/* Trading Days */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Trading Days</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {account.daysTraded} / {account.totalDays}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1">
                    View Details
                  </Button>
                  <Button className="flex-1">Trade Now</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Accounts</p>
              <p className="text-2xl font-bold">{mockAccounts.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Challenges</p>
              <p className="text-2xl font-bold">
                {mockAccounts.filter((a) => a.type === "CHALLENGE" && a.status === "ACTIVE").length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Funded Accounts</p>
              <p className="text-2xl font-bold">
                {mockAccounts.filter((a) => a.type === "FUNDED").length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Equity</p>
              <p className="text-2xl font-bold">
                {formatCurrency(
                  mockAccounts.reduce((sum, acc) => sum + acc.equity, 0)
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
              <Wallet className="h-5 w-5 text-blue-500" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Ready for a new challenge?</p>
              <p className="text-sm text-muted-foreground">
                Start a new trading challenge and work towards getting funded. Choose from our
                various account sizes and prove your trading skills.
              </p>
              <Button variant="link" className="h-auto p-0 text-blue-500">
                Learn more about challenges →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
