"use client";

import { DollarSign, CheckCircle2, XCircle, AlertCircle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockAccounts, mockChallengeRules } from "@/data/mockData";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

export default function PayoutPage() {
  const [payoutRequested, setPayoutRequested] = useState(false);

  const activeAccount = mockAccounts[0];
  const profitLoss = activeAccount.balance - activeAccount.initialBalance;

  // Conditions pour le payout (à personnaliser plus tard)
  const conditions = [
    {
      name: "Profit Target Atteint",
      description: "Atteindre l'objectif de profit défini",
      met: profitLoss >= activeAccount.profitTarget,
      current: profitLoss,
      target: activeAccount.profitTarget,
    },
    {
      name: "Minimum 5 jours de trading",
      description: "Trader au moins 5 jours",
      met: activeAccount.daysTraded >= 5,
      current: activeAccount.daysTraded,
      target: 5,
    },
    {
      name: "Respect du Drawdown",
      description: "Ne pas dépasser le drawdown maximal",
      met: activeAccount.currentDrawdown < activeAccount.maxDrawdown,
      current: activeAccount.currentDrawdown,
      target: activeAccount.maxDrawdown,
    },
    {
      name: "Compte Actif",
      description: "Le compte doit être actif",
      met: activeAccount.status === "ACTIVE",
      current: activeAccount.status,
      target: "ACTIVE",
    },
  ];

  const allConditionsMet = conditions.every((c) => c.met);
  const availablePayout = Math.max(0, profitLoss * 0.8); // 80% des profits

  const handlePayoutRequest = () => {
    if (allConditionsMet) {
      setPayoutRequested(true);
      // Ici vous ajouterez la logique Firebase plus tard
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout Request</h1>
        <p className="text-muted-foreground">
          Request a withdrawal of your trading profits
        </p>
      </div>

      {/* Status Alert */}
      {!allConditionsMet && (
        <Card className="border-yellow-500 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-yellow-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-600">
                  Payout Not Available Yet
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You need to meet all conditions before requesting a payout.
                  Check the requirements below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {allConditionsMet && !payoutRequested && (
        <Card className="border-green-500 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-6 w-6 text-green-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-600">
                  Congratulations! You're Eligible for Payout
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All conditions have been met. You can now request your payout.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payoutRequested && (
        <Card className="border-blue-500 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-6 w-6 text-blue-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-600">
                  Payout Request Submitted
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your payout request has been submitted and is being processed.
                  You'll receive the funds within 3-5 business days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Payout */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Available Payout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Your Available Payout</p>
              <p className="text-5xl font-bold text-green-500 mt-2">
                {formatCurrency(availablePayout)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                80% of your total profit ({formatCurrency(profitLoss)})
              </p>
            </div>

            <Button
              size="lg"
              className="w-full max-w-md"
              disabled={!allConditionsMet || payoutRequested}
              onClick={handlePayoutRequest}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              {payoutRequested ? "Payout Requested" : "Request Payout"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Payout Conditions</h2>
        <div className="grid gap-4">
          {conditions.map((condition, index) => (
            <Card key={index} className={condition.met ? "border-green-500/50" : ""}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {condition.met ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <h3 className="font-semibold text-lg">{condition.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground ml-8">
                      {condition.description}
                    </p>

                    {/* Progress */}
                    <div className="ml-8 mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <span className="font-semibold">
                          {typeof condition.current === "number" &&
                          typeof condition.target === "number"
                            ? `${formatCurrency(condition.current)} / ${formatCurrency(condition.target)}`
                            : `${condition.current} / ${condition.target}`}
                        </span>
                      </div>
                      {typeof condition.current === "number" &&
                        typeof condition.target === "number" && (
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                condition.met ? "bg-green-500" : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.min((condition.current / condition.target) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        )}
                    </div>
                  </div>

                  <Badge variant={condition.met ? "success" : "destructive"} className="ml-4">
                    {condition.met ? "MET" : "NOT MET"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Configure your payout method</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Bank Transfer</p>
              <p className="text-sm text-muted-foreground">
                Receive funds directly to your bank account
              </p>
            </div>
            <Button variant="outline">Configure</Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">PayPal</p>
              <p className="text-sm text-muted-foreground">
                Receive funds via PayPal
              </p>
            </div>
            <Button variant="outline">Configure</Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Cryptocurrency</p>
              <p className="text-sm text-muted-foreground">
                Receive funds in USDT or BTC
              </p>
            </div>
            <Button variant="outline">Configure</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
