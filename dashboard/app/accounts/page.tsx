"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Wallet, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface UserData {
  email: string;
  accountBalance: number;
  accountStatus: string;
  challengeType: string;
  suspensionReason?: string;
  suspendedAt?: string;
}

export default function AccountsPage() {
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

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Accounts</h1>
        <p className="text-muted-foreground">
          Manage your challenge and funded accounts
        </p>
      </div>

      {userData.accountStatus === "suspended" && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-red-500 p-2">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-500">Compte Suspendu</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Votre compte a été désactivé pour violation des règles de trading.
                </p>
                {userData.suspensionReason && (
                  <p className="mt-2 text-sm font-medium">
                    Raison: {userData.suspensionReason}
                  </p>
                )}
                {userData.suspendedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suspendu le: {new Date(userData.suspendedAt).toLocaleString()}
                  </p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Veuillez contacter le support pour plus d'informations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Your Active Account</CardTitle>
            <Badge variant={userData.accountStatus === "active" ? "success" : "destructive"}>
              {userData.accountStatus === "suspended" ? "INACTIF - RÈGLE ENFREINTE" : userData.accountStatus.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Account Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(userData.accountBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Type</p>
              <p className="text-2xl font-bold">{userData.challengeType.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-lg">{userData.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={userData.accountStatus === "active" ? "success" : "destructive"} className="mt-2">
                {userData.accountStatus === "suspended" ? "INACTIF" : userData.accountStatus.toUpperCase()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
