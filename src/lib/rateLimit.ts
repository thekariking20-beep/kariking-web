// Enhanced Rate Limiter for Kari King Auth System
// Uses localStorage for client-side + Firestore for server-side persistence

// ─── OTP Send Limits ────────────────────────────────────────────
const OTP_LIMIT = 3;              // Max 3 OTP sends per window
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minute window
const OTP_BLOCK_MS = 60 * 60 * 1000;  // 1 hour block after exceeding

// ─── OTP Verify Limits ──────────────────────────────────────────
const VERIFY_LIMIT = 5;           // Max 5 verify attempts per session
const VERIFY_BLOCK_MS = 30 * 60 * 1000; // 30 min block after 5 wrong OTPs

// ─── Failed Login (Password) Limits ─────────────────────────────
const FAILED_LOGIN_LIMIT = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

// ─── Order Limits ───────────────────────────────────────────────
const ORDER_LIMIT = 5;
const ORDER_WINDOW_MS = 60 * 1000; // 1 minute

// ─── Resend Limits (per session) ────────────────────────────────
const RESEND_LIMIT = 3;           // Max 3 resends per login session

interface RateData {
  count: number;
  timestamp: number;
  blockUntil?: number;
}

const getRateData = (key: string): RateData | null => {
  try {
    const data = localStorage.getItem(`rate_limit_${key}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const setRateData = (key: string, data: RateData) => {
  localStorage.setItem(`rate_limit_${key}`, JSON.stringify(data));
};

// ─── OTP SEND Rate Limit ────────────────────────────────────────
export const checkOTPRequestLimit = (): { allowed: boolean; error: string } => {
  const key = 'otp';
  let data = getRateData(key);
  const now = Date.now();

  // Check if currently blocked
  if (data?.blockUntil && now < data.blockUntil) {
    const timeLeft = Math.ceil((data.blockUntil - now) / 60000);
    return { 
      allowed: false, 
      error: `Too many OTP requests. Blocked for ${timeLeft} min${timeLeft > 1 ? 's' : ''}.`
    };
  }

  // Reset if window expired
  if (!data || now - data.timestamp > OTP_WINDOW_MS) {
    data = { count: 1, timestamp: now };
    setRateData(key, data);
    return { allowed: true, error: '' };
  }

  // Block if limit exceeded
  if (data.count >= OTP_LIMIT) {
    data.blockUntil = now + OTP_BLOCK_MS;
    setRateData(key, data);
    return { 
      allowed: false, 
      error: 'Too many OTP requests. Please try again after 1 hour.'
    };
  }

  data.count += 1;
  setRateData(key, data);
  return { allowed: true, error: '' };
};

// ─── OTP VERIFY Attempt Limit ───────────────────────────────────
export const checkVerifyAttemptLimit = (): { allowed: boolean; error: string; attemptsLeft: number } => {
  const key = 'verify_attempts';
  let data = getRateData(key);
  const now = Date.now();

  // Check if currently blocked
  if (data?.blockUntil && now < data.blockUntil) {
    const timeLeft = Math.ceil((data.blockUntil - now) / 60000);
    return { 
      allowed: false,
      attemptsLeft: 0,
      error: `Too many wrong codes. Try again in ${timeLeft} min${timeLeft > 1 ? 's' : ''}.`
    };
  }

  // Reset if block expired
  if (data?.blockUntil && now >= data.blockUntil) {
    data = { count: 0, timestamp: now };
    setRateData(key, data);
  }

  if (!data) {
    data = { count: 0, timestamp: now };
    setRateData(key, data);
  }

  const attemptsLeft = VERIFY_LIMIT - data.count;
  if (attemptsLeft <= 0) {
    data.blockUntil = now + VERIFY_BLOCK_MS;
    setRateData(key, data);
    return {
      allowed: false,
      attemptsLeft: 0,
      error: 'Too many failed attempts. Please restart login.'
    };
  }

  return { allowed: true, error: '', attemptsLeft };
};

export const recordVerifyAttempt = (): { blocked: boolean; attemptsLeft: number; error: string } => {
  const key = 'verify_attempts';
  let data = getRateData(key);
  const now = Date.now();

  if (!data) data = { count: 0, timestamp: now };
  data.count += 1;

  const attemptsLeft = VERIFY_LIMIT - data.count;

  if (data.count >= VERIFY_LIMIT) {
    data.blockUntil = now + VERIFY_BLOCK_MS;
    setRateData(key, data);
    return {
      blocked: true,
      attemptsLeft: 0,
      error: 'Too many failed attempts. Please restart login.'
    };
  }

  setRateData(key, data);
  return { 
    blocked: false, 
    attemptsLeft, 
    error: `Incorrect OTP. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left.`
  };
};

export const clearVerifyAttempts = () => {
  localStorage.removeItem('rate_limit_verify_attempts');
};

// ─── RESEND Limit (per session) ─────────────────────────────────
export const checkResendLimit = (): { allowed: boolean; resendCount: number; error: string } => {
  const key = 'resend_count';
  let data = getRateData(key);
  const now = Date.now();

  if (!data) {
    data = { count: 0, timestamp: now };
  }

  if (data.count >= RESEND_LIMIT) {
    return {
      allowed: false,
      resendCount: data.count,
      error: `Maximum ${RESEND_LIMIT} resends reached. Please restart login.`
    };
  }

  data.count += 1;
  setRateData(key, data);
  return { allowed: true, resendCount: data.count, error: '' };
};

export const clearResendCount = () => {
  localStorage.removeItem('rate_limit_resend_count');
};

// ─── Failed Login (Password) ────────────────────────────────────
export const recordFailedLogin = (): { blocked: boolean; error: string } => {
  const key = 'login_fails';
  let data = getRateData(key);
  const now = Date.now();

  if (data && data.blockUntil && now < data.blockUntil) {
    const timeLeft = Math.ceil((data.blockUntil - now) / 60000);
    return { blocked: true, error: `Account temporarily locked. Try again in ${timeLeft} min${timeLeft > 1 ? 's' : ''}.` };
  }

  if (!data || (data.timestamp && now - data.timestamp > LOGIN_BLOCK_MS)) {
    data = { count: 1, timestamp: now };
    setRateData(key, data);
    return { blocked: false, error: '' };
  }

  data.count += 1;
  data.timestamp = now;

  if (data.count >= FAILED_LOGIN_LIMIT) {
    data.blockUntil = now + LOGIN_BLOCK_MS;
    setRateData(key, data);
    return { blocked: true, error: 'Account temporarily locked for 15 minutes due to multiple failed attempts.' };
  }

  setRateData(key, data);
  return { blocked: false, error: '' };
};

// ─── Order Rate Limit ───────────────────────────────────────────
export const checkOrderLimit = (): { allowed: boolean; error: string } => {
  const key = 'orders';
  let data = getRateData(key);
  const now = Date.now();

  if (!data || now - data.timestamp > ORDER_WINDOW_MS) {
    data = { count: 1, timestamp: now };
    setRateData(key, data);
    return { allowed: true, error: '' };
  }

  if (data.count >= ORDER_LIMIT) {
    const timeLeft = Math.ceil((data.timestamp + ORDER_WINDOW_MS - now) / 1000);
    return { 
      allowed: false, 
      error: `Order limit reached. Please wait ${timeLeft} seconds.`
    };
  }

  data.count += 1;
  setRateData(key, data);
  return { allowed: true, error: '' };
};

// ─── Clear Functions ────────────────────────────────────────────
export const clearFailedLogin = () => {
  localStorage.removeItem('rate_limit_login_fails');
};

/** Clear all auth rate-limit state (called on full session restart) */
export const clearAllAuthLimits = () => {
  clearFailedLogin();
  clearVerifyAttempts();
  clearResendCount();
};
