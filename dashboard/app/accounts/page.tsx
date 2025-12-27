"use client";

import { useAuth } from "@/context/AuthContext";
import { useAccount } from "@/context/AccountContext";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export default function AccountsPage() {
  const { user, loading: authLoading } = useAuth();
  const { accounts, activeAccount, loading: accountLoading } = useAccount();

  const getAccountKindLabel = (acc: any): string => {
    const isFunded = Boolean(acc?.isFunded) || String(acc?.accountType || '').toLowerCase() === 'funded';
    return isFunded ? 'FUNDED' : 'CHALLENGE';
  };

  const getAccountPlanLabel = (acc: any): string => {
    const plan = typeof acc?.planType === 'string' ? acc.planType.trim() : '';
    const challengeType = typeof acc?.challengeType === 'string' ? acc.challengeType.trim() : '';
    return (plan || challengeType || '').toUpperCase();
  };

  if (authLoading || accountLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || !activeAccount) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">No account data found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Accounts</h1>
        <p className="text-muted-foreground">
          Manage your challenge and funded accounts
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Your Active Account</CardTitle>
            <Badge variant={activeAccount.accountStatus === "active" ? "success" : "destructive"}>
              {activeAccount.accountStatus.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Account Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(activeAccount.accountBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Type</p>
              <p className="text-2xl font-bold">{getAccountKindLabel(activeAccount)}</p>
              {getAccountPlanLabel(activeAccount) && (
                <p className="text-sm text-muted-foreground mt-1">{getAccountPlanLabel(activeAccount)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-lg">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={activeAccount.accountStatus === "active" ? "success" : "destructive"} className="mt-2">
                {activeAccount.accountStatus.toUpperCase()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((acc) => (
          <Card key={acc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{acc.accountName}</CardTitle>
                <Badge variant={acc.accountStatus === "active" ? "success" : "destructive"}>
                  {acc.accountStatus.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Balance</span>
                <span className="font-semibold">{formatCurrency(acc.accountBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="font-semibold">{getAccountKindLabel(acc)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="font-semibold">{getAccountPlanLabel(acc)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
