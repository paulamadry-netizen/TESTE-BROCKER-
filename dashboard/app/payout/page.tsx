"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { useAccount } from "@/context/AccountContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import { DollarSign, AlertCircle, Loader2, CheckCircle, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { AccountSelector } from "@/components/dashboard/AccountSelector";

interface UserData {
  email: string;
  accountBalance: number;
  initialBalance: number;
  initialFundedBalance?: number;
  accountType: 'challenge' | 'funded';
  accountStatus: string;
  tradingDays: number;
  role?: string;
  kycVerified?: boolean;
  kycStatus?: string;
  fundedAt?: any;
  payoutsReceived?: number;
  lastPayoutAt?: any;
}

export default function PayoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeAccount, loading: accountLoading } = useAccount();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [eligibilityInfo, setEligibilityInfo] = useState<any>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rib, setRib] = useState('');

  const toJsDate = (value: any): Date | null => {
    try {
      if (!value) return null;
      if (typeof value?.toDate === 'function') return value.toDate();
      if (typeof value === 'number') return new Date(value);
      if (typeof value === 'string') return new Date(value);
      if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const handleForceUpgradeChallenge = async () => {
    setProcessing(true);
    try {
      const functions = getFunctions();
      const forceUpgradeChallenge = httpsCallable(functions, 'forceUpgradeChallenge');
      const result: any = await forceUpgradeChallenge({ accountId: activeAccount?.id });
      alert('✅ ' + (result?.data?.message || 'Compte financé créé.'));
      window.location.reload();
    } catch (error: any) {
      alert('❌ ' + (error.message || 'Erreur force upgrade'));
    } finally {
      setProcessing(false);
    }
  };

  const computeTradingDaysForAccount = async (): Promise<number> => {
    if (!user || !activeAccount) return 0;

    const tradesSnapshot = await getDocs(
      query(
        collection(db, 'trades'),
        where('userId', '==', user.uid),
        where('accountId', '==', activeAccount.id)
      )
    );

    const days = new Set<string>();
    tradesSnapshot.forEach((snap) => {
      const trade = snap.data() as any;
      if (!trade) return;

      const d = trade.openedAt || trade.closedAt;
      if (!d) return;

      const date = toJsDate(d);
      if (!date) return;

      days.add(date.toISOString().slice(0, 10));
    });

    return days.size;
  };

  useEffect(() => {
    async function loadUserData() {
      if (!user || !activeAccount) {
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        const userDocData = userDocSnap.exists() ? (userDocSnap.data() as any) : {};
        const accountType = (String((activeAccount as any)?.accountType || '')).toLowerCase() === 'funded' || Boolean((activeAccount as any)?.isFunded)
          ? 'funded'
          : 'challenge';

        const mergedData: UserData = {
          email: user.email || userDocData.email || '',
          accountBalance: activeAccount.accountBalance,
          initialBalance: activeAccount.initialBalance || activeAccount.accountBalance,
          initialFundedBalance: (activeAccount as any).initialFundedBalance,
          accountType,
          accountStatus: activeAccount.accountStatus,
          tradingDays: activeAccount.tradingDays || 0,
          role: userDocData.role,
          fundedAt: (activeAccount as any).fundedAt,
          payoutsReceived: (activeAccount as any).payoutsReceived,
          lastPayoutAt: (activeAccount as any).lastPayoutAt,
          kycVerified: userDocData.kycVerified,
          kycStatus: userDocData.kycStatus,
        };

        setUserData(mergedData);

        // Calculer les jours de trading à partir des trades (plus fiable que le champ stocké)
        if (mergedData.accountType === 'challenge') {
          try {
            const tradingDays = await computeTradingDaysForAccount();
            setUserData((prev) => (prev ? { ...prev, tradingDays } : prev));
          } catch (e) {
            // ignore
          }
        }

        if (mergedData.accountType === 'funded') {
          await refreshEligibility(activeAccount.id);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && !accountLoading) {
      loadUserData();
    }
  }, [user, authLoading, activeAccount, accountLoading]);

  const refreshEligibility = async (accountId: string) => {
    try {
      const functions = getFunctions();
      const checkPayoutEligibility = httpsCallable(functions, 'checkPayoutEligibility');
      const result: any = await checkPayoutEligibility({ accountId });
      setEligibilityInfo(result?.data || null);
    } catch (error) {
      console.error('Error checking eligibility:', error);
      setEligibilityInfo(null);
    }
  };

  const handleUpgradeChallenge = async () => {
    setProcessing(true);
    try {
      const functions = getFunctions();
      const upgradeChallenge = httpsCallable(functions, 'upgradeChallenge');
      const result: any = await upgradeChallenge({ accountId: activeAccount?.id });

      alert('✅ ' + (result?.data?.message || 'Félicitations ! Votre compte funded est activé.'));
      window.location.reload();
    } catch (error: any) {
      alert('❌ ' + (error.message || 'Erreur lors de l\'upgrade'));
    } finally {
      setProcessing(false);
    }
  };

  const handleStartKyc = async () => {
    setProcessing(true);
    try {
      const functions = getFunctions();
      const createKycVerification = httpsCallable(functions, 'createKycVerification');
      const result: any = await createKycVerification();

      if (result.data.url) {
        // Ouvrir la page de vérification Stripe Identity
        window.open(result.data.url, '_blank');
        alert('✅ Fenêtre de vérification ouverte. Complétez la vérification puis revenez ici.');
      }
    } catch (error: any) {
      alert('❌ ' + (error.message || 'Erreur création session KYC'));
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
      alert('❌ Montant invalide');
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !rib.trim()) {
      alert('❌ Prénom, Nom et RIB requis');
      return;
    }

    const max = Number(eligibilityInfo?.maxPayout || 0);
    if (Number.isFinite(max) && parseFloat(payoutAmount) > max) {
      alert(`❌ Montant trop élevé. Max: ${max.toFixed(2)} USD`);
      return;
    }

    setProcessing(true);
    try {
      const functions = getFunctions();
      const requestPayout = httpsCallable(functions, 'requestPayout');
      const result: any = await requestPayout({
        amount: parseFloat(payoutAmount),
        accountId: activeAccount?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        rib: rib.trim(),
      });

      alert('✅ ' + result.data.message);
      setPayoutAmount('');
      await refreshEligibility(activeAccount?.id || '');
    } catch (error: any) {
      alert('❌ ' + (error.message || 'Erreur demande payout'));
    } finally {
      setProcessing(false);
    }
  };

  const handleAdminForcePayoutEligible = async () => {
    if (!user || !activeAccount) return;
    setProcessing(true);
    try {
      const functions = getFunctions();
      const adminForcePayoutEligible = httpsCallable(functions, 'adminForcePayoutEligible');
      const result: any = await adminForcePayoutEligible({ userId: user.uid, accountId: activeAccount.id });
      const bonus = Number(result?.data?.bonusProfit || 0);
      alert(`✅ Eligibilité activée (+${bonus.toFixed(2)} USD)`);
      await refreshEligibility(activeAccount.id);
    } catch (error: any) {
      alert('❌ ' + (error.message || 'Erreur admin payout'));
    } finally {
      setProcessing(false);
    }
  };

  if (loading || authLoading || accountLoading) {
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

  // Si c'est un compte challenge
  if (userData.accountType === 'challenge') {
    const initialBalance = userData.initialBalance;
    const currentBalance = userData.accountBalance;
    const profitPercent = ((currentBalance - initialBalance) / initialBalance) * 100;
    const tradingDays = userData.tradingDays || 0;
    const isChallengeSuccess = profitPercent >= 10 && tradingDays >= 3 && userData.accountStatus === 'active';

    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upgrade Challenge</h1>
            <p className="text-muted-foreground">
              Validez votre challenge pour accéder aux payouts
            </p>
          </div>
          <AccountSelector />
        </div>

        {isChallengeSuccess && (
          <Card className="border-green-500 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-700">
                    Félicitations, challenge réussi !
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vous avez atteint les conditions requises. Cliquez ci-dessous pour activer votre compte funded.
                  </p>
                  <Button
                    onClick={handleUpgradeChallenge}
                    disabled={processing || !activeAccount}
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

        <Card>
          <CardHeader>
            <CardTitle>Conditions de Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Profit minimum (10%)</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${profitPercent >= 10 ? 'text-green-600' : 'text-red-600'}`}>
                  {profitPercent.toFixed(2)}%
                </span>
                {profitPercent >= 10 && <CheckCircle className="h-4 w-4 text-green-600" />}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Jours de trading minimum (3)</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${tradingDays >= 3 ? 'text-green-600' : 'text-red-600'}`}>
                  {tradingDays}/3
                </span>
                {tradingDays >= 3 && <CheckCircle className="h-4 w-4 text-green-600" />}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Compte actif</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${userData.accountStatus === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                  {userData.accountStatus}
                </span>
                {userData.accountStatus === 'active' && <CheckCircle className="h-4 w-4 text-green-600" />}
              </div>
            </div>

            {!isChallengeSuccess && (
              <Button
                onClick={handleUpgradeChallenge}
                disabled={processing || !activeAccount || userData.accountStatus !== 'active'}
                className="w-full mt-4"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validation...
                  </>
                ) : (
                  'Activer compte funded'
                )}
              </Button>
            )}

            {userData.role === 'admin' && (
              <Button
                onClick={handleForceUpgradeChallenge}
                disabled={processing || !activeAccount || userData.accountStatus !== 'active'}
                variant="secondary"
                className="w-full"
              >
                Forcer l'upgrade (admin)
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si c'est un compte financé mais pas KYC vérifié
  if (!userData.kycVerified) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vérification d'Identité Requise</h1>
            <p className="text-muted-foreground">
              Vérifiez votre identité pour débloquer les payouts
            </p>
          </div>
          <AccountSelector />
        </div>

        <Card className="border-blue-500 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Shield className="h-6 w-6 text-blue-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-600">
                  Pourquoi vérifier mon identité ?
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Pour des raisons de sécurité et de conformité, nous devons vérifier l'identité de tous les traders avant d'autoriser les retraits.
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
                  <li>Processus rapide (2-3 minutes)</li>
                  <li>Documents acceptés: Passeport, Carte d'identité, Permis</li>
                  <li>Selfie requis pour la sécurité</li>
                  <li>Vérification instantanée</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commencer la Vérification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La vérification se fait via Stripe Identity, un service sécurisé de vérification d'identité.
            </p>

            {userData.kycStatus === 'pending' && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⏳ Vérification en cours. Cela peut prendre quelques minutes.
                </p>
              </div>
            )}

            {userData.kycStatus === 'requires_input' && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  ⚠️ Informations supplémentaires requises. Cliquez ci-dessous pour compléter.
                </p>
              </div>
            )}

            <Button
              onClick={handleStartKyc}
              disabled={processing}
              className="w-full"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création session...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Vérifier mon Identité
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si compte financé + KYC vérifié = Formulaire payout
  const isEligible = Boolean(eligibilityInfo?.eligible);
  const maxPayout = Number(eligibilityInfo?.maxPayout || 0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            Demande de Payout
            <CheckCircle className="h-6 w-6 text-green-600" />
          </h1>
          <p className="text-muted-foreground">
            Retirez vos profits de trading
          </p>
        </div>
        <AccountSelector />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Éligibilité</span>
            <Button
              variant="secondary"
              onClick={() => activeAccount?.id && refreshEligibility(activeAccount.id)}
              disabled={processing || !activeAccount}
            >
              Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Statut</span>
            <span className={`font-bold ${isEligible ? 'text-green-600' : 'text-orange-600'}`}>{isEligible ? 'Éligible' : 'Non éligible'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Raison</span>
            <span className="text-sm text-muted-foreground text-right">{String(eligibilityInfo?.reason || '—')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Max disponible</span>
            <span className="font-bold">{formatCurrency(Number.isFinite(maxPayout) ? maxPayout : 0)}</span>
          </div>
          {userData.role === 'admin' && userData.accountType === 'funded' && (
            <Button
              onClick={handleAdminForcePayoutEligible}
              disabled={processing || !activeAccount}
              variant="secondary"
              className="w-full"
            >
              Forcer éligibilité (+10%) (admin)
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Demander un Payout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isEligible ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⏳ Vous ne remplissez pas encore toutes les conditions. Continuez à trader !
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Prénom</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                    className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">RIB / IBAN</label>
                <input
                  type="text"
                  value={rib}
                  onChange={(e) => setRib(e.target.value)}
                  placeholder="FR76..."
                  className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Montant (USD)</label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="0.00"
                  max={maxPayout || 0}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-lg bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum disponible: {formatCurrency(Number.isFinite(maxPayout) ? maxPayout : 0)}
                </p>
              </div>

              <Button
                onClick={handleRequestPayout}
                disabled={processing || !payoutAmount}
                className="w-full"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Demander {payoutAmount ? formatCurrency(parseFloat(payoutAmount)) : 'Payout'}
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
