"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "./AuthContext";

export interface TradingAccount {
  id: string;
  accountName: string;
  accountStatus: string;
  accountBalance: number;
  initialBalance: number;
  brokerPassword: string;
  challengeType: string;
  planType: string;
  profitTarget: number;
  maxDrawdown: number;
  tradingDays: number;
  createdAt: any;
}

interface AccountContextType {
  accounts: TradingAccount[];
  activeAccount: TradingAccount | null;
  activeAccountId: string | null;
  setActiveAccountId: (id: string) => void;
  loading: boolean;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccounts = async () => {
    if (!user) {
      setAccounts([]);
      setActiveAccountIdState(null);
      setLoading(false);
      return;
    }

    try {
      // Get user document to find active account
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      let savedActiveAccountId: string | null = null;
      
      if (userDocSnap.exists()) {
        savedActiveAccountId = userDocSnap.data().activeAccountId || null;
      }

      // Load all accounts from subcollection
      const accountsRef = collection(db, "users", user.uid, "accounts");
      const accountsSnap = await getDocs(accountsRef);
      
      const loadedAccounts: TradingAccount[] = [];
      accountsSnap.forEach((doc) => {
        loadedAccounts.push({
          id: doc.id,
          ...doc.data(),
        } as TradingAccount);
      });

      // Sort by creation date (newest first)
      loadedAccounts.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setAccounts(loadedAccounts);

      // Set active account
      if (savedActiveAccountId && loadedAccounts.find(a => a.id === savedActiveAccountId)) {
        setActiveAccountIdState(savedActiveAccountId);
      } else if (loadedAccounts.length > 0) {
        setActiveAccountIdState(loadedAccounts[0].id);
      }
    } catch (error) {
      console.error("Error loading accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [user]);

  const setActiveAccountId = async (id: string) => {
    setActiveAccountIdState(id);
    
    // Save to Firestore
    if (user) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, { activeAccountId: id });
      } catch (error) {
        console.error("Error saving active account:", error);
      }
    }
  };

  const activeAccount = accounts.find(a => a.id === activeAccountId) || null;

  return (
    <AccountContext.Provider
      value={{
        accounts,
        activeAccount,
        activeAccountId,
        setActiveAccountId,
        loading,
        refreshAccounts: loadAccounts,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
}
