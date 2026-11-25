// PATCH 5: jsPDF is dynamically imported only when invoice generation is triggered.
// This removes ~620KB from the initial bundle load.
import { Order } from '../types';
import type jsPDF from 'jspdf';
import { getDynamicStoreProfile } from './storeProfile';
import { COIN_VALUE } from '../config/coins';
import { doc as fbDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── Invoice ID Generator ────────────────────────────────────────────────────
function generateInvoiceId(orderId: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const orderSuffix = orderId.slice(-6).toUpperCase();
  return `KK-${year}${month}-${orderSuffix}`;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatQty(qty: number, unit?: string): string {
  if (unit === 'gram') {
    if (qty >= 1000 && qty % 1000 === 0) return `${qty / 1000} kg`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
    return `${qty} g`;
  }
  if (unit === 'kg') return `${qty} kg`;
  if (unit === 'piece') return `${qty} pcs`;
  return `${qty}`;
}

/** Format amount as ₹X,XXX for PDF (jsPDF handles ₹ via Unicode) */
function fmtAmt(amount: number | undefined | null): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? Math.round(amount) : 0;
  // jsPDF default fonts (Helvetica) do NOT support Unicode ₹ (U+20B9).
  // Use 'Rs.' prefix which is universally safe in PDF encoding.
  return 'Rs.' + new Intl.NumberFormat('en-IN').format(safe);
}

// ─── Page overflow guard ─────────────────────────────────────────────────────
function checkPage(doc: jsPDF, y: number, margin: number, needed = 30): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 20) {
    doc.addPage();
    return margin;
  }
  return y;
}

