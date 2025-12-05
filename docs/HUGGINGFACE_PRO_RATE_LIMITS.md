# HuggingFace Pro Tier API Rate Limits & Swarm Scaling Guide

**Last Updated:** 2025-01-05
**Research Date:** 2025-01-05
**Sources:** HuggingFace Official Documentation, Community Forums

---

## Executive Summary

HuggingFace Pro tier ($9/month) provides **enhanced rate limits** but **lacks specific concurrency documentation**. For swarm scaling (multiple concurrent agent requests), careful implementation with exponential backoff and rate limit awareness is critical.

**Key Findings:**
- ✅ Pro tier provides 5x rate limit increase over free tier
- ⚠️ Concurrency limits NOT explicitly documented
- ⚠️ Serverless API NOT recommended for heavy production loads
- ✅ 5-minute rolling windows allow burstiness

---

## Rate Limit Specifications

### Pro Tier Limits (Per 5-Minute Window)

| Request Type | Free Tier | Pro Tier | Multiplier |
|-------------|-----------|----------|------------|
| **Hub APIs** (search, repo creation) | 500 | 2,500 | 5x |
| **Resolvers** (file downloads) | 2,400 | 12,000 | 5x |
| **Pages** (web browsing) | 80 | 400 | 5x |

**Window Mechanism:** Rolling 5-minute windows (not hourly resets)
**Burstiness:** Allows short bursts above average rate
**Error Response:** `429 Too Many Requests` when exceeded

### Rate Limit Headers

HuggingFace implements IETF draft standard headers:
```
RateLimit: remaining requests in current window
RateLimit-Policy: limit configuration details
```

---

## Concurrency Limits

### Official Position
**❌ NOT DOCUMENTED** - HuggingFace does not publish specific concurrent request limits.

### Inferred Best Practices
Based on community reports and documentation:

1. **Free Tier:** Sudden spikes (e.g., 10k requests) → `503 Service Unavailable`
2. **Pro Tier:** Better handling, but still requires gradual ramp-up
3. **Recommended Approach:** Smooth ramp from 0 → target load over several minutes

### Swarm Scaling Implications

For AI agent swarms (multiple concurrent requests):

**Conservative Approach:**
- Start: 5-10 concurrent requests
- Ramp: Add 5 requests every 30 seconds
- Monitor: Watch for 429/503 errors
- Maximum: Likely 50-100 concurrent (unverified)

**Aggressive Approach (Pro Tier):**
- Start: 20-30 concurrent requests
- Ramp: Add 10 requests every 30 seconds
- Monitor: Implement retry logic
- Maximum: Test and validate (100-200 estimated)

---

## Inference API Rate Limits

### Serverless Inference API

**Pro Tier Benefits:**
- ✅ Higher rate limits (exact numbers not published)
- ✅ 20x monthly allowance increase
- ✅ $2 usage credits included with $9/month Pro
- ✅ Continued access after credits exhausted (pay-as-you-go)
- ✅ Exclusive models (Llama 3, Mixtral 8x7B, SDXL, etc.)

**Limitations:**
- ⚠️ NOT for heavy production applications
- ⚠️ Rate limits "subject to change" (moving to compute/token-based)
- ⚠️ No guaranteed latency or SLA

### Inference Endpoints (Dedicated)

**For Production Swarm Scaling:**
- ✅ Dedicated resources (no shared rate limits)
- ✅ Autoscaling (min/max replica configuration)
- ✅ Guaranteed performance and latency
- ✅ No concurrent request limits (resource-bound only)
- 💰 Higher cost (~$0.06-$1.00/hour depending on GPU)

**Recommendation:** Use Inference Endpoints for swarm agents requiring >100 concurrent requests or guaranteed performance.

---

## Best Practices for Swarm Scaling

### 1. Exponential Backoff

Implement retry logic with exponential backoff:

```typescript
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 || error.status === 503) {
        const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s, 8s, 16s
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Max retries (${maxRetries}) exceeded`);
}
```

### 2. Request Batching

Batch multiple operations into single requests where possible:

```typescript
// Instead of 10 separate requests
for (const item of items) {
  await inferenceAPI.call(item);
}

// Batch into fewer requests
const batches = chunk(items, 10);
for (const batch of batches) {
  await inferenceAPI.callBatch(batch);
}
```

### 3. Rate Limit Tracking

Track your own request rate to stay within limits:

```typescript
class RateLimiter {
  private requests: number[] = [];
  private windowMs = 5 * 60 * 1000; // 5 minutes
  private maxRequests = 2500; // Pro tier Hub API limit

