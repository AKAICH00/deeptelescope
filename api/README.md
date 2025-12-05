# AI Collab Swarm API - Quick Start

## Local Development

```bash
# Install dependencies
npm install

# Start API server
npm run api:dev

# Test health check
curl http://localhost:3000/health

# Test review endpoint
curl -X POST http://localhost:3000/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "task": "Add two numbers with type safety"
  }'
```

## Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# Set environment variables
railway variables set HF_TOKEN=your_token_here
```

## Environment Variables

```bash
HF_TOKEN=your_huggingface_token
PORT=3000
NODE_ENV=production
```

## API Endpoints

### Health Check
```
GET /health
```

### Code Review
```
POST /api/review
{
  "code": "string",
  "task": "string",
  "apiKey": "string" (optional for now)
}
```

## Next Steps

1. Sign up for Paddle
2. Deploy to Railway
3. Test production API
4. Add Paddle webhook verification
