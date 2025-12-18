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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Your Active Account</CardTitle>
            <Badge variant={userData.accountStatus === "active" ? "success" : "secondary"}>
              {userData.accountStatus.toUpperCase()}
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
              <Badge variant="success" className="mt-2">{userData.accountStatus.toUpperCase()}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
