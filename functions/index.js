const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
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
        const payLabels = { qr: "UPI QR", coins: "Coins", cod: "Cash on Delivery" };
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
    // Server-side only — client-side processReferralReward() has been removed
    // to prevent race conditions. Server SDK bypasses Firestore rules.
    try {
      const userRef = db.doc(`users/${after.userId}`);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.referredBy && !userData.referredRewardGiven) {
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
              const now = new Date().toISOString();

              // ── Double Coins: Check for active reward campaign ──────────
              let multiplier = 1;
              let campaignId = null;
              try {
                const campaignsQuery = await db.collection('rewardCampaigns').where('isActive', '==', true).get();
                if (!campaignsQuery.empty) {
                  const nowMs = Date.now();
                  for (const campDoc of campaignsQuery.docs) {
                    const camp = campDoc.data();
                    const starts = new Date(camp.startsAt).getTime();
                    const ends = new Date(camp.endsAt).getTime();
                    if (nowMs >= starts && nowMs <= ends) {
                      multiplier = camp.multiplier || 1;
                      campaignId = campDoc.id;
                      break;
                    }
                  }
                }
              } catch (campErr) {
                console.warn("Campaign check failed (non-blocking):", campErr);
              }

              const REFERRER_REWARD = 5 * multiplier;
              const REFERRED_REWARD = 2 * multiplier;

              // Convert lockedCoins to coins (safe: never go below 0)
              const referrerData = referrerDoc.data();
              const currentLocked = referrerData.lockedCoins || 0;
              const safeDecrement = Math.min(5, currentLocked); // unlock base 5 locked coins
              const referrerNewBalance = (referrerData.coins || 0) + REFERRER_REWARD;

              await referrerDoc.ref.update({
                coins: FieldValue.increment(REFERRER_REWARD),
                lockedCoins: FieldValue.increment(-safeDecrement),
                totalCoinsEarned: FieldValue.increment(REFERRER_REWARD),
                totalReferralRewards: FieldValue.increment(REFERRER_REWARD),
              });

              // Reward referred user + set duplicate guard
              const referredNewBalance = (userData.coins || 0) + REFERRED_REWARD;
              await userRef.update({
                coins: FieldValue.increment(REFERRED_REWARD),
                referredRewardGiven: true,
                totalCoinsEarned: FieldValue.increment(REFERRED_REWARD),
              });

              // Mark referral as completed
              const referralRecords = await db.collection("referrals")
                .where("referredUserId", "==", after.userId)
                .where("status", "==", "pending")
                .get();

              const referralId = referralRecords.empty ? null : referralRecords.docs[0].id;

              for (const refDoc of referralRecords.docs) {
                await refDoc.ref.update({
                  status: "completed",
                  rewardGiven: true,
                  completedAt: now,
                  completedOrderId: orderId,
                  multiplierApplied: multiplier,
                  referrerReward: REFERRER_REWARD,
                  referredReward: REFERRED_REWARD,
                });
              }

              // Write audit logs to coinTransactions (server SDK bypasses rules)
              await Promise.all([
                db.collection("coinTransactions").add({
                  userId: referrerDoc.id,
                  amount: REFERRER_REWARD,
                  type: "earning",
                  source: multiplier > 1
                    ? `Referral reward (${multiplier}x) — ${userData.phone || after.userId} completed first order`
                    : `Referral reward — ${userData.phone || after.userId} completed first order`,
                  referralId: referralId,
                  orderId: orderId,
                  multiplierApplied: multiplier,
                  campaignId: campaignId,
                  balanceAfter: referrerNewBalance,
                  createdAt: now,
                }),
                db.collection("coinTransactions").add({
                  userId: after.userId,
                  amount: REFERRED_REWARD,
                  type: "earning",
                  source: multiplier > 1
                    ? `Welcome bonus (${multiplier}x) — first order completed!`
                    : "Welcome bonus — first order completed!",
                  referralId: referralId,
                  orderId: orderId,
                  multiplierApplied: multiplier,
                  campaignId: campaignId,
                  balanceAfter: referredNewBalance,
                  createdAt: now,
                }),
              ]);

              // Notify Referrer
              const refToken = referrerData.fcmToken;
              if (refToken) {
                await getMessaging().send({
                  token: refToken,
                  notification: {
                    title: multiplier > 1 ? `🎁 ${multiplier}x Referral Bonus Unlocked!` : "🎁 Referral Bonus Unlocked!",
                    body: multiplier > 1
                      ? `Your friend completed their first order! You earned ${REFERRER_REWARD} coins (${multiplier}x event active!)`
                      : `Your friend received their first order! You earned 5 coins.`,
                  }
                }).catch(() => {});
              }
              console.log(`🎁 Referral bonus (${multiplier}x): referrer=${referrerDoc.id} (+${REFERRER_REWARD}), referred=${after.userId} (+${REFERRED_REWARD}), order=${orderId}`);
            } else {
              console.warn(`⚠️ Referral code "${userData.referredBy}" has no matching user — skipping reward`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error processing referral unlock:", err.stack || err);
    }
  }

  // ─── Coin Restoration on Cancellation ──────────────────────────────────────
  // If order is cancelled AND coins were already deducted, restore them
  if (after.status === "Cancelled" && (after.coinsUsed || 0) > 0) {
    try {
      // Only restore if coins were actually deducted (non-QR or QR already approved)
      const wasDeducted = after.paymentMethod !== 'qr' || 
                          (after.paymentMethod === 'qr' && (after.pendingCoinsDeduction || 0) === 0);
      
      if (wasDeducted) {
        const coinsToRestore = after.coinsUsed;
        await db.runTransaction(async (transaction) => {
          const userRef = db.doc(`users/${after.userId}`);
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists) {
            transaction.update(userRef, {
              coins: FieldValue.increment(coinsToRestore),
              totalCoinsRedeemed: FieldValue.increment(-coinsToRestore),
            });
          }
        });

        // Audit log
        await db.collection("rewardTransactions").add({
          userId: after.userId,
          orderId: orderId,
          amount: coinsToRestore,
          rupeeValue: coinsToRestore * COIN_VALUE,
          type: "earned",
          source: `Coins restored — Order #${orderId.slice(-6)} cancelled`,
          createdAt: new Date().toISOString(),
        });

        console.log(`🔄 Restored ${coinsToRestore} coins to user ${after.userId} (order ${orderId} cancelled)`);
      }
    } catch (err) {
      console.error("Error restoring coins on cancellation:", err);
    }
  }

  return null;
});

