const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const db = getFirestore();

// ─── Constants ────────────────────────────────────────────────────────────────
const COIN_VALUE = 20; // 1 coin = ₹20
const COIN_CAP_PERCENT = 0.20; // Max 20% of subtotal payable via coins

// ─── Payment Audit Logger ─────────────────────────────────────────────────────
async function logPaymentEvent(orderId, event, details = {}) {
  try {
    await db.collection("paymentLogs").add({
      orderId,
      event,
      ...details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Payment log write failed:", e);
  }
}

// ─── Order Status Notification Templates ──────────────────────────────────────
function getNotification(status, orderId) {
  const id = orderId ? ` #${orderId.slice(-6).toUpperCase()}` : "";

  const templates = {
    "Order Placed": {
      title: "🛒 Order Confirmed!",
      body: `Your order${id} has been received`,
    },
    "Order Received": {
      title: "✅ Order Accepted",
      body: `We're preparing your order${id}`,
    },
    Packed: {
      title: "📦 Order Packed",
      body: `Your order${id} is ready for pickup`,
    },
    Dispatched: {
      title: "🚚 Out for Delivery",
      body: `Your order${id} is on the way!`,
    },
    Delivered: {
      title: "🎉 Order Delivered",
      body: `Your order${id} has been delivered. Enjoy!`,
    },
    Cancelled: {
      title: "❌ Order Cancelled",
      body: `Your order${id} has been cancelled`,
    },
  };

  return templates[status] || { title: "📋 Order Update", body: `Status: ${status}` };
}

// ─── Cloud Function: Trigger on Order Status Change ───────────────────────────
exports.onOrderStatusChange = onDocumentUpdated("orders/{orderId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const orderId = event.params.orderId;

  // Only trigger if status actually changed
  if (before.status === after.status) return null;

  console.log(`📦 Order ${orderId}: ${before.status} → ${after.status}`);

  // Log status transition
  await logPaymentEvent(orderId, "status_change", {
    from: before.status,
    to: after.status,
    paymentStatus: after.paymentStatus,
  });

  // 1. Notify the customer
  try {
    const userDoc = await db.doc(`users/${after.userId}`).get();
    if (userDoc.exists) {
      const fcmToken = userDoc.data().fcmToken;
      if (fcmToken) {
        const notification = getNotification(after.status, orderId);
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            orderId: orderId,
            status: after.status,
            type: "order_update",
          },
          webpush: {
            fcmOptions: {
              link: "/orders",
            },
          },
        });
        console.log(`✅ Notification sent to user ${after.userId}`);
      }
    }
  } catch (err) {
    console.error("Error sending customer notification:", err);
  }

  // 2. Notify the delivery partner when assigned
  if (after.status === "Dispatched" && after.deliveryPartnerId) {
    try {
      const partnerDoc = await db.doc(`users/${after.deliveryPartnerId}`).get();
      if (partnerDoc.exists) {
        const partnerToken = partnerDoc.data().fcmToken;
        if (partnerToken) {
          await getMessaging().send({
            token: partnerToken,
            notification: {
              title: "📦 New Delivery Assigned",
              body: `Order${orderId ? ` #${orderId.slice(-6).toUpperCase()}` : ""} is ready for pickup`,
            },
            data: {
              orderId: orderId,
              type: "delivery_assignment",
            },
          });
          console.log(`✅ Notification sent to delivery partner ${after.deliveryPartnerId}`);
        }
      }
    } catch (err) {
      console.error("Error sending delivery notification:", err);
    }
  }

  // 3. Notify admin on new orders
  if (after.status === "Order Placed") {
    try {
      const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
      const tokens = [];
      adminsSnap.forEach((doc) => {
        const token = doc.data().fcmToken;
        if (token) tokens.push(token);
      });

      if (tokens.length > 0) {
        const payLabels = { qr: "UPI QR", coins: "Coins" };
        const payLabel = payLabels[after.paymentMethod] || after.paymentMethod;
        const messages = tokens.map((token) => ({
          token,
          notification: {
            title: "🔔 New Order!",
            body: `₹${after.finalAmount || after.totalAmount} via ${payLabel}`,
          },
          data: {
            orderId: orderId,
            type: "new_order",
          },
        }));

        await Promise.all(messages.map((msg) => getMessaging().send(msg)));
        console.log(`✅ Admin notifications sent (${tokens.length} admins)`);
      }
    } catch (err) {
      console.error("Error sending admin notification:", err);
    }
  }

  // 4. Handle delivery completion
  if (after.status === "Delivered") {

    // 5. Check if we need to unlock referral coins (first order delivered)
    try {
      const userRef = db.doc(`users/${after.userId}`);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.referredBy) {
          // Verify if this is truly the FIRST delivered order
          const previousOrders = await db.collection("orders")
            .where("userId", "==", after.userId)
            .where("status", "==", "Delivered")
            .get();

          // if it's 1, it's this current order.
          if (previousOrders.size === 1) {
            // Find referrer
            const referrersQuery = await db.collection("users").where("referralCode", "==", userData.referredBy).get();
            if (!referrersQuery.empty) {
              const referrerDoc = referrersQuery.docs[0];
              // Convert lockedCoins to coins
              // We'll just add 5 coins and remove 5 lockedCoins.
              await referrerDoc.ref.update({
                coins: FieldValue.increment(5),
                lockedCoins: FieldValue.increment(-5)
              });

              // Mark referral as completed
              const referralRecords = await db.collection("referrals")
                .where("referredUserId", "==", after.userId)
                .where("status", "==", "pending")
                .get();

              referralRecords.forEach(async (doc) => {
                await doc.ref.update({ status: "completed", completedAt: new Date().toISOString() });
              });

              // Notify Referrer
              const refToken = referrerDoc.data().fcmToken;
              if (refToken) {
                await getMessaging().send({
                  token: refToken,
                  notification: {
                    title: "🎁 Referral Bonus Unlocked!",
                    body: `Your friend received their first order! You earned 5 coins.`,
                  }
                }).catch(() => {});
              }
              console.log(`🎁 Referral bonus unlocked for referrer ${referrerDoc.id}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error processing referral unlock:", err);
    }
  }

  return null;
});

// ─── Cloud Function: Create Order (Server-Side Pricing + Idempotency + Transactions) ─────────
exports.createOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in to order.");
  }

  const { items, address, phone, useCoins, paymentMethod, deliveryFee, coinsToUse: requestedCoins, idempotencyKey, couponCode } = request.data;
  
  if (!items || !items.length || !address || !phone) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const userId = request.auth.uid;

  // ─── Idempotency Check: prevent duplicate orders on network retries ───────
  if (idempotencyKey) {
    const existingOrders = await db.collection("orders")
      .where("userId", "==", userId)
      .where("idempotencyKey", "==", idempotencyKey)
      .limit(1)
      .get();

    if (!existingOrders.empty) {
      const existingOrder = existingOrders.docs[0];
      const existingData = existingOrder.data();
      console.log(`♻️ Idempotent hit: reusing order ${existingOrder.id}`);
      return {
        success: true,
        orderId: existingOrder.id,
        finalAmount: existingData.finalAmount
      };
    }
  }

  let totalPrice = 0;
  let validatedItems = [];

  // Calculate true total from Database pricing
  // This prevents malicious frontend clients from spoofing prices.
  for (const item of items) {
    const productDoc = await db.doc(`products/${item.productId}`).get();
    if (!productDoc.exists) {
      throw new HttpsError("failed-precondition", `Product ${item.productId} not found.`);
    }
    const product = productDoc.data();
    
    const baseWeight = product.baseWeight || 1;
    const priceRatio = item.quantity / baseWeight;
    const itemTotal = product.sellingPrice * priceRatio;
    
    totalPrice += itemTotal;
    
    validatedItems.push({
      productId: item.productId,
      name: product.name,
      sellingPrice: product.sellingPrice,
      quantity: item.quantity,
      unitType: product.unitType || 'piece',
      baseWeight: product.baseWeight || 1,
      stepSize: product.stepSize || 1,
      minOrderQty: product.minOrderQty || 1
    });
  }

  // ─── Server-side Coupon Validation & Atomic Usage Tracking ──────────────
  let couponDiscount = 0;
  let appliedCouponId = null;
  let appliedCouponCode = null;

  if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
    const upperCode = couponCode.trim().toUpperCase();

    // Find coupon
    const couponSnap = await db.collection("coupons")
      .where("code", "==", upperCode)
      .limit(1)
      .get();

    if (!couponSnap.empty) {
      const couponDoc = couponSnap.docs[0];
      const coupon = couponDoc.data();

      // Validate coupon in a transaction to prevent race conditions on usedCount
      const couponResult = await db.runTransaction(async (transaction) => {
        const freshCoupon = (await transaction.get(couponDoc.ref)).data();
        if (!freshCoupon) return { valid: false };
        if (!freshCoupon.isActive) return { valid: false };

        const now = new Date();
        if (freshCoupon.validTill && new Date(freshCoupon.validTill) < now) return { valid: false };
        if (freshCoupon.validFrom && new Date(freshCoupon.validFrom) > now) return { valid: false };
        if (totalPrice < freshCoupon.minOrder) return { valid: false };
        if (freshCoupon.totalUsageLimit > 0 && freshCoupon.usedCount >= freshCoupon.totalUsageLimit) return { valid: false };

        // Calculate discount
        let disc = 0;
        if (freshCoupon.discountType === 'flat') {
          disc = freshCoupon.discountValue;
        } else if (freshCoupon.discountType === 'percentage') {
          disc = Math.round((totalPrice * freshCoupon.discountValue) / 100);
          if (freshCoupon.maxDiscount > 0 && disc > freshCoupon.maxDiscount) {
            disc = freshCoupon.maxDiscount;
          }
        }
        disc = Math.min(disc, totalPrice);

        // Atomically increment usage count
        transaction.update(couponDoc.ref, { usedCount: FieldValue.increment(1) });

        return { valid: true, discount: disc };
      });

      if (couponResult.valid) {
        couponDiscount = couponResult.discount;
        appliedCouponId = couponDoc.id;
        appliedCouponCode = upperCode;
      }
    }
  }

  const subtotalAfterCoupon = Math.max(0, totalPrice - couponDiscount);

  // ─── Handle coins — ATOMIC via Firestore Transaction ──────────────────
  let discountAmount = couponDiscount;
  let coinsUsed = 0;

  if (useCoins && paymentMethod !== 'qr') {
    // Coins-only or coins + coupon: deduct atomically inside a transaction
    const coinResult = await db.runTransaction(async (transaction) => {
      const userRef = db.doc(`users/${userId}`);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

      const userData = userSnap.data();
      const availableCoins = userData.coins || 0;
      if (availableCoins <= 0) return { coinsUsed: 0, coinDiscount: 0 };

      // Enforce 20% cap on subtotal after coupon
      const maxCoinValue = Math.floor(subtotalAfterCoupon * COIN_CAP_PERCENT);
      const maxCoinsByValue = Math.floor(maxCoinValue / COIN_VALUE);
      const maxCoinsByBalance = availableCoins;
      const maxCoins = Math.min(maxCoinsByBalance, maxCoinsByValue);

      const actualCoins = requestedCoins ? Math.min(requestedCoins, maxCoins) : maxCoins;
      if (actualCoins <= 0) return { coinsUsed: 0, coinDiscount: 0 };

      const coinDiscount = actualCoins * COIN_VALUE;

      // Atomically deduct coins
      transaction.update(userRef, { coins: FieldValue.increment(-actualCoins) });

      return { coinsUsed: actualCoins, coinDiscount };
    });

    coinsUsed = coinResult.coinsUsed;
    discountAmount += coinResult.coinDiscount;

    // Log coin transaction (outside main transaction for non-blocking)
    if (coinsUsed > 0) {
      await db.collection("coinTransactions").add({
        userId,
        amount: coinsUsed,
        type: "spending",
        source: "Order Discount",
        createdAt: new Date().toISOString()
      });
    }
  } else if (useCoins && paymentMethod === 'qr') {
    // QR flow: calculate coins but DON'T deduct yet — deduct on admin approval
    const userDoc = await db.doc(`users/${userId}`).get();
    const availableCoins = (userDoc.exists && userDoc.data().coins) || 0;
    if (availableCoins > 0) {
      const maxCoinValue = Math.floor(subtotalAfterCoupon * COIN_CAP_PERCENT);
      const maxCoinsByValue = Math.floor(maxCoinValue / COIN_VALUE);
      const maxCoins = Math.min(availableCoins, maxCoinsByValue);
      coinsUsed = requestedCoins ? Math.min(requestedCoins, maxCoins) : maxCoins;
      discountAmount += coinsUsed * COIN_VALUE;
    }
  }

  // Track coupon in user's usedCoupons array
  if (appliedCouponCode) {
    await db.doc(`users/${userId}`).update({
      usedCoupons: FieldValue.arrayUnion(appliedCouponCode)
    });
  }

  const finalAmount = Math.max(0, totalPrice - discountAmount) + (deliveryFee || 0);
  const now = new Date().toISOString();

  // ─── Status Machine ─────────────────────────────────────────────────────
  let paymentStatus = 'pending';
  if (paymentMethod === 'coins' && finalAmount <= 0) {
    paymentStatus = 'paid';
  } else if (paymentMethod === 'qr') {
    paymentStatus = 'awaiting_payment';
  }

  const orderData = {
    userId,
    items: validatedItems,
    totalAmount: totalPrice,
    finalAmount: Math.max(0, finalAmount),
    paymentMethod,
    paymentStatus,
    status: "Order Placed",
    statusHistory: [{ status: "Order Placed", time: now }],
    address,
    phone,
    coinsUsed,
    pendingCoinsDeduction: paymentMethod === 'qr' ? coinsUsed : 0,
    couponCode: appliedCouponCode || null,
    couponDiscount: couponDiscount,
    discountAmount,
    deliveryCharge: deliveryFee || 0,
    utrNumber: null,
    idempotencyKey: idempotencyKey || null,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection("orders").add(orderData);
  
  // ─── Payment Audit Log ──────────────────────────────────────────────────
  await logPaymentEvent(docRef.id, "order_created", {
    userId,
    paymentMethod,
    paymentStatus,
    totalAmount: totalPrice,
    couponDiscount,
    coinsUsed,
    finalAmount,
  });

  console.log(`[EVENT: orderCreated] Order ${docRef.id} successfully created. Status: ${paymentStatus}`);
  if (paymentMethod === 'qr') {
    console.log(`[EVENT: paymentStarted] Payment flow initiated for order ${docRef.id} via UPI QR.`);
  }

  return { 
    success: true, 
    orderId: docRef.id,
    finalAmount 
  };
});

// ─── Cloud Function: Submit UTR (User-Side, Server-Validated) ─────────────────
exports.submitUtr = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const { orderId, utrNumber } = request.data;
  if (!orderId || !utrNumber) {
    throw new HttpsError("invalid-argument", "Missing orderId or utrNumber.");
  }

  // ─── UTR Validation (flexible: supports 10-22 char alphanumeric) ─────────
  const trimmedUtr = utrNumber.trim().replace(/\s/g, "");
  if (!/^[a-zA-Z0-9]{10,22}$/.test(trimmedUtr)) {
    throw new HttpsError("invalid-argument", "UTR must be 10-22 alphanumeric characters.");
  }

  // ─── Verify order belongs to this user ──────────────────────────────────
  const orderRef = db.doc(`orders/${orderId}`);
  const orderDoc = await orderRef.get();
  if (!orderDoc.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = orderDoc.data();
  if (order.userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "This is not your order.");
  }

  // Only allow UTR submission for orders in awaiting_payment or rejected state
  if (!['awaiting_payment', 'rejected'].includes(order.paymentStatus)) {
    throw new HttpsError("failed-precondition", `Cannot submit UTR for order in '${order.paymentStatus}' state.`);
  }

  // ─── Global UTR Uniqueness Check ───────────────────────────────────────
  const duplicateCheck = await db.collection("orders")
    .where("utrNumber", "==", trimmedUtr)
    .limit(1)
    .get();

  if (!duplicateCheck.empty) {
    const existingOrderId = duplicateCheck.docs[0].id;
    // Allow re-submitting same UTR to same order (idempotent)
    if (existingOrderId !== orderId) {
      throw new HttpsError("already-exists", "This UTR has already been used for another order.");
    }
  }

  // ─── Update order: awaiting_payment → under_review ─────────────────────
  const now = new Date().toISOString();
  await orderRef.update({
    utrNumber: trimmedUtr,
    paymentStatus: "under_review",
    paymentSubmittedAt: now,
    updatedAt: now,
  });

  // ─── Payment Audit Log ──────────────────────────────────────────────────
  await logPaymentEvent(orderId, "utr_submitted", {
    userId: request.auth.uid,
    utrNumber: trimmedUtr,
    amount: order.finalAmount,
  });

  console.log(`[EVENT: utrSubmitted] UTR ${trimmedUtr} submitted for order ${orderId}`);

  // Notify admins
  try {
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const tokens = [];
    adminsSnap.forEach((doc) => {
      const token = doc.data().fcmToken;
      if (token) tokens.push(token);
    });

    if (tokens.length > 0) {
      const messages = tokens.map((token) => ({
        token,
        notification: {
          title: "💰 UTR Submitted — Verify Payment",
          body: `Order #${orderId.slice(-6).toUpperCase()} | UTR: ${trimmedUtr} | ₹${order.finalAmount}`,
        },
        data: { orderId, type: "utr_submitted" },
      }));
      await Promise.all(messages.map((msg) => getMessaging().send(msg)));
    }
  } catch (e) { console.error("Admin notify error:", e); }

  return { success: true, message: "UTR submitted. Payment is under review." };
});

