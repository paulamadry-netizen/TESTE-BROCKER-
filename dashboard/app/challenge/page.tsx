"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAccount } from "@/context/AccountContext";
import { CheckCircle2, XCircle, Clock, Target, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function ChallengePage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const { activeAccount, loading: accountLoading } = useAccount();
  const [processing, setProcessing] = useState(false);

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
        <p className="text-muted-foreground">{t("common.noData")}</p>
      </div>
    );
  }

  const initialBalance = activeAccount.initialBalance || activeAccount.accountBalance;
  const currentBalance = activeAccount.accountBalance;
  const profitLoss = currentBalance - initialBalance;
  const profitTargetAmount = (initialBalance * (activeAccount.profitTarget || 10)) / 100;
  const maxDrawdownAmount = (initialBalance * (activeAccount.maxDrawdown || 8)) / 100;
  const progressPercentage = profitTargetAmount > 0 ? (profitLoss / profitTargetAmount) * 100 : 0;

  const tradingDays = activeAccount.tradingDays || 0;
  const isChallengeSuccess = profitLoss >= profitTargetAmount && tradingDays >= 3 && activeAccount.accountStatus === 'active';

  const handleUpgradeChallenge = async () => {
    if (!activeAccount) return;
    setProcessing(true);
    try {
      const functions = getFunctions();
      const upgradeChallenge = httpsCallable(functions, 'upgradeChallenge');
      const result: any = await upgradeChallenge({ accountId: activeAccount.id });
      alert('✅ ' + (result?.data?.message || 'Félicitations ! Votre compte funded est activé.'));
      window.location.reload();
    } catch (error: any) {
      alert('❌ ' + (error.message || "Erreur lors de l'upgrade"));
    } finally {
      setProcessing(false);
    }
  };

  // Calculate daily loss limit (3% of initial balance)
  const dailyLossLimit = initialBalance * 0.03;
  const totalLossLimit = initialBalance * 0.08;

  // Challenge rules based on real data
  const challengeRules = [
    {
      name: t("challenge.profitObjective"),
      description: `${t("challenge.reachProfit")} ${activeAccount.profitTarget || 10}% ${t("challenge.ofProfit")} (${formatCurrency(profitTargetAmount)})`,
      status: profitLoss >= profitTargetAmount ? "PASSED" : profitLoss > 0 ? "IN_PROGRESS" : "PENDING",
      current: profitLoss,
      target: profitTargetAmount,
      critical: false,
    },
    {
      name: t("challenge.maxDailyLoss"),
      description: `${t("challenge.maxPerDay")} (${formatCurrency(dailyLossLimit)})`,
      status: "PASSED",
      current: 0,
      target: dailyLossLimit,
      critical: true,
    },
    {
      name: t("challenge.maxTotalLoss"),
      description: `${t("challenge.maxTotalDrawdown")} ${activeAccount.maxDrawdown || 8}% ${t("challenge.ofTotalLoss")} (${formatCurrency(totalLossLimit)})`,
      status: "PASSED",
      current: Math.abs(Math.min(profitLoss, 0)),
      target: totalLossLimit,
      critical: true,
    },
    {
      name: t("challenge.minTradingDays"),
      description: t("challenge.tradeAtLeast"),
      status: (activeAccount.tradingDays || 0) >= 3 ? "PASSED" : (activeAccount.tradingDays || 0) > 0 ? "IN_PROGRESS" : "PENDING",
      current: activeAccount.tradingDays || 0,
      target: 3,
      critical: false,
    },
    {
      name: t("challenge.overnightPositions"),
      description: t("challenge.allowedExcept"),
      status: "PASSED",
      current: 0,
      target: 0,
      critical: true,
    },
    {
      name: t("challenge.weekendPositions"),
      description: t("challenge.forbidden"),
      status: "PASSED",
      current: 0,
      target: 0,
      critical: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("challenge.title")}</h1>
        <p className="text-muted-foreground">
          {t("challenge.subtitle")}
        </p>
      </div>

      {/* Overview Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6" />
              {t("challenge.overview")}
            </CardTitle>
            <Badge
              variant={activeAccount.accountStatus === "active" ? "success" : "destructive"}
              className="text-sm"
            >
              {t(`status.${activeAccount.accountStatus}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{t("challenge.overallProgress")}</span>
              <span className="text-sm font-semibold">
                {Math.max(0, progressPercentage).toFixed(1)}% {t("challenge.complete")}
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
              <p className="text-sm text-muted-foreground">{t("challenge.currentBalance")}</p>
              <p className="text-xl font-bold">{formatCurrency(currentBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("challenge.profitMade")}</p>
              <p className={`text-xl font-bold ${profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(profitLoss)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("challenge.target")}</p>
              <p className="text-xl font-bold">{formatCurrency(profitTargetAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("challenge.remaining")}</p>
              <p className="text-xl font-bold text-blue-500">
                {formatCurrency(Math.max(0, profitTargetAmount - profitLoss))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Challenge Rules */}
      <div>
        <h2 className="text-2xl font-bold mb-4">{t("challenge.challengeRules")}</h2>
        {isChallengeSuccess && (
          <Card className="border-green-500 bg-green-500/5 mb-4">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-700">
                    Félicitations, challenge réussi !
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vous avez atteint les conditions requises. Cliquez ci-dessous pour activer votre compte funded.
                  </p>
                  <Button
                    onClick={handleUpgradeChallenge}
                    disabled={processing}
                    className="w-full mt-4"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Activation...
                      </>
                    ) : (
                      'Activer compte funded'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
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
                        {rule.critical && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            {t("challenge.critical")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {rule.description}
                      </p>
                      {rule.critical && (
                        <p className="text-xs text-orange-500 mb-3">
                          {t("challenge.violationWarning")}
                        </p>
                      )}

                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("challenge.progress")}</span>
                          <span className="font-semibold">
                            {rule.name.includes(t("challenge.maxTotalLoss")) || rule.name.includes(t("challenge.maxDailyLoss"))
                              ? `${formatCurrency(rule.current)} / ${formatCurrency(rule.target)}`
                              : rule.name.includes(t("challenge.minTradingDays"))
                              ? `${rule.current} / ${rule.target} ${t("challenge.days")}`
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
                      {t(`challenge.${rule.status.toLowerCase().replace("_", "")}`).toUpperCase()}
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
            {t("challenge.riskManagement")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("challenge.currentDrawdown")}</span>
              <span className="font-semibold">
                {formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("challenge.maxAllowedDrawdown")}</span>
              <span className="font-semibold">
                {formatCurrency(maxDrawdownAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("challenge.remainingBuffer")}</span>
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
          <CardTitle>{t("challenge.challengeTimeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{t("challenge.daysTraded")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("challenge.minRequired")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {activeAccount.tradingDays || 0} / 30
                </p>
                <Badge variant={(activeAccount.tradingDays || 0) >= 5 ? "success" : "secondary"}>
                  {(activeAccount.tradingDays || 0) >= 5 ? t("challenge.requirementMet") : t("challenge.inProgress")}
                </Badge>
              </div>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${((activeAccount.tradingDays || 0) / 30) * 100}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
