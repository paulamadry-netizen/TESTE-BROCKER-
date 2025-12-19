"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { User, Bell, Shield, Palette, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UserData {
  email: string;
  accountStatus: string;
  createdAt: any;
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState({
    tradeAlerts: true,
    challengeUpdates: true,
    riskWarnings: true,
    marketingEmails: false,
  });

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
        <p className="text-muted-foreground">{t("common.noData")}</p>
      </div>
    );
  }

  const handleChangePassword = () => {
    alert("Changement de mot de passe - Cette fonctionnalité sera connectée à Firebase");
  };

  const handleEnable2FA = () => {
    alert("Activation 2FA - Cette fonctionnalité sera connectée à Firebase");
  };

  const handleManageSessions = () => {
    alert("Gestion des sessions - Cette fonctionnalité sera connectée à Firebase");
  };

  const handleEditProfile = () => {
    alert("Édition du profil - Cette fonctionnalité sera connectée à Firebase");
  };

  const handleUpdatePreferences = () => {
    alert("Préférences mises à jour avec succès !");
  };

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("settings.profileSettings")}
          </CardTitle>
          <CardDescription>
            {t("settings.updatePersonalInfo")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("settings.email")}</label>
              <p className="mt-1 text-lg font-semibold">{userData.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("settings.accountStatus")}</label>
              <Badge variant={userData.accountStatus === "active" ? "success" : "secondary"} className="mt-1">
                {t(`status.${userData.accountStatus}`)}
              </Badge>
            </div>
          </div>
          <div className="pt-4">
            <Button onClick={handleEditProfile}>{t("settings.editProfile")}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("settings.notificationPreferences")}
          </CardTitle>
          <CardDescription>
            {t("settings.chooseNotifications")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">{t("settings.tradeAlerts")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.tradeAlertsDesc")}
              </p>
            </div>
            <Button
              variant={notifications.tradeAlerts ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("tradeAlerts")}
            >
              {notifications.tradeAlerts ? t("settings.enabled") : t("settings.disabled")}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">{t("settings.challengeUpdates")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.challengeUpdatesDesc")}
              </p>
            </div>
            <Button
              variant={notifications.challengeUpdates ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("challengeUpdates")}
            >
              {notifications.challengeUpdates ? t("settings.enabled") : t("settings.disabled")}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">{t("settings.riskWarnings")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.riskWarningsDesc")}
              </p>
            </div>
            <Button
              variant={notifications.riskWarnings ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("riskWarnings")}
            >
              {notifications.riskWarnings ? t("settings.enabled") : t("settings.disabled")}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{t("settings.marketingEmails")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.marketingEmailsDesc")}
              </p>
            </div>
            <Button
              variant={notifications.marketingEmails ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("marketingEmails")}
            >
              {notifications.marketingEmails ? t("settings.enabled") : t("settings.disabled")}
            </Button>
          </div>
          <div className="pt-4">
            <Button onClick={handleUpdatePreferences}>{t("settings.updatePreferences")}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("settings.security")}
          </CardTitle>
          <CardDescription>
            {t("settings.managePassword")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">{t("settings.password")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.lastChanged")}
              </p>
            </div>
            <Button variant="outline" onClick={handleChangePassword}>{t("settings.changePassword")}</Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">{t("settings.twoFactorAuth")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.addExtraSecurity")}
              </p>
            </div>
            <Button variant="outline" onClick={handleEnable2FA}>{t("settings.enable2FA")}</Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{t("settings.activeSessions")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.viewManageSessions")}
              </p>
            </div>
            <Button variant="outline" onClick={handleManageSessions}>{t("settings.manageSessions")}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t("settings.appearance")}
          </CardTitle>
          <CardDescription>
            {t("settings.customizeDashboard")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{t("settings.theme")}</p>
              <p className="text-sm text-muted-foreground">
                {t("settings.currentlyDarkMode")}
              </p>
            </div>
            <Badge variant="secondary">{t("settings.darkMode")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("settings.lightModeComingSoon")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
