export interface User {
  id?: string;
  uid: string;
  phone: string;
  name?: string;
  email?: string;
  address?: string;
  locationLat?: number;
  locationLng?: number;
  role: 'admin' | 'manager' | 'delivery' | 'user';
  referralCode: string;
  referredBy?: string;
  coins: number;
  lockedCoins: number;
  isAvailable?: boolean;   // delivery partner online/offline toggle
  isOnline?: boolean;      // delivery partner real-time online status
  fcmToken?: string;       // Firebase Cloud Messaging push token
  selectedAddressId?: string; // Global selected address for the user
  authProvider?: 'otp' | 'password';
  profileComplete: boolean;
  // KYC & Verification
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  profilePhotoUrl?: string;
  aadharFrontUrl?: string;
  aadharBackUrl?: string;
  licenseUrl?: string;
  submittedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  notificationEnabled?: boolean;
  usedCoupons?: string[];    // coupon codes this user has redeemed
  totalCoinsEarned?: number;
  totalCoinsRedeemed?: number;
}

export interface UserAddress {
  id: string;
  name: 'Home' | 'Work' | 'Other';
  street: string;
  city: string;
  pincode: string;
  state: string;
  fullAddress: string;   // Auto-computed: `${street}, ${city} - ${pincode}`
  isDefault: boolean;
  createdAt: string;
}

export interface ProvisionedStaff {
  phone: string;           // document ID e.g. "+916380886374"
  role: 'admin' | 'manager' | 'delivery';
  status: 'pending' | 'claimed';
  passwordHash: string;    // bcrypt hash of temporary password
  mustChangePassword: boolean;
  createdAt: string;
  createdBy: string;       // admin uid who provisioned
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;       // tailwind gradient classes e.g. "from-amber-500 to-orange-500"
  image?: string;
  isActive: boolean;
  order: number;
  subCategories: { id: string; label: string; labelTamil?: string }[];
}

export interface Referral {
  id?: string;
  referrerId: string;
  referrerPhone?: string;
  referredUserId: string;
  referredUserPhone?: string;
  status: 'pending' | 'completed';
  reward: number;
  rewardGiven?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  category?: string; // legacy – kept for backwards compat, do not use for new products
  mainCategory: string;
  subCategory: string;
  type?: string;
  image: string;
  description: string;
  mrpPrice: number;
  sellingPrice: number;
  discountPercentage?: number;
  unitType?: 'kg' | 'gram' | 'piece' | 'litre';
  baseWeight?: number;
  minOrderQty?: number;
  stepSize?: number;
  isAvailable: boolean;
  isComingSoon?: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  unitType?: 'kg' | 'gram' | 'piece' | 'litre';
  baseWeight?: number;
  stepSize?: number;
  minOrderQty?: number;
}

export interface StatusUpdate {
  status: string;
  time: string;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  rupeeValue?: number;
  type: 'earning' | 'spending' | 'earned' | 'redeemed';
  source: string;
  orderId?: string;
  referralId?: string;
  multiplierApplied?: number;
  campaignId?: string;
  createdAt: string;
}

export type OrderType = 'normal' | 'bulk' | 'function';

export interface BulkDetails {
  weight: string; // e.g. "50kg" 
  expectedDate: string;
  notes?: string;
  items?: string;
}

// ─── New Bulk Booking Workflow Types ─────────────────────────────────────────

export type BulkBookingStatus = 'requested' | 'reviewed' | 'awaiting_payment' | 'confirmed' | 'delivered' | 'completed' | 'rejected' | 'cancelled';
export type BulkPaymentStatus = 'none' | 'pending' | 'paid' | 'verified';

export interface BulkBookingItem {
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;       // selling price per unit
  quantity: number;        // in kg/pieces
  unitType: 'kg' | 'gram' | 'piece';
  subtotal: number;        // unitPrice × quantity
  discount?: number;       // discount amount per line item
  lineTotal?: number;      // total after discount (unitPrice * quantity) - discount
}

export interface BulkBookingStatusHistory {
  status: string;
  changedBy: string;
  timestamp: string;
  notes?: string;
}

export interface BulkBooking {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail?: string;     // Customer email
  companyName?: string;   // Optional company name

  // Base details
  type: 'bulk' | 'function';
  peopleCount: number;

  // Meat Spec
  meatDetails: string;
  quantityRequirement: string;

  // Legacy item array (kept for backward schema safety)
  items?: BulkBookingItem[];

  // Pricing & Payments
  quotedPrice?: number;         // Set by admin dynamically (represents grandTotal)
  advanceAmount?: number;       // 50% of quotedPrice
  balanceAmount?: number;       // 50% remaining
  advancePaid: boolean;         // Tracking UPI payment completion

  // Quotation specific totals
  subtotal?: number;
  deliveryCharges?: number;
  additionalCharges?: number;
  globalDiscount?: number;      // additional discount
  grandTotal?: number;          // grand total

  // Dates, Times & Locations
  requiredDate: string;
  deliveryTime: string;
  location: string;
  notes?: string;
  adminNotes?: string;
  adminMessage?: string;       // Customer-facing message from admin (e.g. "We'll contact you shortly")
  utrNumber?: string;          // UTR from advance payment