// ─── Cloud Function: Create Order (Server-Side Pricing + Idempotency + Transactions) ─────────
exports.createOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in to order.");
  }

  try {

  const { items, address, phone, useCoins, paymentMethod, deliveryFee, coinsToUse: requestedCoins, idempotencyKey, couponCode } = request.data;
  
  if (!items || !items.length || !address || !phone) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const userId = request.auth.uid;

  // ─── Idempotency Check: prevent duplicate orders on network retries ───────
  if (idempotencyKey) {
    try {
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
    } catch (idempotencyErr) {
      // Index may not exist yet — log and proceed (order will still be created)
      console.warn("Idempotency check failed (missing index?), proceeding:", idempotencyErr.message);
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
        const expiryDateString = freshCoupon.expiresAt || freshCoupon.validTill;
        if (expiryDateString && new Date(expiryDateString) < now) return { valid: false };
        if (freshCoupon.validFrom && new Date(freshCoupon.validFrom) > now) return { valid: false };
        
        const minOrder = freshCoupon.minimumOrderAmount ?? freshCoupon.minOrder ?? 0;
        if (totalPrice < minOrder) return { valid: false };

        // ── Distributed counter: sum shards for total usage ──────────────
        const globalLimit = freshCoupon.usageLimit ?? freshCoupon.totalUsageLimit ?? 0;
        if (globalLimit > 0) {
          const shardsSnap = await db.collection(`coupons/${couponDoc.id}/shards`).get();
          let totalUsed = freshCoupon.usedCount || 0; // fallback to legacy field
          if (!shardsSnap.empty) {
            totalUsed = 0;
            shardsSnap.forEach((s) => { totalUsed += s.data().count || 0; });
          }
          if (totalUsed >= globalLimit) return { valid: false };
        }

        // ── Per-user limit validation ────────────────────────────────────
        const perUserLimit = freshCoupon.perUserLimit ?? 0;
        if (perUserLimit > 0) {
          const userDoc = await transaction.get(db.doc(`users/${userId}`));
          const usedCoupons = (userDoc.exists && userDoc.data().usedCoupons) || [];
          const userUsageCount = usedCoupons.filter(c => c === upperCode).length;
          if (userUsageCount >= perUserLimit) return { valid: false };
        }

        // Calculate discount
        let disc = 0;
        // Support both new `type` and legacy `discountType` for backward compatibility
        const couponType = freshCoupon.type || freshCoupon.discountType;
        const maxDiscount = freshCoupon.maxDiscountAmount ?? freshCoupon.maxDiscount ?? 0;

        if (couponType === 'flat') {
          disc = freshCoupon.discountValue;
        } else if (couponType === 'percentage') {
          disc = Math.round((totalPrice * freshCoupon.discountValue) / 100);
          if (maxDiscount > 0 && disc > maxDiscount) {
            disc = maxDiscount;
          }
        }
        disc = Math.min(disc, totalPrice);

        // ── Distributed counter: increment a random shard ────────────────
        const NUM_SHARDS = 10;
        const shardId = Math.floor(Math.random() * NUM_SHARDS).toString();
        const shardRef = db.doc(`coupons/${couponDoc.id}/shards/${shardId}`);
        transaction.set(shardRef, { count: FieldValue.increment(1) }, { merge: true });

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

      // Allow coins to cover up to 100% of remaining subtotal (leaving at least ₹1)
      const maxRupeesForCoins = Math.max(0, subtotalAfterCoupon - 1);
      const maxCoinsByValue = Math.floor(maxRupeesForCoins / COIN_VALUE);
      const maxCoins = Math.min(availableCoins, maxCoinsByValue);

      const actualCoins = requestedCoins ? Math.min(requestedCoins, maxCoins) : maxCoins;
      if (actualCoins <= 0) return { coinsUsed: 0, coinDiscount: 0 };

      const coinDiscount = actualCoins * COIN_VALUE;

      // Atomically deduct coins and track totalRedeemed
      transaction.update(userRef, { 
        coins: FieldValue.increment(-actualCoins),
        totalCoinsRedeemed: FieldValue.increment(actualCoins)
      });

      return { coinsUsed: actualCoins, coinDiscount };
    });

    coinsUsed = coinResult.coinsUsed;
    discountAmount += coinResult.coinDiscount;

    // Log coin transaction (outside main transaction for non-blocking)
    if (coinsUsed > 0) {
      await db.collection("rewardTransactions").add({
        userId,
        orderId: null, // Order not created yet
        amount: coinsUsed,
        rupeeValue: coinResult.coinDiscount,
        type: "redeemed",
        source: "Order Discount",
        createdAt: new Date().toISOString()
      });
    }
  } else if (useCoins && paymentMethod === 'qr') {
    // QR flow: calculate coins but DON'T deduct yet — deduct on admin approval
    const userDoc = await db.doc(`users/${userId}`).get();
    const availableCoins = (userDoc.exists && userDoc.data().coins) || 0;
    if (availableCoins > 0) {
      const maxRupeesForCoins = Math.max(0, subtotalAfterCoupon - 1);
      const maxCoinsByValue = Math.floor(maxRupeesForCoins / COIN_VALUE);
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

  // Fetch customer name for invoice
  let customerName = '';
  try {
    const custDoc = await db.doc(`users/${userId}`).get();
    customerName = custDoc.exists ? (custDoc.data().name || '') : '';
  } catch (e) { console.warn('Could not fetch customer name:', e); }

  // ─── Status Machine ─────────────────────────────────────────────────────
  let paymentStatus = 'pending';
  if (paymentMethod === 'coins' && finalAmount <= 0) {
    paymentStatus = 'paid';
  } else if (paymentMethod === 'qr') {
    paymentStatus = 'awaiting_payment';
  } else if (paymentMethod === 'cod') {
    paymentStatus = 'pending';
  }

  const orderData = {
    userId,
    customerName,
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
    coinsEarned: 0,
    coinsRedeemed: coinsUsed,
    coinDiscountAmount: coinsUsed * COIN_VALUE,
    finalPaidAmount: Math.max(0, finalAmount),
    pendingCoinsDeduction: paymentMethod === 'qr' ? coinsUsed : 0,
    couponCode: appliedCouponCode || null,
    couponDiscount: couponDiscount,
    discountAmount,
    totalSavings: discountAmount + ((deliveryFee || 0) === 0 && totalPrice >= 500 ? 40 : 0),
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

  } catch (err) {
    // Re-throw HttpsErrors as-is, wrap everything else
    if (err instanceof HttpsError) throw err;
    console.error("[createOrder UNHANDLED]", err);
    throw new HttpsError("internal", err.message || "Order creation failed unexpectedly.");
  }
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
            coins: FieldValue.increment(-actualDeduction),
            totalCoinsRedeemed: FieldValue.increment(actualDeduction)
          });
        }
      });

      // Log coin transaction
      await db.collection("rewardTransactions").add({
        userId: order.userId,
        orderId: orderId,
        amount: order.pendingCoinsDeduction,
        rupeeValue: order.pendingCoinsDeduction * 20, // 1 coin = 20
        type: "redeemed",
        source: "Order Discount (UPI Verified)",
        createdAt: now
      });
    }

    // ─── Double Coins Event Engine & Reward Calculation ───────────────────
    let multiplier = 1;
    let campaignId = null;
    
    // Check for an active campaign
    const campaignsQuery = await db.collection('rewardCampaigns').where('isActive', '==', true).get();
    if (!campaignsQuery.empty) {
      const nowMs = Date.now();
      for (const docSnap of campaignsQuery.docs) {
        const camp = docSnap.data();
        const starts = new Date(camp.startsAt).getTime();
        const ends = new Date(camp.endsAt).getTime();
        if (nowMs >= starts && nowMs <= ends) {
          multiplier = camp.multiplier || 1;
          campaignId = docSnap.id;
          break; // only 1 active
        }
      }
    }

    // Calculate finalPaidAmount (totalAmount - couponDiscount - coinDiscount + deliveryFee)
    // We already have `finalAmount` on the order doc, which represents the exact amount paid.
    const finalPaidAmount = order.finalAmount || 0;
    
    // Calculate earnedCoins = floor(finalPaidAmount / 500) * multiplier
    const earnedCoins = Math.floor(finalPaidAmount / 500) * multiplier;

    if (earnedCoins > 0) {
      await db.runTransaction(async (transaction) => {
        const userRef = db.doc(`users/${order.userId}`);
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
          transaction.update(userRef, {
            coins: FieldValue.increment(earnedCoins),
            totalCoinsEarned: FieldValue.increment(earnedCoins)
          });
        }
      });

      await db.collection('rewardTransactions').add({
        userId: order.userId,
        orderId: orderId,
        amount: earnedCoins,
        rupeeValue: earnedCoins * 20,
        type: 'earned',
        source: 'Order Completion',
        multiplierApplied: multiplier,
        campaignId: campaignId,
        finalPaidAmount: finalPaidAmount,
        createdAt: now
      });
    }

    // PATCH 4: Single atomic update (was previously two separate writes)
    await orderRef.update({
      paymentStatus: "confirmed",
      pendingCoinsDeduction: 0,
      coinsEarned: earnedCoins,
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

// ─── Play Store Account Deletion Flow ──────────────────────────────────────────
// Deletes Firebase Auth and PII from Firestore, but retains orders for auditing.
exports.deleteUserAccount = onCall({
  enforceAppCheck: false,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to delete your account.");
  }

  const uid = request.auth.uid;

  try {
    // 1. Delete Firestore User Document
    await db.collection("users").doc(uid).delete();

    // 2. Delete Addresses (if userAddresses subcollection exists, we can delete the parent wrapper document, 
    // or simply delete the known addresses doc. For Firebase v9 flat structure, some apps use addresses/{uid})
    try {
      await db.collection("addresses").doc(uid).delete();
    } catch (e) {
      console.warn("Addresses doc not found or failed to delete (safe to ignore):", e);
    }

    // 3. Delete from Firebase Authentication (this invalidates the current session immediately)
    await getAuth().deleteUser(uid);

    console.log(`✅ User account deleted for UID: ${uid}`);

    return { success: true, message: "Account deleted successfully." };
  } catch (error) {
    console.error("Account deletion failed:", error);
    throw new HttpsError("internal", "Failed to delete account. Please contact support.");
  }
});

// ─── Cloud Function: Notify Admin on New Bulk Booking ─────────────────────────
exports.onBulkBookingCreated = onDocumentCreated("bulkBookings/{bookingId}", async (event) => {
  const data = event.data.data();
  const bookingId = event.params.bookingId;

  console.log(`📦 New bulk booking created: ${bookingId} by ${data.userName}`);

  try {
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const tokens = [];
    adminsSnap.forEach((doc) => {
      const token = doc.data().fcmToken;
      if (token) tokens.push(token);
    });

    if (tokens.length > 0) {
      const typeLabel = data.type === 'function' ? 'Function/Event' : 'Bulk';
      const messages = tokens.map((token) => ({
        token,
        notification: {
          title: `📋 New ${typeLabel} Booking!`,
          body: `${data.userName} • ${data.peopleCount} ppl • ${data.quantityRequirement || 'Custom'} • ${new Date(data.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        },
        data: {
          bookingId: bookingId,
          type: "bulk_booking_new",
        },
      }));

      await Promise.all(messages.map((msg) => getMessaging().send(msg)));
      console.log(`✅ Admin notified of new bulk booking (${tokens.length} admins)`);
    }
  } catch (err) {
    console.error("Error sending bulk booking notification:", err);
  }

  return null;
});

// ─── Cloud Function: Notify on Bulk Booking Status Change ─────────────────────
exports.onBulkBookingStatusChange = onDocumentUpdated("bulkBookings/{bookingId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const bookingId = event.params.bookingId;

  // Only trigger if status actually changed
  if (before.status === after.status) return null;

  console.log(`📦 Bulk booking ${bookingId}: ${before.status} → ${after.status}`);

  // 1. Notify the customer about status changes
  try {
    const userDoc = await db.doc(`users/${after.userId}`).get();
    if (userDoc.exists) {
      const fcmToken = userDoc.data().fcmToken;
      if (fcmToken) {
        const statusMessages = {
          reviewed: { title: "📝 Booking Reviewed", body: `Your booking #${bookingId.slice(-6)} is being reviewed` },
          awaiting_payment: { title: "💰 Price Quote Ready!", body: `Your booking #${bookingId.slice(-6)}: ₹${(after.quotedPrice || 0).toLocaleString()} quoted. Pay advance to confirm.` },
          confirmed: { title: "✅ Booking Confirmed!", body: `Your booking #${bookingId.slice(-6)} is confirmed and being prepared` },
          delivered: { title: "🎉 Order Delivered!", body: `Your bulk order #${bookingId.slice(-6)} has been delivered` },
          completed: { title: "✔️ Booking Complete", body: `Your booking #${bookingId.slice(-6)} is marked complete. Thank you!` },
          rejected: { title: "❌ Booking Rejected", body: `Your booking #${bookingId.slice(-6)} could not be fulfilled` },
          cancelled: { title: "🚫 Booking Cancelled", body: `Your booking #${bookingId.slice(-6)} has been cancelled${after.cancelReason ? ': ' + after.cancelReason : ''}` },
        };

        const notification = statusMessages[after.status];
        if (notification) {
          await getMessaging().send({
            token: fcmToken,
            notification,
            data: {
              bookingId: bookingId,
              type: "bulk_booking_update",
            },
          });
          console.log(`✅ Customer notified of bulk booking status change`);
        }
      }
    }
  } catch (err) {
    console.error("Error sending customer bulk booking notification:", err);
  }

  // 2. Notify admins when customer pays advance (status → confirmed from awaiting_payment)
  if (after.status === 'confirmed' && before.status === 'awaiting_payment') {
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
            title: "💰 Advance Payment Received!",
            body: `${after.userName} paid ₹${(after.advanceAmount || 0).toLocaleString()} for booking #${bookingId.slice(-6)}`,
          },
          data: {
            bookingId: bookingId,
            type: "bulk_booking_paid",
          },
        }));

        await Promise.all(messages.map((msg) => getMessaging().send(msg)));
        console.log(`✅ Admin notified of advance payment`);
      }
    } catch (err) {
      console.error("Error sending admin payment notification:", err);
    }
  }

  return null;
});

