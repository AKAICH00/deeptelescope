/**
 * Calculator module with type-safe arithmetic operations
 */

/**
 * Adds two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('Invalid input: Both arguments must be finite numbers');
  }
  return a + b;
}

/**
 * Subtracts second number from first
 * @param a - Number to subtract from
 * @param b - Number to subtract
 * @returns Difference of a and b
 */
export function subtract(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('Invalid input: Both arguments must be finite numbers');
  }
  return a - b;
}

/**
 * Multiplies two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Product of a and b
 */
export function multiply(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('Invalid input: Both arguments must be finite numbers');
  }
  return a * b;
}

/**
 * Divides first number by second
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient of a divided by b
 * @throws Error if divisor is zero
 */
export function divide(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('Invalid input: Both arguments must be finite numbers');
  }
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
