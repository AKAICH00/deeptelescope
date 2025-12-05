
import { Paddle, Environment } from '@paddle/paddle-node-sdk';

const PADDLE_API_KEY = 'pdl_live_apikey_01kbr283g93ykrn0wett8axm81_5J0bC9HTNsRNVyb19rMp6x_AWr';

const paddle = new Paddle(PADDLE_API_KEY, {
    environment: Environment.production,
});

const products = [
    {
        name: 'Deep Telescope Pro',
        description: '500 reviews/month, Priority queue, Email support',
        taxCategory: 'standard_digital',
        prices: [
            {
                description: 'Monthly Pro Subscription',
                unitPrice: {
                    amount: '4900', // $49.00
                    currencyCode: 'USD' as any,
                },
                billingCycle: {
                    interval: 'month',
                    frequency: 1,
                },
                trialPeriod: null,
            }
        ]
    },
    {
        name: 'Deep Telescope Team',
        description: '2,500 reviews/month, 6-agent swarm, Team dashboard',
        taxCategory: 'standard_digital',
        prices: [
            {
                description: 'Monthly Team Subscription',
                unitPrice: {
                    amount: '19900', // $199.00
                    currencyCode: 'USD' as any,
                },
                billingCycle: {
                    interval: 'month',
                    frequency: 1,
                },
                trialPeriod: null,
            }
        ]
    }
];

async function main() {
    console.log('🚀 Initializing Paddle Products...');

    for (const p of products) {
        try {
            console.log(`Creating product: ${p.name}...`);

            const product = await paddle.products.create({
                name: p.name,
                description: p.description,
                taxCategory: 'standard' as any,
                type: 'standard',
            });

            console.log(`✅ Created Product: ${product.id}`);

            // Create Price
            if (p.prices && p.prices.length > 0) {
                const priceConfig = p.prices[0];
                const price = await paddle.prices.create({
                    productId: product.id,
                    description: priceConfig.description,
                    unitPrice: priceConfig.unitPrice,
                    billingCycle: priceConfig.billingCycle as any,
                });
                console.log(`   💰 Created Price: ${price.id} (${price.unitPrice.amount} ${price.unitPrice.currencyCode})`);
            }

        } catch (error: any) {
            console.error(`❌ Error creating ${p.name}:`, JSON.stringify(error, null, 2));
        }
    }

    console.log('\n✅ Setup Complete! Copy the Price IDs above to your landing page.');
}

main().catch(console.error);
