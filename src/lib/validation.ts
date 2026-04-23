// ─── Kari King Input Validation & Sanitization Engine ─────────────────────────
// Prevents junk data, enforces clean inputs, and ensures backend integrity.

// ─── Sanitizers ───────────────────────────────────────────────────────────────

/** Trim and collapse whitespace */
export function sanitizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/** Remove dangerous chars but keep commas, periods, hyphens, parentheses */
export function sanitizeAddress(input: string): string {
  return sanitizeText(input).replace(/[^a-zA-Z0-9\s,.\-\/()#&:]/g, '');
}

/** Remove anything that isn't alphanumeric, spaces, commas, periods, parentheses */
export function sanitizeMeatDetails(input: string): string {
  return sanitizeText(input).replace(/[^a-zA-Z0-9\s,.\-\/()]/g, '');
}

// ─── Junk Detection ──────────────────────────────────────────────────────────

/** 
 * Detects gibberish / keyboard-mash input.
 * Checks for: too many consonants in a row, no vowels in long words,
 * repeated characters, and numbers-only strings.
 */
function isGibberish(text: string): boolean {
  const cleaned = text.replace(/[^a-zA-Z\s]/g, '').trim();
  if (!cleaned) return true;

  // Pure numbers check (like "01052026None01052026")
  const numbersOnly = text.replace(/[^0-9]/g, '');
  if (numbersOnly.length > text.replace(/\s/g, '').length * 0.7) return true;

  const words = cleaned.split(/\s+/);
  const longWords = words.filter(w => w.length >= 4);

  // If all long words lack vowels, it's gibberish
  if (longWords.length > 0) {
    const vowelless = longWords.filter(w => !/[aeiouAEIOU]/.test(w));
    if (vowelless.length === longWords.length) return true;
  }

  // Check for excessive consecutive consonants (5+ in a row)
  if (/[^aeiouAEIOU\s]{5,}/.test(cleaned)) return true;

  // Check for repeated character patterns like "aaaa" or "ababab"
  if (/(.)\1{3,}/.test(cleaned)) return true;

  return false;
}

// ─── Field Validators ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error: string;
}

const OK: ValidationResult = { valid: true, error: '' };

export function validatePeopleCount(count: number): ValidationResult {
  if (!count || isNaN(count)) return { valid: false, error: 'Please enter number of people' };
  if (count < 1) return { valid: false, error: 'Minimum 1 person required' };
  if (count > 5000) return { valid: false, error: 'Maximum 5000 people allowed' };
  return OK;
}

export function validateQuantity(qty: string): ValidationResult {
  const cleaned = sanitizeText(qty);
  if (!cleaned) return { valid: false, error: 'Enter target quantity (e.g. 20 kg)' };
  if (cleaned.length < 2) return { valid: false, error: 'Quantity too short' };
  // Must contain at least one number
  if (!/\d/.test(cleaned)) return { valid: false, error: 'Include a number (e.g. 20 kg, 50 pieces)' };
  return OK;
}

export function validateMeatDetails(details: string): ValidationResult {
  const cleaned = sanitizeMeatDetails(details);
  if (!cleaned) return { valid: false, error: 'Describe your meat requirements' };
  if (cleaned.length < 5) return { valid: false, error: 'Too short — describe the meat type and cut needed' };
  if (isGibberish(cleaned)) return { valid: false, error: 'Please enter a valid meat description (e.g. "Country chicken curry cut")' };

  // Block cooked food requests
  const blocked = ['biryani', 'chicken 65', 'chicken65', 'fried rice', 'gravy', 'curry ready', 'cooked'];
  const lower = cleaned.toLowerCase();
  for (const term of blocked) {
    if (lower.includes(term)) {
      return { valid: false, error: 'We supply raw meat only — no cooked food items' };
    }
  }
  return OK;
}

export function validateDeliveryDate(dateStr: string): ValidationResult {
  if (!dateStr) return { valid: false, error: 'Select a delivery date' };
  const selected = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selected < today) return { valid: false, error: 'Date must be today or later' };
  // Don't allow dates more than 6 months out
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  if (selected > maxDate) return { valid: false, error: 'Date cannot be more than 6 months ahead' };
  return OK;
}

export function validateDeliveryTime(time: string): ValidationResult {
  if (!time) return { valid: false, error: 'Select a delivery time' };
  // HH:MM format check
  if (!/^\d{2}:\d{2}$/.test(time)) return { valid: false, error: 'Invalid time format' };
  return OK;
}

export function validateAddress(address: string): ValidationResult {
  const cleaned = sanitizeAddress(address);
  if (!cleaned) return { valid: false, error: 'Enter delivery address' };
  if (cleaned.length < 10) return { valid: false, error: 'Address too short — include area, city (min 10 chars)' };
  if (isGibberish(cleaned)) return { valid: false, error: 'Enter a valid address (e.g. "Wisework, Bangalore, Karnataka")' };
  // Must contain at least 2 word-like segments (area + city)
  const segments = cleaned.split(/[,\s]+/).filter(s => s.length >= 2);
  if (segments.length < 2) return { valid: false, error: 'Include area and city (e.g. "Anna Nagar, Chennai")' };
  return OK;
}

// ─── Full Form Validator ─────────────────────────────────────────────────────

export interface BookingFormData {
  type: 'bulk' | 'function';
  peopleCount: number;
  meatDetails: string;
  quantityRequirement: string;
  requiredDate: string;
  deliveryTime: string;
  location: string;
  notes: string;
}

export interface FormErrors {
  peopleCount?: string;
  meatDetails?: string;
  quantityRequirement?: string;
  requiredDate?: string;
  deliveryTime?: string;
  location?: string;
}

export function validateBookingForm(data: BookingFormData): { valid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};

  const pc = validatePeopleCount(data.peopleCount);
  if (!pc.valid) errors.peopleCount = pc.error;

  const md = validateMeatDetails(data.meatDetails);
  if (!md.valid) errors.meatDetails = md.error;

  const qty = validateQuantity(data.quantityRequirement);
  if (!qty.valid) errors.quantityRequirement = qty.error;

  const dd = validateDeliveryDate(data.requiredDate);
  if (!dd.valid) errors.requiredDate = dd.error;

  const dt = validateDeliveryTime(data.deliveryTime);
  if (!dt.valid) errors.deliveryTime = dt.error;

  const addr = validateAddress(data.location);
  if (!addr.valid) errors.location = addr.error;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Sanitize all form fields before submission */
export function sanitizeBookingForm(data: BookingFormData): BookingFormData {
  return {
    ...data,
    meatDetails: sanitizeMeatDetails(data.meatDetails),
    quantityRequirement: sanitizeText(data.quantityRequirement),
    location: sanitizeAddress(data.location),
    notes: sanitizeText(data.notes || ''),
  };
}
