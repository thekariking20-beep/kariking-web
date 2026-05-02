import jsPDF from 'jspdf';
import { Order } from '../types';

// ─── Invoice ID Generator ────────────────────────────────────────────────────
function generateInvoiceId(orderId: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const orderSuffix = orderId.slice(-6).toUpperCase();
  return `KK-${year}${month}-${orderSuffix}`;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
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

const COIN_VALUE = 20;

// ─── Main PDF Generator ─────────────────────────────────────────────────────
export function generateInvoicePDF(order: Order, customerName?: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const invoiceId = generateInvoiceId(order.id);
  const margin = 20;
  let y = 20;

  // ─── Color Constants ──────────────────────────────────────────────────
  const brandRed: [number, number, number] = [122, 0, 0];
  const darkText: [number, number, number] = [30, 30, 30];
  const grayText: [number, number, number] = [120, 120, 120];
  const lightGray: [number, number, number] = [245, 245, 245];
  const white: [number, number, number] = [255, 255, 255];

  // ═══════════════════════════════════════════════════════════════════════
  // HEADER — Brand Bar
  // ═══════════════════════════════════════════════════════════════════════
  doc.setFillColor(...brandRed);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('KARI KING', margin, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Premium Fresh Meat Delivery', margin, 23);

  // Invoice title — right side
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', pageWidth - margin, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${invoiceId}`, pageWidth - margin, 23, { align: 'right' });

  y = 45;

  // ═══════════════════════════════════════════════════════════════════════
  // INVOICE META — Two columns
  // ═══════════════════════════════════════════════════════════════════════
  const col1 = margin;
  const col2 = pageWidth / 2 + 10;

  // Left column — Invoice details
  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('INVOICE DATE', col1, y);
  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDate(order.deliveredAt || order.updatedAt || order.createdAt), col1, y + 5);

  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('ORDER ID', col1, y + 14);
  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${order.id.slice(-8).toUpperCase()}`, col1, y + 19);

  // Payment method
  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('PAYMENT METHOD', col1, y + 28);
  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const paymentLabels: Record<string, string> = {
    qr: 'UPI QR Payment',
    coins: 'Kari Coins',
  };
  doc.text(paymentLabels[order.paymentMethod] || order.paymentMethod, col1, y + 33);

  // Right column — Customer details
  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('BILLED TO', col2, y);
  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(customerName || 'Customer', col2, y + 5);

  doc.setTextColor(...grayText);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(order.phone, col2, y + 11);

  // Wrap address
  const addressLines = doc.splitTextToSize(order.address, pageWidth / 2 - margin - 5);
  doc.text(addressLines, col2, y + 17);

  y = y + 43;

  // ─── Divider ──────────────────────────────────────────────────────────
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ═══════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ═══════════════════════════════════════════════════════════════════════

  // Table header
  doc.setFillColor(...lightGray);
  doc.rect(margin, y - 3, pageWidth - margin * 2, 8, 'F');
  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('ITEM', margin + 3, y + 2);
  doc.text('QTY', margin + 100, y + 2);
  doc.text('RATE', margin + 120, y + 2);
  doc.text('AMOUNT', pageWidth - margin - 3, y + 2, { align: 'right' });

  y += 10;

  // Table rows
  doc.setTextColor(...darkText);
  order.items.forEach((item, idx) => {
    const itemTotal = Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(item.name, margin + 3, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(formatQty(item.quantity, item.unitType), margin + 100, y);
    doc.text(`₹${item.sellingPrice}`, margin + 120, y);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`₹${itemTotal}`, pageWidth - margin - 3, y, { align: 'right' });

    y += 7;

    // Light row separator
    if (idx < order.items.length - 1) {
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.2);
      doc.line(margin + 3, y - 2, pageWidth - margin - 3, y - 2);
    }
  });

  y += 5;

  // ─── Divider ──────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin + 95, y - 3, pageWidth - margin, y - 3);

  // ═══════════════════════════════════════════════════════════════════════
  // PRICING SUMMARY — Right aligned
  // ═══════════════════════════════════════════════════════════════════════
  const summaryX = margin + 105;
  const summaryValX = pageWidth - margin - 3;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  doc.text('Subtotal', summaryX, y);
  doc.setTextColor(...darkText);
  doc.text(`₹${Math.round(order.totalAmount)}`, summaryValX, y, { align: 'right' });
  y += 6;

  if (order.coinsUsed > 0) {
    doc.setTextColor(...grayText);
    doc.text(`Coin Discount (${order.coinsUsed} coins)`, summaryX, y);
    doc.setTextColor(22, 163, 74); // green
    doc.text(`-₹${order.coinsUsed * COIN_VALUE}`, summaryValX, y, { align: 'right' });
    y += 6;
  }

  const deliveryCharge = order.deliveryCharge ?? 0;
  doc.setTextColor(...grayText);
  doc.text('Delivery Charge', summaryX, y);
  doc.setTextColor(...darkText);
  doc.text(deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`, summaryValX, y, { align: 'right' });
  y += 4;

  // Total line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(summaryX, y, pageWidth - margin, y);
  y += 6;

  // Grand Total
  doc.setFillColor(...brandRed);
  doc.roundedRect(summaryX - 5, y - 5, pageWidth - margin - summaryX + 8, 12, 2, 2, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAID', summaryX, y + 3);
  doc.text(`₹${order.finalAmount || Math.round(order.totalAmount)}`, summaryValX, y + 3, { align: 'right' });

  y += 20;

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setTextColor(...grayText);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for shopping with Kari King!', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(7);
  doc.text('This is a computer-generated invoice and does not require a signature.', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('For queries, call: +91 6380886374 | www.kariking.in', pageWidth / 2, y, { align: 'center' });

  return doc;
}

// ─── Download Helper ─────────────────────────────────────────────────────────
export function downloadInvoice(order: Order, customerName?: string) {
  const doc = generateInvoicePDF(order, customerName);
  const invoiceId = generateInvoiceId(order.id);
  doc.save(`Kari_King_Invoice_${invoiceId}.pdf`);
}
