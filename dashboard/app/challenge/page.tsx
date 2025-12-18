"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, XCircle, Clock, Target, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

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

export default function ChallengePage() {
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

  const initialBalance = userData.accountBalance;
  const currentBalance = userData.accountBalance; // TODO: Update with real-time balance
  const profitLoss = currentBalance - initialBalance;
  const profitTargetAmount = (initialBalance * userData.profitTarget) / 100;
  const maxDrawdownAmount = (initialBalance * userData.maxDrawdown) / 100;
  const progressPercentage = profitTargetAmount > 0 ? (profitLoss / profitTargetAmount) * 100 : 0;

  // Challenge rules based on real data
  const challengeRules = [
    {
      name: "Profit Target",
      description: `Reach ${userData.profitTarget}% profit (${formatCurrency(profitTargetAmount)})`,
      status: profitLoss >= profitTargetAmount ? "PASSED" : profitLoss > 0 ? "IN_PROGRESS" : "PENDING",
      current: profitLoss,
      target: profitTargetAmount,
    },
    {
      name: "Maximum Drawdown",
      description: `Stay within ${userData.maxDrawdown}% drawdown limit`,
      status: "PASSED", // TODO: Track actual drawdown
      current: 0,
      target: maxDrawdownAmount,
    },
    {
      name: "Minimum Trading Days",
      description: "Trade at least 5 days",
      status: userData.tradingDays >= 5 ? "PASSED" : userData.tradingDays > 0 ? "IN_PROGRESS" : "PENDING",
      current: userData.tradingDays,
      target: 5,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Challenge Progress</h1>
        <p className="text-muted-foreground">
          Track your progress and challenge rules
        </p>
      </div>

      {/* Overview Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6" />
              Challenge Overview
            </CardTitle>
            <Badge
              variant={userData.accountStatus === "active" ? "success" : "destructive"}
              className="text-sm"
            >
              {userData.accountStatus.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Overall Progress</span>
              <span className="text-sm font-semibold">
                {Math.max(0, progressPercentage).toFixed(1)}% Complete
              </span>
            </div>
            <div className="h-4 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
                style={{ width: `${Math.min(Math.max(0, progressPercentage), 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-sm">
              <span>{formatCurrency(initialBalance)}</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(initialBalance + profitTargetAmount)}
              </span>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-xl font-bold">{formatCurrency(currentBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Profit Made</p>
              <p className={`text-xl font-bold ${profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(profitLoss)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Target</p>
              <p className="text-xl font-bold">{formatCurrency(profitTargetAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-xl font-bold text-blue-500">
                {formatCurrency(Math.max(0, profitTargetAmount - profitLoss))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Challenge Rules */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Challenge Rules</h2>
        <div className="grid gap-4">
          {challengeRules.map((rule, index) => {
            const isCompleted = rule.status === "PASSED";
            const isFailed = rule.status === "FAILED";
            const isInProgress = rule.status === "IN_PROGRESS";

            const progressPercentage = rule.target > 0 ? (rule.current / rule.target) * 100 : 0;

            return (
              <Card key={index} className={isFailed ? "border-red-500" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {isCompleted && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        {isFailed && <XCircle className="h-5 w-5 text-red-500" />}
                        {isInProgress && <Clock className="h-5 w-5 text-blue-500" />}
                        {rule.status === "PENDING" && <Clock className="h-5 w-5 text-muted-foreground" />}
                        <h3 className="font-semibold text-lg">{rule.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {rule.description}
                      </p>

                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-semibold">
                            {rule.name.includes("Drawdown")
                              ? `${formatCurrency(rule.current)} / ${formatCurrency(rule.target)}`
                              : rule.name.includes("Days")
                              ? `${rule.current} / ${rule.target} days`
                              : `${formatCurrency(rule.current)} / ${formatCurrency(rule.target)}`}
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              isCompleted
                                ? "bg-green-500"
                                : isFailed
                                ? "bg-red-500"
                                : "bg-blue-500"
                            }`}
                            style={{
                              width: `${Math.min(Math.max(0, progressPercentage), 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={
                        isCompleted
                          ? "success"
                          : isFailed
                          ? "destructive"
                          : "secondary"
                      }
                      className="ml-4"
                    >
                      {rule.status.replace("_", " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Risk Warning */}
      <Card className="border-yellow-500 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-5 w-5" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Drawdown:</span>
              <span className="font-semibold">
                {formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Allowed Drawdown:</span>
              <span className="font-semibold">
                {formatCurrency(maxDrawdownAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining Buffer:</span>
              <span className="font-semibold text-green-500">
                {formatCurrency(maxDrawdownAmount)}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `0%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Challenge Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">Days Traded</p>
                <p className="text-sm text-muted-foreground">
                  Minimum 5 days required
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {userData.tradingDays} / 30
                </p>
                <Badge variant={userData.tradingDays >= 5 ? "success" : "secondary"}>
                  {userData.tradingDays >= 5 ? "Requirement Met" : "In Progress"}
                </Badge>
              </div>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${(userData.tradingDays / 30) * 100}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
