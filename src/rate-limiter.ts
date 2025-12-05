/**
 * Token Bucket Rate Limiter
 *
 * Implements a token bucket algorithm for rate limiting with time-based refill.
 */

export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    public readonly capacity: number,
    public readonly refillRate: number
  ) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than 0');
    }
    if (refillRate <= 0) {
      throw new Error('Refill rate must be greater than 0');
    }

    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Attempts to consume tokens from the bucket.
   * Automatically refills tokens based on elapsed time before consuming.
   *
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns true if tokens were successfully consumed, false otherwise
   */
  tryConsume(tokens: number = 1): boolean {
    if (tokens <= 0) {
      throw new Error('Token count must be greater than 0');
    }
    if (tokens > this.capacity) {
      throw new Error('Token count exceeds bucket capacity');
    }

    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refills tokens based on elapsed time since last refill.
   * Tokens are added at the configured refillRate per second.
   */
  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;

    const tokensToAdd = elapsedSeconds * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Returns the current number of available tokens (after refill).
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Resets the bucket to full capacity.
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }
}