  // Status & History
  status: BulkBookingStatus;
  paymentStatus: BulkPaymentStatus;
  paymentMethod?: 'qr' | 'cod';
  statusHistory?: BulkBookingStatusHistory[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  paidAt?: string;
  confirmedAt?: string;
  completedAt?: string;

  // Cancellation audit
  cancelReason?: string;
  cancelledBy?: 'admin' | 'user';
  cancelledAt?: string;

  // Function / Event booking optional details
  functionType?: 'Marriage' | 'Reception' | 'Birthday' | 'Temple Function' | 'Corporate Event' | 'House Function' | 'Other';
  eventAddress?: string;
  eventArea?: string;
  eventCity?: string;
  eventPincode?: string;
  eventDate?: string;
  eventTime?: string;
  deliveryDate?: string;
  adultCount?: number;
  childrenCount?: number;
  vegCount?: number;
  nonVegCount?: number;
  specialInstructions?: string;
}

export interface FunctionDetails {
  eventType: 'Wedding' | 'Party' | 'Function' | 'Custom';
  peopleCount: number;
  items: string; // List of required items
  expectedDate: string;
  location: string;
  notes?: string;
}

export interface Order {
  id: string;
  userId: string;
  type?: OrderType; // Optional for backward compatibility, defaults to 'normal'
  bulkDetails?: BulkDetails;
  functionDetails?: FunctionDetails;
  items: OrderItem[];
  totalAmount: number;        // Subtotal before discounts
  finalAmount: number;        // Final amount after coins + delivery
  // ─── Payment Architecture ──────────────────────────────────────
  paymentMethod: 'qr' | 'coins' | 'cod';
  paymentStatus: 'pending' | 'awaiting_payment' | 'under_review' | 'confirmed' | 'rejected' | 'paid' | 'failed' | 'collected';
  utrNumber?: string;
  idempotencyKey?: string;
  rejectReason?: string;
  paymentSubmittedAt?: string;
  verifiedAt?: string;
  // ─── COD Fields (backward compatible) ──────────────────────────
  isCOD?: boolean;
  codCollectedAt?: string;
  codCollectedBy?: string;
  codCollectedAmount?: number;
  // ─── Order Details ────────────────────────────────────────────────
  status: 'Order Placed' | 'Order Received' | 'Packed' | 'Dispatched' | 'Delivered' | 'Cancelled';
  statusHistory: StatusUpdate[];
  address: string;
  phone: string;
  coinsUsed: number;
  discountAmount: number;
  couponCode?: string;        // applied coupon code
  couponDiscount?: number;    // discount from coupon
  deliveryCharge?: number;
  deliveryPartnerId?: string;
  assignedAt?: string;
  acceptedAt?: string;
  pickedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
  // Reward system tracking
  coinsEarned?: number;
  coinsRedeemed?: number;
  coinsDiscountAmount?: number;
  finalPaidAmount?: number;
  pendingCoinsDeduction?: number;
}

export interface HomepageContent {
  id: string;
  type: 'banner' | 'offer' | 'hero' | 'countdown' | 'seasonal';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttonText?: string;
  redirectLink?: string;
  couponCode?: string;
  badgeLabel?: string;    // e.g. "🔥 HOT DEAL"
  badgeColor?: string;    // tailwind class e.g. "bg-red-500"
  isActive: boolean;
  order: number;
  createdAt: string;

  // Countdown timer
  countdownEnabled?: boolean;
  countdownEndTime?: string;   // ISO datetime string

  // Scheduling
  visibleFrom?: string;        // ISO datetime string
  visibleUntil?: string;       // ISO datetime string
}

export interface SystemSettings {
  id?: string;
  business: {
    storeName: string;
    storeAddress: string;
    contactNumber: string;
    contactEmail: string;
    openingHours: string;
  };
  orders: {
    minOrderAmount: number;
    deliveryFee: number;
    freeDeliveryThreshold: number;
  };
  delivery: {
    enabled: boolean;
    maxRadiusKm: number;
    autoAssign: boolean;
  };
  notifications: {
    newOrderAlerts: boolean;
    deliveryUpdates: boolean;
    kycRequests: boolean;
  };
  security: {
    requireOtp: boolean;
  };
  updatedAt: string;
}

// ─── Coupon System ─────────────────────────────────────────────────────────
export interface Coupon {
  id: string;
  code: string;
  
  // New Scalable Schema
  title?: string;
  description?: string;
  type?: 'flat' | 'percentage';
  minimumOrderAmount?: number;
  maxDiscountAmount?: number;
  perUserLimit?: number;
  expiresAt?: string;
  
  // Legacy fields (maintained for backwards compatibility)
  discountType?: 'flat' | 'percentage';
  discountValue: number;      // ₹ amount or %
  minOrder?: number;           // minimum subtotal to apply
  maxDiscount?: number;        // cap for percentage coupons
  usageLimit?: number;         // per-user limit (1 = one-time)
  totalUsageLimit?: number;    // global limit across all users
  usedCount: number;          // current global usage
  isActive: boolean;
  validFrom?: string;          // ISO date
  validTill?: string;          // ISO date
  forNewUsers: boolean;       // first-order only
  createdAt: string;
}

// ─── Double Coins Event System ───────────────────────────────────────────────
export interface RewardCampaign {
  id?: string;
  title: string;
  multiplier: number;
  isActive: boolean;
  startsAt: string; // ISO string
  endsAt: string;   // ISO string
  description: string;
  createdAt: string;
}

// ─── Coin Withdrawal System ──────────────────────────────────────────────────
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  upiId: string;
  accountName: string;
  coinsRequested: number;
  amountRequested: number; // coinsRequested * COIN_VALUE
  status: WithdrawalStatus;
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  paidAt?: string;
  approvedBy?: string;
  remarks?: string;
}

export interface WithdrawalTransaction {
  id: string;
  userId: string;
  type: 'lock' | 'unlock' | 'deduct';
  coins: number;
  beforeBalance: number;
  afterBalance: number;
  beforeLocked: number;
  afterLocked: number;
  referenceId: string; // withdrawal request ID
  adminUid?: string;
  timestamp: string;
}
