/**
 * Paddle Billing Service
 * Handles subscription management and API key verification
 */

import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import * as dotenv from 'dotenv';
import { userRepo } from './db.js';
import * as crypto from 'crypto';

dotenv.config();

export class PaddleService {
    private paddle: Paddle;

    constructor() {
        const apiKey = process.env.PADDLE_API_KEY;
        if (!apiKey) {
            throw new Error('PADDLE_API_KEY not set');
        }

        this.paddle = new Paddle(apiKey, {
            environment: process.env.PADDLE_ENVIRONMENT === 'sandbox'
                ? Environment.sandbox
                : Environment.production,
        });
    }

    /**
     * Verify API key and get subscription details
     */
    async verifyApiKey(apiKey: string): Promise<{
        valid: boolean;
        tier?: 'free' | 'pro' | 'team' | 'enterprise';
        reviewsRemaining?: number;
        customerId?: string;
    }> {
        try {
            const user = userRepo.findByApiKey(apiKey);

            if (!user) {
                return { valid: false };
            }

            // Check if usage limit exceeded
            const limit = this.getLimitForPlan(user.plan);
            const remaining = limit - user.usage_count;

            return {
                valid: true,
                tier: user.plan as any,
                reviewsRemaining: remaining > 0 ? remaining : 0,
                customerId: user.customer_id,
            };
        } catch (error) {
            console.error('[Paddle] Verification error:', error);
            return { valid: false };
        }
    }

    private getLimitForPlan(plan: string): number {
        switch (plan) {
            case 'pro': return 500;
            case 'team': return 2500;
            case 'enterprise': return 1000000;
            default: return 10; // Free
        }
    }

    // Checkout creation is handled client-side by Paddle.js
    // We don't need a server-side method for now.

    /**
     * Handle webhook events from Paddle
     */
    async handleWebhook(event: any) {
        const eventType = event.event_type;

        switch (eventType) {
            case 'subscription.created':
                await this.handleSubscriptionCreated(event.data);
                break;

            case 'subscription.updated':
                await this.handleSubscriptionUpdated(event.data);
                break;

            case 'subscription.canceled':
                await this.handleSubscriptionCanceled(event.data);
                break;

            case 'transaction.completed':
                await this.handleTransactionCompleted(event.data);
                break;

            default:
                console.log(`[Paddle] Unhandled event: ${eventType}`);
        }
    }

    private async handleSubscriptionCreated(data: any) {
        console.log('[Paddle] Subscription created:', data.id);

        const customerId = data.customer_id;
        const subscriptionId = data.id;
        // In real webhook, email might be in 'custom_data' or fetched from customer
        // We'll mock it or fetch customer details
        const email = data.custom_data?.email || `user_${customerId}@example.com`;

        // Determine plan from price_id
        const priceId = data.items[0].price.id;
        let plan = 'free';
        if (priceId === 'pri_01kbrar2njgjashwz1n6sah22e') plan = 'pro';
        if (priceId === 'pri_01kbrar31ang5hxzwbkvhv9hms') plan = 'team';

        // Generate API Key
        const apiKey = `dt_${plan}_${crypto.randomBytes(16).toString('hex')}`;

        // Store in DB
        userRepo.updateSubscription(customerId, subscriptionId, plan, email);
        // Note: updateSubscription updates existing or creates new if email matches? 
        // Our db.ts logic for create vs update needs better handling for NEW users.
        // Let's use userRepo.create first if not exists.

        let user = userRepo.findByEmail(email);
        if (!user) {
            userRepo.create(email, apiKey, plan);
            // Now update with paddle IDs
            userRepo.updateSubscription(customerId, subscriptionId, plan, email);
        } else {
            userRepo.updateSubscription(customerId, subscriptionId, plan, email);
        }

        console.log(`✅ User Provisioned: ${email} (${plan})`);
        console.log(`🔑 API Key: ${apiKey}`);
        console.log(`👉 TODO: Email this key to the user via Resend/SMTP`);
    }

    private async handleSubscriptionUpdated(data: any) {
        console.log('[Paddle] Subscription updated:', data.id);
        // TODO: Update user tier, adjust limits
    }

    private async handleSubscriptionCanceled(data: any) {
        console.log('[Paddle] Subscription canceled:', data.id);
        // TODO: Revoke API key, downgrade to free tier
    }

    private async handleTransactionCompleted(data: any) {
        console.log('[Paddle] Transaction completed:', data.id);
        // TODO: Log payment, send receipt
    }

    /**
     * Track usage for billing
     */
    async trackUsage(customerId: string, quantity: number) {
        try {
            // TODO: Implement usage-based billing if needed
            console.log(`[Paddle] Tracked ${quantity} reviews for ${customerId}`);
        } catch (error) {
            console.error('[Paddle] Usage tracking error:', error);
        }
    }
}

export const paddleService = new PaddleService();