// ─── Cloud Function: Verify QR Payment (Admin-Only, Transactional) ───────────
exports.verifyQrPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const { orderId, action, rejectReason } = request.data; // action: 'approve' | 'reject'
  if (!orderId || !['approve', 'reject'].includes(action)) {
    throw new HttpsError("invalid-argument", "Invalid orderId or action.");
  }

  // Verify caller is admin
  const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError("permission-denied", "Only admins can verify payments.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderDoc = await orderRef.get();
  if (!orderDoc.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = orderDoc.data();
  if (order.paymentStatus !== 'under_review') {
    throw new HttpsError("failed-precondition", "Order is not under review.");
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // ─── ATOMIC coin deduction via transaction ──────────────────────────
    if (order.pendingCoinsDeduction > 0) {
      await db.runTransaction(async (transaction) => {
        const userRef = db.doc(`users/${order.userId}`);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

        const userData = userSnap.data();
        const currentCoins = userData.coins || 0;

        // Safety: if user somehow spent coins elsewhere, deduct only what's available
        const actualDeduction = Math.min(order.pendingCoinsDeduction, currentCoins);

        if (actualDeduction > 0) {
          transaction.update(userRef, {
            coins: FieldValue.increment(-actualDeduction)
          });
        }
      });

      // Log coin transaction
      await db.collection("coinTransactions").add({
        userId: order.userId,
        amount: order.pendingCoinsDeduction,
        type: "spending",
        source: "Order Discount (UPI Verified)",
        createdAt: now
      });
    }

    await orderRef.update({
      paymentStatus: "confirmed",
      pendingCoinsDeduction: 0,
      verifiedAt: now,
      verifiedBy: request.auth.uid,
      updatedAt: now
    });

    // ─── Payment Audit Log ────────────────────────────────────────────────
    await logPaymentEvent(orderId, "payment_approved", {
      verifiedBy: request.auth.uid,
      coinsDeducted: order.pendingCoinsDeduction,
      finalAmount: order.finalAmount,
    });

    // Notify customer
    try {
      const userDoc = await db.doc(`users/${order.userId}`).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: "✅ Payment Verified!",
            body: `Your payment for order #${orderId.slice(-6).toUpperCase()} has been confirmed.`,
          }
        });
      }
    } catch (e) { console.error("Notify error:", e); }

    console.log(`[EVENT: adminApproved] Admin verified and confirmed order ${orderId}`);
    return { success: true, message: "Payment approved." };
  } else {
    // Reject — DON'T cancel order, allow retry
    await orderRef.update({
      paymentStatus: "rejected",
      rejectReason: rejectReason || "Payment could not be verified",
      utrNumber: null, // Clear UTR so user can re-submit
      rejectedAt: now,
      rejectedBy: request.auth.uid,
      updatedAt: now
    });

    // ─── Payment Audit Log ────────────────────────────────────────────────
    await logPaymentEvent(orderId, "payment_rejected", {
      rejectedBy: request.auth.uid,
      reason: rejectReason || "Payment could not be verified",
    });

    // Notify customer
    try {
      const userDoc = await db.doc(`users/${order.userId}`).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: "❌ Payment Not Verified",
            body: `Order #${orderId.slice(-6).toUpperCase()}: ${rejectReason || "Please re-submit your UTR."}`,
          }
        });
      }
    } catch (e) { console.error("Notify error:", e); }

    console.log(`[EVENT: adminRejected] Admin rejected order ${orderId}: ${rejectReason}`);
    return { success: true, message: "Payment rejected. User can retry." };
  }
});

