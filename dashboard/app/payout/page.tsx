"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { DollarSign, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface UserData {
  email: string;
  accountBalance: number;
  profitTarget: number;
  tradingDays: number;
}

export default function PayoutPage() {
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

  const profitTargetAmount = (userData.accountBalance * userData.profitTarget) / 100;

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout Request</h1>
        <p className="text-muted-foreground">
          Request a withdrawal of your trading profits
        </p>
      </div>

      <Card className="border-yellow-500 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-500 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-600">
                Payout Not Available Yet
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                You need to meet all conditions before requesting a payout:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
                <li>Reach profit target: {formatCurrency(profitTargetAmount)}</li>
                <li>Trade minimum 5 days (Currently: {userData.tradingDays} days)</li>
                <li>Respect drawdown limits</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
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
              <p className="text-5xl font-bold text-muted-foreground mt-2">
                {formatCurrency(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Start trading to earn profits and request payouts
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
