"use client";

import { useAccount } from "@/context/AccountContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

export function AccountSelector() {
  const { accounts, activeAccountId, setActiveAccountId, loading } = useAccount();
  const { t } = useLanguage();

  const getAccountKindLabel = (acc: any): string => {
    const isFunded = Boolean(acc?.isFunded) || String(acc?.accountType || '').toLowerCase() === 'funded';
    return isFunded ? 'FUNDED' : 'CHALLENGE';
  };

  const getAccountPlanLabel = (acc: any): string => {
    const plan = typeof acc?.planType === 'string' ? acc.planType.trim() : '';
    const challengeType = typeof acc?.challengeType === 'string' ? acc.challengeType.trim() : '';
    return plan || challengeType || '';
  };

  if (loading || accounts.length === 0) {
    return null;
  }

  // Don't show selector if only one account
  if (accounts.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{accounts[0].accountName}</span>
        <Badge variant={accounts[0].accountStatus === 'active' ? 'default' : 'secondary'} className="ml-auto">
          {getAccountKindLabel(accounts[0])}
        </Badge>
        {getAccountPlanLabel(accounts[0]) && (
          <Badge variant="secondary" className="text-xs">
            {getAccountPlanLabel(accounts[0])}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Wallet className="h-4 w-4 text-muted-foreground" />
      <Select value={activeAccountId || undefined} onValueChange={setActiveAccountId}>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Sélectionner un compte" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <div className="flex items-center justify-between w-full gap-4">
                <span>{account.accountName}</span>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={account.accountStatus === 'active' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {getAccountKindLabel(account)}
                  </Badge>
                  {getAccountPlanLabel(account) && (
                    <Badge variant="secondary" className="text-xs">
                      {getAccountPlanLabel(account)}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ${account.accountBalance.toLocaleString()}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
