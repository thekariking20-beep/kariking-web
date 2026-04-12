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
  referredUserId: string;
  referredUserPhone?: string;
  status: 'pending' | 'completed';
  reward: number;
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
  unitType?: 'kg' | 'gram' | 'piece';
  baseWeight?: number;
  minOrderQty?: number;
  stepSize?: number;
  isAvailable: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  unitType?: 'kg' | 'gram' | 'piece';
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
