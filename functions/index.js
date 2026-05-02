const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();

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

// ─── Cloud Function: Create Order (Server-Side Pricing + Idempotency) ─────────
exports.createOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in to order.");
  }

  const { items, address, phone, useCoins, paymentMethod, deliveryFee, coinsToUse: requestedCoins, idempotencyKey } = request.data;
  
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

  // Handle coins — secure server-side calculation
  let discountAmount = 0;
  let coinsUsed = 0;
  const COIN_VALUE = 20;

  if (useCoins) {
    const userDoc = await db.doc(`users/${userId}`).get();
    const availableCoins = userDoc.data().coins || 0;

    if (availableCoins > 0) {
      const maxCoins = Math.min(
        availableCoins,
        Math.floor(totalPrice / COIN_VALUE)
      );
      coinsUsed = requestedCoins ? Math.min(requestedCoins, maxCoins) : maxCoins;
      discountAmount = coinsUsed * COIN_VALUE;

      // For QR payments: coins deducted only AFTER admin verification
      // For Coins-only: deduct immediately (payment is instant)
      if (paymentMethod !== 'qr' && coinsUsed > 0) {
        await userDoc.ref.update({
          coins: FieldValue.increment(-coinsUsed)
        });

        await db.collection("coinTransactions").add({
          userId,
          amount: coinsUsed,
          type: "spending",
          source: "Order Discount",
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  const finalAmount = Math.max(0, totalPrice - discountAmount) + (deliveryFee || 0);
  const now = new Date().toISOString();

  // ─── Status Machine ─────────────────────────────────────────────────────
  // QR orders start as 'awaiting_payment' until user submits UTR
  // Coins-only orders that cover the full amount are immediately 'paid'
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
    discountAmount,
    deliveryCharge: deliveryFee || 0,
    utrNumber: null,
    idempotencyKey: idempotencyKey || null,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection("orders").add(orderData);
  console.log(`📝 Order created: ${docRef.id} | Status: ${paymentStatus}`);

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

  // ─── Strict UTR Validation ──────────────────────────────────────────────
  const trimmedUtr = utrNumber.trim();
  if (!/^\d{12}$/.test(trimmedUtr)) {
    throw new HttpsError("invalid-argument", "UTR must be exactly 12 digits.");
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

  console.log(`📩 UTR submitted for order ${orderId}: ${trimmedUtr}`);

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

// ─── Cloud Function: Verify QR Payment (Admin-Only) ──────────────────────────
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
    // Deduct pending coins
    if (order.pendingCoinsDeduction > 0) {
      await db.doc(`users/${order.userId}`).update({
        coins: FieldValue.increment(-order.pendingCoinsDeduction)
      });
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

    console.log(`✅ Order ${orderId} payment APPROVED`);
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

    console.log(`❌ Order ${orderId} payment REJECTED: ${rejectReason}`);
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
