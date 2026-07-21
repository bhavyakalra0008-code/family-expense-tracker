import { getCategoryForVendor, titleCaseVendor } from './vendorCategoryService.js';

export interface SmsParseResult {
  success: boolean;
  reason?: string;
  amount?: number;
  last4?: string;
  vendor?: string;
  category?: string;
}

/**
 * Pure, standalone, unit-testable SMS parser function.
 * Parses raw bank SMS text looking for debit transactions, amounts, account last 4 digits, and vendors.
 */
export function parseSmsText(smsText: string): SmsParseResult {
  if (!smsText || typeof smsText !== 'string' || smsText.trim() === '') {
    return {
      success: false,
      reason: 'SMS text is empty or invalid.',
    };
  }

  const lowered = smsText.toLowerCase();

  // 1. Check for "debited" keyword (case-insensitive)
  if (!lowered.includes('debited')) {
    return {
      success: false,
      reason: 'Message doesn\'t contain the word "debited" — ignored as non-debit SMS.',
    };
  }

  // 2. Extract Amount: matches "Rs 500", "Rs. 500.00", "INR 899.00", "Rs 1,500.50", etc.
  const amountMatch = smsText.match(/(?:rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) {
    return {
      success: false,
      reason: 'Could not detect a rupee amount in the message.',
    };
  }
  const rawAmountStr = amountMatch[1].replace(/,/g, '');
  const amount = parseFloat(rawAmountStr);
  if (isNaN(amount) || amount <= 0) {
    return {
      success: false,
      reason: 'Could not detect a valid positive rupee amount in the message.',
    };
  }

  // 3. Extract Last 4 Digits: matches "**1234", "XX1234", "xx1234", "a/c 1234"
  const last4Match = smsText.match(/(?:\*{2}|xx|x{2}|a\/c\s*)(\d{4})\b/i);
  if (!last4Match) {
    return {
      success: false,
      reason: 'Could not detect an account number in the message.',
    };
  }
  const last4 = last4Match[1];

  // 4. Extract Vendor: text following "at" or "towards", up to "on", period, or end of string
  const vendorMatch = smsText.match(/(?:at|towards)\s+([a-z0-9'&.\s]+?)(?:\s+on\s|\.|$)/i);
  const rawVendor = vendorMatch ? vendorMatch[1].trim() : 'Unknown Vendor';
  const vendor = titleCaseVendor(rawVendor);
  const category = getCategoryForVendor(vendor);

  return {
    success: true,
    amount,
    last4,
    vendor,
    category,
  };
}
