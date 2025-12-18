"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
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
        <p className="text-muted-foreground">No account data found</p>
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
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </CardTitle>
          <CardDescription>
            Update your personal information and profile details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="mt-1 text-lg font-semibold">{userData.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Account Status</label>
              <Badge variant={userData.accountStatus === "active" ? "success" : "secondary"} className="mt-1">
                {userData.accountStatus.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="pt-4">
            <Button onClick={handleEditProfile}>Edit Profile</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose what notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Trade Alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when trades are opened or closed
              </p>
            </div>
            <Button
              variant={notifications.tradeAlerts ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("tradeAlerts")}
            >
              {notifications.tradeAlerts ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Challenge Updates</p>
              <p className="text-sm text-muted-foreground">
                Receive updates about your challenge progress
              </p>
            </div>
            <Button
              variant={notifications.challengeUpdates ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("challengeUpdates")}
            >
              {notifications.challengeUpdates ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Risk Warnings</p>
              <p className="text-sm text-muted-foreground">
                Get alerts when approaching drawdown limits
              </p>
            </div>
            <Button
              variant={notifications.riskWarnings ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("riskWarnings")}
            >
              {notifications.riskWarnings ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Marketing Emails</p>
              <p className="text-sm text-muted-foreground">
                Receive news and promotional offers
              </p>
            </div>
            <Button
              variant={notifications.marketingEmails ? "default" : "outline"}
              size="sm"
              onClick={() => toggleNotification("marketingEmails")}
            >
              {notifications.marketingEmails ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="pt-4">
            <Button onClick={handleUpdatePreferences}>Update Preferences</Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your password and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">
                Last changed 30 days ago
              </p>
            </div>
            <Button variant="outline" onClick={handleChangePassword}>Change Password</Button>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account
              </p>
            </div>
            <Button variant="outline" onClick={handleEnable2FA}>Enable 2FA</Button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Active Sessions</p>
              <p className="text-sm text-muted-foreground">
                View and manage your active sessions
              </p>
            </div>
            <Button variant="outline" onClick={handleManageSessions}>Manage Sessions</Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize the look and feel of your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">
                Currently using dark mode
              </p>
            </div>
            <Badge variant="secondary">Dark Mode</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Note: Light mode and theme customization coming soon!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
