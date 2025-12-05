import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide } from './calculator';

describe('Calculator Operations', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add two negative numbers', () => {
      expect(add(-2, -3)).toBe(-5);
    });

    it('should add positive and negative numbers', () => {
      expect(add(5, -3)).toBe(2);
      expect(add(-5, 3)).toBe(-2);
    });

    it('should add decimal numbers', () => {
      expect(add(2.5, 3.7)).toBeCloseTo(6.2);
    });

    it('should handle zero', () => {
      expect(add(0, 5)).toBe(5);
      expect(add(5, 0)).toBe(5);
      expect(add(0, 0)).toBe(0);
    });
  });

  describe('subtract', () => {
    it('should subtract two positive numbers', () => {
      expect(subtract(5, 3)).toBe(2);
    });

    it('should subtract two negative numbers', () => {
      expect(subtract(-5, -3)).toBe(-2);
    });

    it('should subtract negative from positive', () => {
      expect(subtract(5, -3)).toBe(8);
    });

    it('should subtract positive from negative', () => {
      expect(subtract(-5, 3)).toBe(-8);
    });

    it('should subtract decimal numbers', () => {
      expect(subtract(5.5, 2.3)).toBeCloseTo(3.2);
    });

    it('should handle zero', () => {
      expect(subtract(5, 0)).toBe(5);
      expect(subtract(0, 5)).toBe(-5);
      expect(subtract(0, 0)).toBe(0);
    });
  });

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(multiply(3, 4)).toBe(12);
    });

    it('should multiply two negative numbers', () => {
      expect(multiply(-3, -4)).toBe(12);
    });

    it('should multiply positive and negative numbers', () => {
      expect(multiply(3, -4)).toBe(-12);
      expect(multiply(-3, 4)).toBe(-12);
    });

    it('should multiply decimal numbers', () => {
      expect(multiply(2.5, 4)).toBeCloseTo(10);
      expect(multiply(2.5, 2.5)).toBeCloseTo(6.25);
    });

    it('should handle zero', () => {
      expect(multiply(5, 0)).toBe(0);
      expect(multiply(0, 5)).toBe(0);
      expect(multiply(0, 0)).toBe(0);
    });

    it('should handle multiplication by one', () => {
      expect(multiply(5, 1)).toBe(5);
      expect(multiply(1, 5)).toBe(5);
    });
  });

  describe('divide', () => {
    it('should divide two positive numbers', () => {
      expect(divide(12, 3)).toBe(4);
    });

    it('should divide two negative numbers', () => {
      expect(divide(-12, -3)).toBe(4);
    });

    it('should divide positive by negative', () => {
      expect(divide(12, -3)).toBe(-4);
    });

    it('should divide negative by positive', () => {
      expect(divide(-12, 3)).toBe(-4);
    });

    it('should divide decimal numbers', () => {
      expect(divide(5.5, 2)).toBeCloseTo(2.75);
      expect(divide(10, 2.5)).toBeCloseTo(4);
    });

    it('should handle division by one', () => {
      expect(divide(5, 1)).toBe(5);
      expect(divide(-5, 1)).toBe(-5);
    });

    it('should handle zero dividend', () => {
      expect(divide(0, 5)).toBe(0);
    });

    it('should throw error on division by zero', () => {
      expect(() => divide(5, 0)).toThrow('Division by zero');
    });

    it('should throw error when dividing zero by zero', () => {
      expect(() => divide(0, 0)).toThrow('Division by zero');
    });

    it('should handle very small divisors', () => {
      expect(divide(1, 0.1)).toBeCloseTo(10);
      expect(divide(1, 0.01)).toBeCloseTo(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large numbers', () => {
      expect(add(1e10, 1e10)).toBe(2e10);
      expect(multiply(1e5, 1e5)).toBe(1e10);
    });

    it('should handle very small numbers', () => {
      expect(add(0.0001, 0.0002)).toBeCloseTo(0.0003);
      expect(multiply(0.1, 0.1)).toBeCloseTo(0.01);
    });

    it('should handle floating point precision', () => {
      expect(add(0.1, 0.2)).toBeCloseTo(0.3);
      expect(subtract(0.3, 0.1)).toBeCloseTo(0.2);
    });
  });
});