// ─── One-Time Admin Function: Fix Stuck Referrals ─────────────────────────────
// Scans for pending referrals where the referred user already has a delivered
// order but never received their reward (due to the previous Firestore rules bug).
// Call this ONCE from admin to retroactively credit coins.
exports.fixStuckReferrals = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  // Verify caller is admin
  const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can run this.");
  }

  const results = { fixed: 0, skipped: 0, errors: 0, details: [] };

  try {
    // Find all pending referrals
    const pendingReferrals = await db.collection("referrals")
      .where("status", "==", "pending")
      .get();

    console.log(`🔍 Found ${pendingReferrals.size} pending referrals to check`);

    for (const refDoc of pendingReferrals.docs) {
      const referral = refDoc.data();
      const referredUserId = referral.referredUserId;
      const referrerId = referral.referrerId;

      try {
        // Check if referred user has a delivered order
        const deliveredOrders = await db.collection("orders")
          .where("userId", "==", referredUserId)
          .where("status", "==", "Delivered")
          .limit(1)
          .get();

        if (deliveredOrders.empty) {
          results.skipped++;
          results.details.push({ referralId: refDoc.id, status: "skipped", reason: "No delivered order yet" });
          continue;
        }

        // Check if reward was already given via the user doc flag
        const userDoc = await db.doc(`users/${referredUserId}`).get();
        if (userDoc.exists && userDoc.data().referredRewardGiven) {
          // Already rewarded — just mark the referral doc as completed
          await refDoc.ref.update({
            status: "completed",
            rewardGiven: true,
            completedAt: new Date().toISOString(),
            completedOrderId: deliveredOrders.docs[0].id,
            fixedBy: "fixStuckReferrals",
          });
          results.skipped++;
          results.details.push({ referralId: refDoc.id, status: "skipped", reason: "Already rewarded (flag was set)" });
          continue;
        }

        // This referral needs fixing — credit coins
        const orderId = deliveredOrders.docs[0].id;
        const now = new Date().toISOString();
        const REFERRER_REWARD = 5;
        const REFERRED_REWARD = 2;

        // Get referrer doc
        const referrerDoc = await db.doc(`users/${referrerId}`).get();
        if (!referrerDoc.exists) {
          results.errors++;
          results.details.push({ referralId: refDoc.id, status: "error", reason: "Referrer not found" });
          continue;
        }

        const referrerData = referrerDoc.data();
        const referredData = userDoc.exists ? userDoc.data() : {};

        // Credit referrer: unlock locked coins + add reward
        const currentLocked = referrerData.lockedCoins || 0;
        const safeDecrement = Math.min(5, currentLocked);
        await referrerDoc.ref.update({
          coins: FieldValue.increment(REFERRER_REWARD),
          lockedCoins: FieldValue.increment(-safeDecrement),
          totalCoinsEarned: FieldValue.increment(REFERRER_REWARD),
          totalReferralRewards: FieldValue.increment(REFERRER_REWARD),
        });

        // Credit referred user
        await db.doc(`users/${referredUserId}`).update({
          coins: FieldValue.increment(REFERRED_REWARD),
          referredRewardGiven: true,
          totalCoinsEarned: FieldValue.increment(REFERRED_REWARD),
        });

        // Mark referral as completed
        await refDoc.ref.update({
          status: "completed",
          rewardGiven: true,
          completedAt: now,
          completedOrderId: orderId,
          referrerReward: REFERRER_REWARD,
          referredReward: REFERRED_REWARD,
          fixedBy: "fixStuckReferrals",
        });

        // Write coin transaction logs
        await Promise.all([
          db.collection("coinTransactions").add({
            userId: referrerId,
            amount: REFERRER_REWARD,
            type: "earning",
            source: `Referral reward (retroactive fix) — ${referredData.phone || referredUserId} completed first order`,
            referralId: refDoc.id,
            orderId: orderId,
            balanceAfter: (referrerData.coins || 0) + REFERRER_REWARD,
            createdAt: now,
          }),
          db.collection("coinTransactions").add({
            userId: referredUserId,
            amount: REFERRED_REWARD,
            type: "earning",
            source: "Welcome bonus (retroactive fix) — first order completed!",
            referralId: refDoc.id,
            orderId: orderId,
            balanceAfter: (referredData.coins || 0) + REFERRED_REWARD,
            createdAt: now,
          }),
        ]);

        results.fixed++;
        results.details.push({
          referralId: refDoc.id,
          status: "fixed",
          referrer: referrerId,
          referred: referredUserId,
          orderId: orderId,
        });

        console.log(`✅ Fixed referral ${refDoc.id}: referrer=${referrerId} (+${REFERRER_REWARD}), referred=${referredUserId} (+${REFERRED_REWARD})`);
      } catch (innerErr) {
        results.errors++;
        results.details.push({ referralId: refDoc.id, status: "error", reason: innerErr.message });
        console.error(`❌ Error fixing referral ${refDoc.id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error("fixStuckReferrals failed:", err);
    throw new HttpsError("internal", err.message);
  }

  console.log(`🎁 fixStuckReferrals complete: ${results.fixed} fixed, ${results.skipped} skipped, ${results.errors} errors`);
  return results;
});