  async throttle(): Promise<void> {
    const now = Date.now();

    // Remove requests outside current window
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}
```

### 4. Authentication Token

**CRITICAL:** Always provide `HF_TOKEN` for authentication:

```typescript
const response = await fetch('https://api-inference.huggingface.co/models/...', {
  headers: {
    'Authorization': `Bearer ${process.env.HF_TOKEN}`,
  },
});
```

**Why:** Unauthenticated requests have **much lower** rate limits and are the "#1 reason users get rate limited."

### 5. Smooth Traffic Ramping

For swarm initialization:

```typescript
class SwarmScaler {
  async rampUp(targetConcurrency: number) {
    const rampDurationMs = 3 * 60 * 1000; // 3 minutes
    const steps = 10;
    const stepDuration = rampDurationMs / steps;

    for (let i = 1; i <= steps; i++) {
      const currentConcurrency = Math.floor((i / steps) * targetConcurrency);
      await this.setActiveAgents(currentConcurrency);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
  }
}
```

### 6. Circuit Breaker Pattern

Prevent cascading failures:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private threshold = 5;
  private cooldownMs = 60000; // 1 minute

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      return timeSinceLastFailure < this.cooldownMs;
    }
    return false;
  }

  private onSuccess() {
    this.failures = 0;
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}
```

---

## Swarm Scaling Architecture Recommendations

### Small Swarm (1-10 Agents)
**Target:** <500 requests per 5-minute window
**Infrastructure:** Serverless Inference API (Pro tier)
**Concurrency:** 5-10 concurrent requests
**Cost:** $9/month + usage

### Medium Swarm (10-50 Agents)
**Target:** 500-2000 requests per 5-minute window
**Infrastructure:** Serverless Inference API (Pro tier) + careful rate limiting
**Concurrency:** 20-50 concurrent requests
**Cost:** $9/month + higher usage credits

### Large Swarm (50-200 Agents)
**Target:** 2000-10000 requests per 5-minute window
**Infrastructure:** **Inference Endpoints (Dedicated)** or multiple Pro accounts
**Concurrency:** 50-200 concurrent requests
**Cost:** $100-500/month (dedicated endpoints)

### Enterprise Swarm (200+ Agents)
**Target:** >10000 requests per 5-minute window
**Infrastructure:** **Inference Endpoints with Autoscaling**
**Concurrency:** Unlimited (resource-bound)
**Cost:** $500-5000/month (scales with usage)

---

## Monitoring and Observability

### Key Metrics to Track

1. **Request Rate:** Requests per 5-minute window
2. **Error Rate:** 429/503 errors as percentage of total requests
3. **Latency:** P50, P95, P99 response times
4. **Concurrent Requests:** Active requests at any moment
5. **Retry Rate:** Percentage of requests requiring retries

### Recommended Tooling

```typescript
// Example metrics collection
class MetricsCollector {
  private requestsInWindow = 0;
  private errors429 = 0;
  private errors503 = 0;
  private totalRequests = 0;
  private latencies: number[] = [];

  recordRequest(latencyMs: number, statusCode: number) {
    this.totalRequests++;
    this.requestsInWindow++;
    this.latencies.push(latencyMs);

    if (statusCode === 429) this.errors429++;
    if (statusCode === 503) this.errors503++;
  }

  getMetrics() {
    return {
      requestRate: this.requestsInWindow / 5, // per minute
      errorRate: (this.errors429 + this.errors503) / this.totalRequests,
      p50Latency: this.percentile(this.latencies, 0.5),
      p95Latency: this.percentile(this.latencies, 0.95),
      p99Latency: this.percentile(this.latencies, 0.99),
    };
  }

  resetWindow() {
    this.requestsInWindow = 0;
  }

  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }
}
```

---

## Migration Path: Serverless → Dedicated

### When to Migrate

Migrate from Serverless to Inference Endpoints when:
- ✅ Consistent >2000 requests per 5-minute window
- ✅ >50 concurrent agents
- ✅ 429 errors exceed 5% of requests
- ✅ Production SLA requirements
- ✅ Predictable latency needed

### Migration Steps

1. **Deploy Endpoint:** Create dedicated endpoint with target model
2. **Shadow Traffic:** Route 10% of requests to new endpoint
3. **Validate:** Compare latency and error rates
4. **Gradual Rollout:** 25% → 50% → 75% → 100%
5. **Monitor:** Track cost vs. performance improvements
6. **Scale:** Adjust min/max replicas based on load patterns

---

## Cost Analysis

### Serverless Pro Tier
```
Base: $9/month
Credits: $2 included
Additional: Pay-as-you-go (varies by model)

Estimated for Medium Swarm:
- Base: $9/month
- Usage: ~$20-50/month
- Total: ~$30-60/month
```

### Inference Endpoints
```
Small GPU (NVIDIA T4): ~$0.60/hour = ~$432/month
Medium GPU (NVIDIA A10G): ~$1.00/hour = ~$720/month
Large GPU (NVIDIA A100): ~$4.00/hour = ~$2,880/month

With autoscaling (50% utilization):
- Small: ~$216/month
- Medium: ~$360/month
- Large: ~$1,440/month
```

---

## Testing Recommendations

### Load Testing Script

```typescript
async function loadTest(
  concurrency: number,
  duration: number,
  rampDuration: number
) {
  const metrics = new MetricsCollector();
  const rateLimiter = new RateLimiter();
  const startTime = Date.now();

  // Gradual ramp
  const rampSteps = 10;
  for (let i = 1; i <= rampSteps; i++) {
    const currentConcurrency = Math.floor((i / rampSteps) * concurrency);
    await setActiveWorkers(currentConcurrency);
    await sleep(rampDuration / rampSteps);
  }

  // Sustained load
  const endTime = Date.now() + duration;
  const workers = Array.from({ length: concurrency }, (_, i) =>
    runWorker(i, endTime, rateLimiter, metrics)
  );

  await Promise.all(workers);

  return metrics.getMetrics();
}

async function runWorker(
  id: number,
  endTime: number,
  rateLimiter: RateLimiter,
  metrics: MetricsCollector
) {
  while (Date.now() < endTime) {
    await rateLimiter.throttle();

    const startTime = Date.now();
    try {
      await callHuggingFaceAPI();
      const latency = Date.now() - startTime;
      metrics.recordRequest(latency, 200);
    } catch (error) {
      const latency = Date.now() - startTime;
      metrics.recordRequest(latency, error.status);
    }
  }
}
```

### Recommended Test Scenarios

1. **Baseline:** 5 concurrent, 5 minutes → Measure baseline performance
2. **Medium Load:** 25 concurrent, 10 minutes → Validate rate limits
3. **High Load:** 50 concurrent, 15 minutes → Find breaking point
4. **Spike Test:** 0 → 100 concurrent instant → Test error handling
5. **Sustained:** Target concurrency, 1 hour → Production simulation

---

## Troubleshooting Guide

### Problem: 429 Rate Limit Errors

**Solutions:**
1. Verify `HF_TOKEN` is provided
2. Reduce request rate
3. Implement exponential backoff
4. Check you're on Pro tier (not free)
5. Consider Inference Endpoints

### Problem: 503 Service Unavailable

**Solutions:**
1. Slow down ramp-up (too sudden spike)
2. Add gradual traffic ramping
3. Distribute requests over time
4. Use retry logic with backoff
5. Contact HuggingFace support

### Problem: High Latency (>5s)

**Solutions:**
1. Model may be cold-starting (serverless)
2. Consider dedicated endpoints
3. Use smaller/faster models
4. Implement request timeouts
5. Cache responses where possible

### Problem: Inconsistent Performance

**Solutions:**
1. Serverless API has no SLA
2. Migrate to Inference Endpoints
3. Implement robust retry logic
4. Use circuit breaker pattern
5. Monitor and alert on degradation

---

## Additional Resources

- [HuggingFace Hub Rate Limits](https://huggingface.co/docs/hub/en/rate-limits)
- [Inference API Rate Limits](https://huggingface.co/docs/api-inference/en/rate-limits)
- [Inference Endpoints Documentation](https://huggingface.co/docs/inference-endpoints)
- [Pro Tier Features](https://huggingface.co/blog/inference-pro)
- [Community Forums](https://discuss.huggingface.co/)

---

## Summary & Action Items

### For Swarm Scaling on Pro Tier:

✅ **Do:**
- Authenticate all requests with `HF_TOKEN`
- Implement exponential backoff for 429/503 errors
- Ramp up concurrency gradually (0 → target over 3-5 minutes)
- Track rate limits locally (don't rely on errors)
- Start conservative: 10-20 concurrent requests
- Monitor error rates and latency continuously
- Plan migration to Inference Endpoints for >50 agents

❌ **Don't:**
- Send sudden traffic spikes (0 → 1000 requests)
- Exceed 2500 Hub API requests per 5-minute window
- Expect guaranteed performance on Serverless API
- Use for heavy production without dedicated endpoints
- Assume concurrency limits (test and validate)

### Recommended Starting Configuration

```typescript
const SWARM_CONFIG = {
  tier: 'pro',
  initialConcurrency: 10,
  maxConcurrency: 50, // Conservative for Pro tier
  rampDurationMs: 180000, // 3 minutes
  rateLimitPerWindow: 2500, // Pro tier Hub API
  windowDurationMs: 300000, // 5 minutes
  retryConfig: {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 16000,
  },
  circuitBreaker: {
    errorThreshold: 5,
    cooldownMs: 60000,
  },
};
```

**Next Steps:**
1. Implement rate limiting and retry logic
2. Create metrics collection and monitoring
3. Test with conservative concurrency (10 agents)
4. Gradually increase and measure performance
5. Plan Inference Endpoints migration if needed
