import { describe, it, expect } from 'vitest';
import { parseSmsText } from '../src/services/smsParser.js';

describe('SMS Parser Unit Tests', () => {
  it('should successfully parse a standard debit SMS (**1234 format)', () => {
    const text = 'Rs 500 debited from a/c **1234 at Starbucks on 20-07-26';
    const result = parseSmsText(text);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(500);
    expect(result.last4).toBe('1234');
    expect(result.vendor).toBe('Starbucks');
    expect(result.category).toBe('Food');
  });

  it('should successfully parse INR format with decimals and XX5678 account format', () => {
    const text = 'INR 899.00 debited from your account XX5678 towards AMAZON on 20-07-26. Avl bal Rs 4,201';
    const result = parseSmsText(text);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(899);
    expect(result.last4).toBe('5678');
    expect(result.vendor).toBe('Amazon');
    expect(result.category).toBe('Shopping');
  });

  it('should handle amounts with commas like Rs 1,500.50', () => {
    const text = 'Rs 1,500.50 debited from a/c xx9012 towards Uber on 15-07-26';
    const result = parseSmsText(text);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(1500.5);
    expect(result.last4).toBe('9012');
    expect(result.vendor).toBe('Uber');
    expect(result.category).toBe('Transport');
  });

  it('should reject SMS missing the word "debited"', () => {
    const text = 'Rs 500 credited to a/c **1234 at Starbucks on 20-07-26';
    const result = parseSmsText(text);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('doesn\'t contain the word "debited"');
  });

  it('should reject SMS missing rupee amount', () => {
    const text = 'Your account **1234 was debited at Starbucks on 20-07-26';
    const result = parseSmsText(text);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Could not detect a rupee amount');
  });

  it('should reject SMS missing account last 4 digits', () => {
    const text = 'Rs 500 debited at Starbucks on 20-07-26';
    const result = parseSmsText(text);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Could not detect an account number');
  });

  it('should handle messy extra whitespace and case variations gracefully', () => {
    const text = '   rs.  1200   DEBITED   from   a/c   **5678   at   Swiggy   on 21-07-26   ';
    const result = parseSmsText(text);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(1200);
    expect(result.last4).toBe('5678');
    expect(result.vendor).toBe('Swiggy');
    expect(result.category).toBe('Food');
  });

  it('should parse first valid debit amount when multiple keywords/balances exist', () => {
    const text = 'Alert: Rs 450 debited from a/c **1234 at Starbucks. Previous debited amount Rs 200. Avl Bal Rs 5000';
    const result = parseSmsText(text);

    expect(result.success).toBe(true);
    expect(result.amount).toBe(450);
    expect(result.last4).toBe('1234');
    expect(result.vendor).toBe('Starbucks');
  });
});
