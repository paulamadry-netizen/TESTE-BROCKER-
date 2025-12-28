"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type PayoutStatus = "pending" | "approved" | "rejected";

type PayoutDoc = {
  userId: string;
  accountId?: string;
  amount: number;
  status: PayoutStatus;
  requestedAt?: any;
  payoutNumber?: number;
  isFirstPayout?: boolean;
  accountBalance?: number;
  kycVerified?: boolean;
  approvedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
};

function formatDate(value: any): string {
  try {
    if (!value) return "";
    const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR");
  } catch {
    return "";
  }
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [payouts, setPayouts] = useState<Array<{ id: string; data: PayoutDoc }>>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const userSnap = await getDocFromServer(doc(db, "users", user.uid));
        const role = userSnap.exists() ? (userSnap.data() as any)?.role : null;
        const admin = String(role ?? "").trim().toLowerCase() === "admin";
        console.log("[admin-check][/admin]", {
          uid: user.uid,
          projectId: (db as any)?._databaseId?.projectId,
          userDocExists: userSnap.exists(),
          role,
          admin,
        });
        setIsAdmin(admin);

        if (!admin) {
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, "payouts"),
          where("status", "==", "pending")
        );

        unsub = onSnapshot(
          q,
          (snap) => {
            const rows: Array<{ id: string; data: PayoutDoc }> = [];
            snap.forEach((d) => rows.push({ id: d.id, data: d.data() as PayoutDoc }));

            rows.sort((a, b) => {
              const da = (typeof a.data?.requestedAt?.toDate === "function" ? a.data.requestedAt.toDate() : new Date(a.data?.requestedAt || 0)).getTime();
              const db = (typeof b.data?.requestedAt?.toDate === "function" ? b.data.requestedAt.toDate() : new Date(b.data?.requestedAt || 0)).getTime();
              return db - da;
            });

            setPayouts(rows);
            setLoading(false);
          },
          (error) => {
            console.error("[admin-check][/admin][error]", {
              uid: user.uid,
              projectId: (db as any)?._databaseId?.projectId,
              code: (error as any)?.code,
              message: (error as any)?.message,
            });
            setIsAdmin(false);
            setLoading(false);
          }
        );
      } catch (error) {
        console.error("[admin-check][/admin][error]", {
          uid: user.uid,
          projectId: (db as any)?._databaseId?.projectId,
          code: (error as any)?.code,
          message: (error as any)?.message,
        });
        setIsAdmin(false);
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const pendingCount = payouts.length;

  const handleApprove = async (payoutId: string) => {
    setProcessingId(payoutId);
    try {
      const functions = getFunctions();
      const approvePayout = httpsCallable(functions, "approvePayout");
      await approvePayout({ payoutId, approved: true });
    } catch (e: any) {
      alert("❌ " + (e?.message || "Erreur approbation"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (payoutId: string) => {
    const reason = (rejectReasons[payoutId] || "").trim();
    if (!reason) {
      alert("❌ Raison requise");
      return;
    }

    setProcessingId(payoutId);
    try {
      const functions = getFunctions();
      const approvePayout = httpsCallable(functions, "approvePayout");
      await approvePayout({ payoutId, approved: false, rejectionReason: reason });
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[payoutId];
        return next;
      });
    } catch (e: any) {
      alert("❌ " + (e?.message || "Erreur rejet"));
    } finally {
      setProcessingId(null);
    }
  };

  const headerRight = useMemo(() => {
    if (!user) return null;
    return (
      <Button variant="secondary" onClick={() => router.refresh()}>
        Rafraîchir
      </Button>
    );
  }, [router, user]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Cette page est réservée aux administrateurs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">Demandes de payout en attente</p>
        </div>
        {headerRight}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payouts en attente ({pendingCount})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : (
            payouts.map((row) => {
              const p = row.data;
              const disabled = processingId === row.id;

              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{row.id}</div>
                      <div className="text-sm font-semibold">{Number(p.amount || 0).toFixed(2)} USD</div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      User: {p.userId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Account: {p.accountId || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Demandé le: {formatDate(p.requestedAt) || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Payout #: {p.payoutNumber || "—"} | First: {p.isFirstPayout ? "oui" : "non"} | KYC: {p.kycVerified ? "ok" : "non"}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(row.id)}
                        disabled={disabled}
                      >
                        {disabled ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Traitement...
                          </>
                        ) : (
                          "Approuver"
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleReject(row.id)}
                        disabled={disabled}
                      >
                        Rejeter
                      </Button>
                    </div>

                    <input
                      value={rejectReasons[row.id] || ""}
                      onChange={(e) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      placeholder="Raison de rejet (obligatoire si rejet)"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
