/**
 * Type definitions for Stripe webhook events and data structures
 */

import Stripe from 'stripe';

// Use type aliases instead of interfaces for better compatibility
export type StripeCheckoutSession = Stripe.Checkout.Session & {
  metadata?: {
    challengeType?: string;
    profitTarget?: string;
    maxDrawdown?: string;
    email?: string;
  };
};

export type StripeSubscription = Stripe.Subscription;

export type StripeCustomer = Stripe.Customer;

export type StripeWebhookEvent = Stripe.Event;
