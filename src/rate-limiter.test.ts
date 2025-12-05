import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBucket } from './rate-limiter';

describe('TokenBucket', () => {
  describe('constructor', () => {
    it('should create a bucket with specified capacity and refill rate', () => {
      const bucket = new TokenBucket(10, 2);
      expect(bucket.capacity).toBe(10);
      expect(bucket.refillRate).toBe(2);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should throw error for capacity <= 0', () => {
      expect(() => new TokenBucket(0, 2)).toThrow('Capacity must be greater than 0');
      expect(() => new TokenBucket(-5, 2)).toThrow('Capacity must be greater than 0');
    });

    it('should throw error for refillRate <= 0', () => {
      expect(() => new TokenBucket(10, 0)).toThrow('Refill rate must be greater than 0');
      expect(() => new TokenBucket(10, -2)).toThrow('Refill rate must be greater than 0');
    });

    it('should initialize with full capacity', () => {
      const bucket = new TokenBucket(100, 5);
      expect(bucket.getAvailableTokens()).toBe(100);
    });
  });

  describe('tryConsume', () => {
    let bucket: TokenBucket;

    beforeEach(() => {
      bucket = new TokenBucket(10, 2);
    });

    it('should consume tokens when available', () => {
      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(9);
    });

    it('should consume multiple tokens at once', () => {
      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it('should return false when insufficient tokens', () => {
      bucket.tryConsume(8);
      expect(bucket.tryConsume(5)).toBe(false);
      expect(bucket.getAvailableTokens()).toBe(2); // No tokens consumed
    });

    it('should handle consuming all tokens', () => {
      expect(bucket.tryConsume(10)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(0);
      expect(bucket.tryConsume(1)).toBe(false);
    });

    it('should throw error for negative token count', () => {
      expect(() => bucket.tryConsume(-1)).toThrow('Token count must be greater than 0');
      expect(() => bucket.tryConsume(0)).toThrow('Token count must be greater than 0');
    });

    it('should throw error when requesting more tokens than capacity', () => {
      expect(() => bucket.tryConsume(11)).toThrow('Token count exceeds bucket capacity');
      expect(() => bucket.tryConsume(100)).toThrow('Token count exceeds bucket capacity');
    });

    it('should default to consuming 1 token', () => {
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(9);
    });

    it('should handle rapid successive consumption', () => {
      for (let i = 0; i < 10; i++) {
        expect(bucket.tryConsume(1)).toBe(true);
      }
      expect(bucket.getAvailableTokens()).toBe(0);
      expect(bucket.tryConsume(1)).toBe(false);
    });
  });

  describe('refill mechanics', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should refill tokens based on elapsed time', () => {
      const bucket = new TokenBucket(10, 2); // 2 tokens per second
      bucket.tryConsume(10); // Consume all tokens
      expect(bucket.getAvailableTokens()).toBe(0);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      expect(bucket.getAvailableTokens()).toBe(2);
    });

    it('should refill tokens at specified rate', () => {
      const bucket = new TokenBucket(20, 5); // 5 tokens per second
      bucket.tryConsume(20); // Empty the bucket

      // Advance by 2 seconds
      vi.advanceTimersByTime(2000);

      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should not exceed capacity when refilling', () => {
      const bucket = new TokenBucket(10, 5);
      bucket.tryConsume(5); // 5 tokens remaining

      // Advance by 2 seconds (would add 10 tokens, but capacity is 10)
      vi.advanceTimersByTime(2000);

      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should handle fractional refill correctly', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10);

      // Advance by 0.5 seconds (should add 1 token)
      vi.advanceTimersByTime(500);

      expect(bucket.getAvailableTokens()).toBe(1);
    });

    it('should refill before consumption check', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10); // Empty

      // Advance by 2 seconds (adds 4 tokens)
      vi.advanceTimersByTime(2000);

      // Should succeed because refill happens before consumption
      expect(bucket.tryConsume(4)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it('should accumulate refill over multiple time periods', () => {
      const bucket = new TokenBucket(20, 2);
      bucket.tryConsume(20);

      // Simulate multiple time advances
      vi.advanceTimersByTime(1000); // +2 tokens
      expect(bucket.getAvailableTokens()).toBe(2);

      vi.advanceTimersByTime(2000); // +4 tokens
      expect(bucket.getAvailableTokens()).toBe(6);

      vi.advanceTimersByTime(3000); // +6 tokens
      expect(bucket.getAvailableTokens()).toBe(12);
    });

    it('should handle high refill rates', () => {
      const bucket = new TokenBucket(1000, 100); // 100 tokens/sec
      bucket.tryConsume(1000);

      vi.advanceTimersByTime(5000); // 5 seconds

      expect(bucket.getAvailableTokens()).toBe(500);
    });

    it('should handle low refill rates', () => {
      const bucket = new TokenBucket(10, 0.5); // 0.5 tokens/sec
      bucket.tryConsume(10);

      vi.advanceTimersByTime(4000); // 4 seconds

      expect(bucket.getAvailableTokens()).toBe(2);
    });
  });

  describe('getAvailableTokens', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return current token count after refill', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10);

      vi.advanceTimersByTime(2000);

      expect(bucket.getAvailableTokens()).toBe(4);
    });

    it('should not modify token count when called', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(5);

      const tokens1 = bucket.getAvailableTokens();
      const tokens2 = bucket.getAvailableTokens();

      expect(tokens1).toBe(tokens2);
      expect(tokens1).toBe(5);
    });

    it('should trigger refill when called', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10);

      vi.advanceTimersByTime(3000);

      // getAvailableTokens should trigger refill
      expect(bucket.getAvailableTokens()).toBe(6);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should restore bucket to full capacity', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(7);

      bucket.reset();

      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should reset refill timer', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10);

      vi.advanceTimersByTime(2000);
      bucket.reset(); // Should reset time

      // Advance time again
      vi.advanceTimersByTime(1000);

      // Should be capacity (10) + 1 second of refill (2 tokens) - but capped at capacity
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should work on partially empty bucket', () => {
      const bucket = new TokenBucket(20, 5);
      bucket.tryConsume(15);
      expect(bucket.getAvailableTokens()).toBe(5);

      bucket.reset();

      expect(bucket.getAvailableTokens()).toBe(20);
    });

    it('should work on full bucket', () => {
      const bucket = new TokenBucket(10, 2);

      bucket.reset();

      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe('edge cases and stress tests', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle very small capacity', () => {
      const bucket = new TokenBucket(1, 0.1);
      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.tryConsume(1)).toBe(false);

      vi.advanceTimersByTime(10000); // 10 seconds = 1 token
      expect(bucket.tryConsume(1)).toBe(true);
    });

    it('should handle very large capacity', () => {
      const bucket = new TokenBucket(1000000, 1000);
      expect(bucket.tryConsume(1000000)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it('should handle consumption at capacity boundary', () => {
      const bucket = new TokenBucket(10, 2);
      expect(bucket.tryConsume(10)).toBe(true);
      expect(bucket.tryConsume(10)).toBe(false);

      // Refill to full
      vi.advanceTimersByTime(5000);
      expect(bucket.tryConsume(10)).toBe(true);
    });

    it('should handle mixed consumption patterns', () => {
      const bucket = new TokenBucket(20, 4); // 4 tokens/sec

      bucket.tryConsume(5);
      expect(bucket.getAvailableTokens()).toBe(15);

      vi.advanceTimersByTime(1000); // +4 tokens
      expect(bucket.getAvailableTokens()).toBe(19);

      bucket.tryConsume(10);
      expect(bucket.getAvailableTokens()).toBe(9);

      vi.advanceTimersByTime(2000); // +8 tokens
      expect(bucket.getAvailableTokens()).toBe(17);

      bucket.tryConsume(20); // Should fail
      expect(bucket.getAvailableTokens()).toBe(17);
    });

    it('should handle zero remaining tokens', () => {
      const bucket = new TokenBucket(5, 1);
      bucket.tryConsume(5);

      expect(bucket.getAvailableTokens()).toBe(0);
      expect(bucket.tryConsume(1)).toBe(false);

      vi.advanceTimersByTime(500);
      expect(bucket.getAvailableTokens()).toBe(0.5);
      expect(bucket.tryConsume(1)).toBe(false);

      vi.advanceTimersByTime(500);
      expect(bucket.getAvailableTokens()).toBe(1);
      expect(bucket.tryConsume(1)).toBe(true);
    });

    it('should handle decimal token values from refill', () => {
      const bucket = new TokenBucket(10, 3); // 3 tokens/sec
      bucket.tryConsume(10);

      // 1/3 second = 1 token
      vi.advanceTimersByTime(333);
      const available = bucket.getAvailableTokens();

      // Should be approximately 0.999 tokens
      expect(available).toBeCloseTo(0.999, 2);
      expect(bucket.tryConsume(1)).toBe(false);
    });

    it('should maintain precision with many small operations', () => {
      const bucket = new TokenBucket(100, 10);

      // Consume 1 token 50 times
      for (let i = 0; i < 50; i++) {
        expect(bucket.tryConsume(1)).toBe(true);
      }

      expect(bucket.getAvailableTokens()).toBe(50);

      // Refill over time
      vi.advanceTimersByTime(2500); // 2.5 seconds = 25 tokens

      expect(bucket.getAvailableTokens()).toBe(75);
    });

    it('should handle rapid consumption attempts', () => {
      const bucket = new TokenBucket(3, 1);

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(bucket.tryConsume(1));
      }

      expect(results).toEqual([true, true, true, false, false]);
    });

    it('should handle long idle periods', () => {
      const bucket = new TokenBucket(10, 2);
      bucket.tryConsume(10);

      // Wait for much longer than needed to refill
      vi.advanceTimersByTime(60000); // 60 seconds

      // Should be capped at capacity
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe('real-world scenarios', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should simulate API rate limiting (100 requests/minute)', () => {
      const bucket = new TokenBucket(100, 100 / 60); // ~1.67 tokens/sec

      // Burst of 50 requests
      for (let i = 0; i < 50; i++) {
        expect(bucket.tryConsume(1)).toBe(true);
      }
      expect(bucket.getAvailableTokens()).toBe(50);

      // Wait 30 seconds
      vi.advanceTimersByTime(30000);
      expect(bucket.getAvailableTokens()).toBe(100); // Refilled to cap

      // Another burst
      for (let i = 0; i < 100; i++) {
        expect(bucket.tryConsume(1)).toBe(true);
      }
      expect(bucket.tryConsume(1)).toBe(false);
    });

    it('should simulate database connection pooling', () => {
      const connectionPool = new TokenBucket(10, 0.5); // 10 connections, slow recovery

      // Acquire all connections
      for (let i = 0; i < 10; i++) {
        expect(connectionPool.tryConsume(1)).toBe(true);
      }

      // Try to acquire more - should fail
      expect(connectionPool.tryConsume(1)).toBe(false);

      // Release some connections over time
      vi.advanceTimersByTime(4000); // 2 connections recovered

      expect(connectionPool.tryConsume(2)).toBe(true);
      expect(connectionPool.tryConsume(1)).toBe(false);
    });

    it('should simulate bursty traffic with gradual recovery', () => {
      const bucket = new TokenBucket(50, 10); // 50 capacity, 10/sec refill

      // Initial burst
      for (let i = 0; i < 40; i++) {
        bucket.tryConsume(1);
      }
      expect(bucket.getAvailableTokens()).toBe(10);

      // Small delay
      vi.advanceTimersByTime(500); // +5 tokens
      expect(bucket.getAvailableTokens()).toBe(15);

      // Another burst
      for (let i = 0; i < 15; i++) {
        bucket.tryConsume(1);
      }
      expect(bucket.getAvailableTokens()).toBe(0);

      // Recovery period
      vi.advanceTimersByTime(3000); // +30 tokens
      expect(bucket.getAvailableTokens()).toBe(30);
    });
  });
});
