const VENDOR_CATEGORY_MAP: Record<string, string> = {
  // Food & Dining
  starbucks: 'Food',
  zomato: 'Food',
  swiggy: 'Food',
  dominos: 'Food',
  "domino's": 'Food',
  mcdonalds: 'Food',
  "mcdonald's": 'Food',
  kfc: 'Food',
  burgerking: 'Food',
  subway: 'Food',

  // Shopping & E-Commerce
  amazon: 'Shopping',
  myntra: 'Shopping',
  flipkart: 'Shopping',
  zara: 'Shopping',
  hm: 'Shopping',
  'h&m': 'Shopping',
  nykaa: 'Shopping',
  ajio: 'Shopping',

  // Transport & Mobility
  uber: 'Transport',
  ola: 'Transport',
  rapido: 'Transport',
  nammayatri: 'Transport',

  // Entertainment
  netflix: 'Entertainment',
  pvr: 'Entertainment',
  inox: 'Entertainment',
  bookmyshow: 'Entertainment',
  spotify: 'Entertainment',
  youtube: 'Entertainment',
  prime: 'Entertainment',

  // Groceries & Daily Needs
  bigbasket: 'Groceries',
  blinkit: 'Groceries',
  zepto: 'Groceries',
  instamart: 'Groceries',
  dunzo: 'Groceries',
};

/**
 * Returns the category for a given vendor name.
 * Defaults to 'Other' if not recognized.
 */
export function getCategoryForVendor(vendor: string): string {
  if (!vendor) return 'Other';
  const cleanVendor = vendor.toLowerCase().trim().replace(/[^a-z0-9'&]/g, '');
  return VENDOR_CATEGORY_MAP[cleanVendor] || 'Other';
}

/**
 * Normalizes vendor name to Title Case.
 */
export function titleCaseVendor(vendor: string): string {
  if (!vendor) return 'Unknown Vendor';
  return vendor
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}
