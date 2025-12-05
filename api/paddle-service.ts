/**
 * Paddle Billing Service
 * Handles subscription management and API key verification
 */

import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import * as dotenv from 'dotenv';

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
            // In production, you'd store API keys in your database
            // and link them to Paddle customer IDs

            // For now, return mock data
            // TODO: Implement actual API key verification

            return {
                valid: true,
                tier: 'pro',
                reviewsRemaining: 500,
            };
        } catch (error) {
            console.error('[Paddle] Verification error:', error);
            return { valid: false };
        }
    }

    /**
     * Create a checkout session for subscription
     */
    async createCheckout(priceId: string, customerId?: string) {
        try {
            const checkout = await this.paddle.checkouts.create({
                items: [{ priceId, quantity: 1 }],
                customerId,
            });

            return {
                checkoutId: checkout.id,
                url: checkout.url,
            };
        } catch (error) {
            console.error('[Paddle] Checkout creation error:', error);
            throw error;
        }
    }

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
        // TODO: Create user account, generate API key
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