// ─── Main PDF Generator ─────────────────────────────────────────────────────
export async function generateInvoicePDF(order: Order, customerName?: string) {
  // PATCH 5: Dynamic import — jsPDF loaded only when PDF generation is triggered
  const [{ default: jsPDF }, storeProfile] = await Promise.all([
    import('jspdf'),
    getDynamicStoreProfile(),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const invoiceId = generateInvoiceId(order.id);
  const margin = 18;
  let y = 0;

  // ─── Color Palette ────────────────────────────────────────────────────
  const brandRed: [number, number, number] = [122, 0, 0];
  const darkText: [number, number, number] = [30, 30, 30];
  const grayText: [number, number, number] = [120, 120, 120];
  const lightGray: [number, number, number] = [245, 245, 245];
  const white: [number, number, number] = [255, 255, 255];
  const greenText: [number, number, number] = [22, 163, 74];

  // ═══════════════════════════════════════════════════════════════════════
  // HEADER — Brand Bar
  // ═══════════════════════════════════════════════════════════════════════
  doc.setFillColor(...brandRed);
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(storeProfile.storeName.toUpperCase(), margin, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(storeProfile.tagline, margin, 21);

  // Invoice title — right side
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', pageWidth - margin, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${invoiceId}`, pageWidth - margin, 21, { align: 'right' });

  y = 40;

  // ═══════════════════════════════════════════════════════════════════════
  // FROM / TO — Two columns
  // ═══════════════════════════════════════════════════════════════════════
  const col1 = margin;
  const col2 = pageWidth / 2 + 8;

  // ─── FROM (Store details synced from Admin Settings) ──────────────────
  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('FROM', col1, y);
  y += 5;

  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(storeProfile.storeName, col1, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  const storeAddrLines = doc.splitTextToSize(storeProfile.storeAddress, pageWidth / 2 - margin - 5);
  doc.text(storeAddrLines, col1, y);
  y += storeAddrLines.length * 4;
  doc.text(`Phone: ${storeProfile.phone}`, col1, y);
  y += 4;
  doc.text(`Email: ${storeProfile.email}`, col1, y);
  if (storeProfile.gst) {
    y += 4;
    doc.text(`GSTIN: ${storeProfile.gst}`, col1, y);
  }

  // ─── TO (Customer details) ────────────────────────────────────────────
  let ty = 40;
  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', col2, ty);
  ty += 5;

  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  // Use customerName from order data, then param, then fallback
  const name = (order as any).customerName || customerName || 'Customer';
  doc.text(name, col2, ty);
  ty += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  if (order.phone) {
    doc.text(`Phone: ${order.phone}`, col2, ty);
    ty += 4;
  }

  // Wrap delivery address
  if (order.address) {
    const addressLines = doc.splitTextToSize(order.address, pageWidth / 2 - margin - 5);
    doc.text(addressLines, col2, ty);
    ty += addressLines.length * 4;
  }

  y = Math.max(y, ty) + 4;

  // ─── Invoice Meta Row ─────────────────────────────────────────────────
  doc.setFillColor(248, 248, 248);
  doc.rect(margin, y, pageWidth - margin * 2, 14, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...grayText);

  const metaY = y + 5;
  doc.text('INVOICE DATE', col1 + 3, metaY);
  doc.text('ORDER ID', col1 + 55, metaY);
  doc.text('PAYMENT', col1 + 110, metaY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkText);

  const metaVY = y + 10;
  doc.text(formatDate(order.deliveredAt || order.updatedAt || order.createdAt), col1 + 3, metaVY);
  doc.text(`#${order.id.slice(-8).toUpperCase()}`, col1 + 55, metaVY);

  const paymentLabels: Record<string, string> = {
    qr: 'GPay Paid',
    coins: 'Kari Coins',
    cod: 'Cash on Delivered',
  };
  const fallbackPaymentLabel = order.isCOD ? 'Cash on Delivered' : 'GPay Paid';
  doc.text(paymentLabels[order.paymentMethod] || fallbackPaymentLabel, col1 + 110, metaVY);

  y += 20;

  // ═══════════════════════════════════════════════════════════════════════
  // PAYMENT STATUS BANNER (GPay Paid / Cash on Delivered)
  // ═══════════════════════════════════════════════════════════════════════
  if (order.paymentMethod === 'qr' || (!order.paymentMethod && !order.isCOD)) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, pageWidth - margin * 2, order.utrNumber ? 16 : 10, 2, 2, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('GPAY PAID', col1 + 3, y + 5.5);

    if (order.utrNumber) {
      doc.setTextColor(...grayText);
      doc.setFont('helvetica', 'normal');
      doc.text(`UTR: ${order.utrNumber}`, col1 + 3, y + 11);
      if (order.verifiedAt) {
        doc.text(`Verified: ${formatDate(order.verifiedAt)}`, col1 + 80, y + 11);
      }
    }

    y += order.utrNumber ? 20 : 14;
  } else if (order.paymentMethod === 'cod' || order.isCOD) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('CASH ON DELIVERED', col1 + 3, y + 6);

    y += 14;
  } else if (order.paymentMethod === 'coins') {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('PAID VIA KARI COINS', col1 + 3, y + 6);

    y += 14;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ═══════════════════════════════════════════════════════════════════════

  // Table header
  doc.setFillColor(...brandRed);
  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('#', margin + 3, y + 5);
  doc.text('ITEM', margin + 10, y + 5);
  doc.text('QTY', margin + 95, y + 5);
  doc.text('RATE', margin + 115, y + 5);
  doc.text('AMOUNT', pageWidth - margin - 3, y + 5, { align: 'right' });

  y += 12;

  // Table rows
  doc.setTextColor(...darkText);
  order.items.forEach((item, idx) => {
    y = checkPage(doc, y, 45);

    const itemTotal = Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice);

    // Alternate row background
    if (idx % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(margin, y - 4, pageWidth - margin * 2, 9, 'F');
    }

    doc.setTextColor(...grayText);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${idx + 1}`, margin + 3, y);

    doc.setTextColor(...darkText);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    // Truncate long names
    const maxNameW = 78;
    const itemName = doc.splitTextToSize(item.name, maxNameW)[0];
    doc.text(itemName, margin + 10, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...grayText);
    doc.text(formatQty(item.quantity, item.unitType), margin + 95, y);
    doc.text(fmtAmt(item.sellingPrice), margin + 115, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(fmtAmt(itemTotal), pageWidth - margin - 3, y, { align: 'right' });

    y += 8;
  });

  y += 4;

  // ═══════════════════════════════════════════════════════════════════════
  // PRICING SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  y = checkPage(doc, y, 50);

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin + 90, y - 2, pageWidth - margin, y - 2);

  const sumLabelX = margin + 95;
  const sumValX = pageWidth - margin - 3;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  doc.text('Subtotal', sumLabelX, y + 2);
  doc.setTextColor(...darkText);
  doc.text(fmtAmt(order.totalAmount), sumValX, y + 2, { align: 'right' });
  y += 7;

  // Coupon Discount
  if (order.couponDiscount && order.couponDiscount > 0) {
    doc.setTextColor(...grayText);
    doc.text(`Coupon${order.couponCode ? ` (${order.couponCode})` : ''}`, sumLabelX, y);
    doc.setTextColor(...greenText);
    doc.text(`-${fmtAmt(order.couponDiscount)}`, sumValX, y, { align: 'right' });
    y += 6;
  }

  // Coin Discount
  if (order.coinsUsed > 0) {
    doc.setTextColor(...grayText);
    doc.text(`Kari Coins (${order.coinsUsed} coin${order.coinsUsed > 1 ? 's' : ''})`, sumLabelX, y);
    doc.setTextColor(...greenText);
    const coinDiscountAmt = order.coinsDiscountAmount || order.coinsUsed * COIN_VALUE;
    doc.text(`-${fmtAmt(coinDiscountAmt)}`, sumValX, y, { align: 'right' });
    y += 6;
  }

  // Delivery Charge
  const deliveryCharge = order.deliveryCharge ?? 0;
  doc.setTextColor(...grayText);
  doc.text('Delivery', sumLabelX, y);
  doc.setTextColor(...darkText);
  doc.text(deliveryCharge === 0 ? 'FREE' : fmtAmt(deliveryCharge), sumValX, y, { align: 'right' });
  y += 5;

  // ─── Total Savings Row ─────────────────────────────────────────────────
  const deliverySavings =
    deliveryCharge === 0 &&
    storeProfile.freeDeliveryThreshold > 0 &&
    order.totalAmount >= storeProfile.freeDeliveryThreshold
      ? storeProfile.deliveryFee
      : 0;
  const computedSavings =
    (order.couponDiscount || 0) +
    ((order.coinsDiscountAmount || order.coinsUsed * COIN_VALUE) || 0) +
    deliverySavings;
  const totalSavings = typeof order.totalSavings === 'number' ? order.totalSavings : computedSavings;
  
  if (totalSavings > 0) {
    doc.setFillColor(230, 252, 237);
    doc.roundedRect(sumLabelX - 5, y - 2, pageWidth - margin - sumLabelX + 8, 9, 1.5, 1.5, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('TOTAL SAVINGS', sumLabelX, y + 4);
    doc.text(fmtAmt(totalSavings), sumValX, y + 4, { align: 'right' });
    y += 12;
  }

  // ─── Grand Total Box ──────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(sumLabelX, y, pageWidth - margin, y);
  y += 5;

  doc.setFillColor(...brandRed);
  doc.roundedRect(sumLabelX - 5, y - 4, pageWidth - margin - sumLabelX + 8, 13, 2, 2, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAID', sumLabelX, y + 4);
  doc.text(fmtAmt(order.finalAmount ?? Math.round(order.totalAmount)), sumValX, y + 4, { align: 'right' });

  y += 22;

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  y = checkPage(doc, y, 30);

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Thank you for shopping with ${storeProfile.storeName}!`, pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('This is a computer-generated invoice and does not require a signature.', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`For queries: ${storeProfile.phone} | ${storeProfile.email} | ${storeProfile.website}`, pageWidth / 2, y, { align: 'center' });

  return doc;
}

// ─── Customer Name Resolver (async — call BEFORE download) ───────────────────
export async function resolveCustomerName(order: Order, fallbackName?: string): Promise<string> {
  const name = (order as any).customerName || fallbackName || '';
  if (name) return name;
  // Fetch from Firestore for old orders without customerName
  if (order.userId) {
    try {
      const userSnap = await getDoc(fbDoc(db, 'users', order.userId));
      if (userSnap.exists()) return userSnap.data().name || 'Customer';
    } catch { /* ignore */ }
  }
  return 'Customer';
}

// ─── Download Helper ─────────────────────────────────────────────────────────
export async function downloadInvoice(order: Order, customerName?: string) {
  try {
    const name = (order as any).customerName || customerName || 'Customer';
    const pdfDoc = await generateInvoicePDF(order, name);
    const invoiceId = generateInvoiceId(order.id);
    const filename = `Kari_King_Invoice_${invoiceId}.pdf`;

    if (Capacitor.isNativePlatform()) {
      // Native Android/iOS: Write to filesystem and trigger Share sheet
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1];
      
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache,
      });
      
      await Share.share({
        title: 'Order Invoice',
        text: `Invoice for Order #${order.id.slice(-6)}`,
        url: savedFile.uri,
        dialogTitle: 'Save or View Invoice'
      });
    } else {
      // Standard Web Behavior
      pdfDoc.save(filename);
    }
  } catch (err) {
    console.error('[Invoice] PDF generation failed:', err);
    alert('Failed to generate invoice. Please try again.');
  }
}
