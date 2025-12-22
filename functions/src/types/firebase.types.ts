/**
 * Type definitions for Firebase/Firestore data structures
 */

import { FieldValue } from 'firebase-admin/firestore';

export interface UserDocument {
  email: string;
  stripeCustomerId: string;
  stripeSessionId?: string;
  challengeType: string;
  accountBalance: number;
  accountStatus: 'active' | 'inactive';
  profitTarget: number;
  maxDrawdown: number;
  tradingDays: number;
  createdAt: FieldValue;
  updatedAt: FieldValue;
  subscriptionId?: string;
  subscriptionStatus?: string;
}

export interface UserAccountData {
  email: string;
  password: string;
  stripeCustomerId: string;
  paymentIntentId: string;
  balance: number;
  status: 'active' | 'inactive';
  createdAt: FieldValue;
  lastLogin: null;
}

export interface CreateUserResult {
  success: boolean;
  email?: string;
  password?: string;
  error?: string;
}

export interface EmailTemplate {
  to: string;
  template: {
    name: string;
    data: {
      email: string;
      password: string;
      dashboardUrl: string;
      challengeType: string;
    };
  };
}