// ─── Cloud Function: New KYC Request Notification to Admin ────────────────────
exports.onKycSubmitted = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // Only trigger when verificationStatus changes to 'pending'
  if (before.verificationStatus === after.verificationStatus) return null;
  if (after.verificationStatus !== "pending") return null;

  try {
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const tokens = [];
    adminsSnap.forEach((doc) => {
      const token = doc.data().fcmToken;
      if (token) tokens.push(token);
    });

    if (tokens.length > 0) {
      const messages = tokens.map((token) => ({
        token,
        notification: {
          title: "🆔 New KYC Request",
          body: `${after.name || after.phone} submitted KYC for verification`,
        },
        data: {
          userId: event.params.userId,
          type: "kyc_request",
        },
      }));

      await Promise.all(messages.map((msg) => getMessaging().send(msg)));
      console.log(`✅ KYC notification sent to ${tokens.length} admins`);
    }
  } catch (err) {
    console.error("Error sending KYC notification:", err);
  }

  return null;
});

// ─── Cloud Function: Admin Password Reset for Staff ───────────────────────────
// This uses Firebase Admin SDK to update the ACTUAL Auth password,
// not just the Firestore hash. Without this, password resets are cosmetic only.
exports.resetStaffPassword = onCall(async (request) => {
  // 1. Auth check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  // 2. Admin role check
  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can reset staff passwords.");
  }

  const { staffPhone, newPassword } = request.data;

  // 3. Validate inputs
  if (!staffPhone || typeof staffPhone !== "string") {
    throw new HttpsError("invalid-argument", "Staff phone number is required.");
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }

  // 4. Derive the staff email (same format used during provisioning)
  const digits = staffPhone.replace(/\D/g, "");
  const derivedEmail = `${digits}@kariking.staff`;

  // 5. Find the Firebase Auth user
  let authUser;
  try {
    authUser = await getAuth().getUserByEmail(derivedEmail);
  } catch (err) {
    // Try alternate email format (legacy admin accounts)
    try {
      const altEmail = `admin3_${digits}@kariking.staff`;
      authUser = await getAuth().getUserByEmail(altEmail);
    } catch {
      throw new HttpsError(
        "not-found",
        `No Firebase Auth account found for ${staffPhone}. The staff member may need to be re-provisioned.`
      );
    }
  }

  // 6. Update Firebase Auth password (the REAL password)
  try {
    await getAuth().updateUser(authUser.uid, { password: newPassword });
  } catch (err) {
    console.error("Auth password update failed:", err);
    throw new HttpsError("internal", "Failed to update authentication password.");
  }

  // 7. Update Firestore provisionedStaff hash + force change flag
  try {
    // We use bcrypt-compatible approach: store a hash so login validation still works
    // The bcryptjs library isn't available in Cloud Functions by default,
    // so we use a simple SHA-256 marker that the login flow will detect
    await db.collection("provisionedStaff").doc(staffPhone).update({
      mustChangePassword: true,
      // Clear the old hash — the login flow's desync fallback will handle it
      // by trying the new password directly against Firebase Auth
      passwordHash: `__ADMIN_RESET__:${new Date().toISOString()}`,
    });
  } catch (firestoreErr) {
    // Non-fatal — Auth password was already updated successfully
    console.warn("Firestore flag update failed (non-critical):", firestoreErr);
  }

  console.log(`✅ Admin ${request.auth.uid} reset password for ${staffPhone} (UID: ${authUser.uid})`);

  return {
    success: true,
    message: `Password reset for ${staffPhone}. They must change it on next login.`,
  };
});
