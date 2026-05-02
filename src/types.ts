export interface User {
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
}

export interface UserAddress {
  id: string; // The generated doc ID
  tag: 'home' | 'work' | 'other';
  fullAddress: string;
  locationLat?: number;
  locationLng?: number;
  isDefault: boolean; // True synchronizes back to root user.address
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
  type: 'earning' | 'spending';
  source: string;
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
}

export interface BulkBooking {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;

  // Base details
  type: 'bulk' | 'function';
  peopleCount: number;

  // Meat Spec
  meatDetails: string;
  quantityRequirement: string;

  // Legacy item array (kept for backward schema safety)
  items?: BulkBookingItem[];

  // Pricing & Payments
  quotedPrice?: number;         // Set by admin dynamically
  advanceAmount?: number;       // 50% of quotedPrice
  balanceAmount?: number;       // 50% remaining
  advancePaid: boolean;         // Tracking Razorpay completion

  // Dates, Times & Locations
  requiredDate: string;
  deliveryTime: string;
  location: string;
  notes?: string;
  adminNotes?: string;

  // Status
  status: BulkBookingStatus;
  paymentStatus: BulkPaymentStatus;
  paymentMethod?: 'qr' | 'razorpay';

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
  paymentMethod: 'razorpay' | 'qr' | 'coins';
  paymentStatus: 'pending' | 'pending_verification' | 'paid' | 'failed' | 'refunded';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  utrNumber?: string;
  // ─── Order Details ────────────────────────────────────────────────
  status: 'Order Placed' | 'Order Received' | 'Packed' | 'Dispatched' | 'Delivered' | 'Cancelled';
  statusHistory: StatusUpdate[];
  address: string;
  locationLat?: number;
  locationLng?: number;
  phone: string;
  coinsUsed: number;
  discountAmount: number;
  deliveryCharge?: number;
  deliveryPartnerId?: string;
  assignedAt?: string;
  acceptedAt?: string;
  pickedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomepageContent {
  id: string;
  type: 'banner' | 'offer' | 'hero';
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
