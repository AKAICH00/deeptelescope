# 💰 Deep Telescope - Pricing

## Plans

### Free Tier
**$0/month**
- 10 reviews per month
- 4-agent swarm
- Community support
- Self-hosted option available

Perfect for: Trying out the service, small projects

### Pro
**$49/month**
- 500 reviews per month
- 4-agent swarm
- Email support
- Priority queue (faster reviews)
- API access

Perfect for: Solo developers, freelancers

### Team
**$199/month**
- 2,500 reviews per month
- 6-agent swarm (better consensus)
- Slack integration
- Team dashboard
- Priority support

Perfect for: Small teams (5-20 people)

### Enterprise
**Custom pricing**
- Unlimited reviews
- Custom swarm size
- On-premise deployment
- Custom models
- SLA + phone support
- Dedicated account manager

Perfect for: Large teams, enterprises

## Paddle Product IDs

**Note**: Update these with your actual Paddle product IDs

```
Free: N/A (no payment required)
Pro: pri_01xxxxxxxxxx
Team: pri_01xxxxxxxxxx  
Enterprise: Contact sales
```

## Setup Instructions

1. Create products in Paddle dashboard
2. Get price IDs for each tier
3. Update `.env` with `PADDLE_API_KEY`
4. Configure webhook URL: `https://your-domain.com/api/webhook/paddle`
5. Test checkout flow

## API Key Management

Users get an API key after subscribing via Paddle.

**Usage:**
```bash
curl -X POST https://api.deeptelescope.dev/api/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "code": "your code here",
    "task": "what it should do"
  }'
```

## Webhook Events

Paddle sends webhooks for:
- `subscription.created` - New customer
- `subscription.updated` - Plan change
- `subscription.canceled` - Cancellation
- `transaction.completed` - Payment received

All handled automatically by the API server.
