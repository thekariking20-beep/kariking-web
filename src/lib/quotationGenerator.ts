import { BulkBooking } from '../types';
import { getDynamicStoreProfile } from './storeProfile';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── Quotation ID Generator ──────────────────────────────────────────────────
function generateQuotationId(bookingId: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = bookingId.slice(-6).toUpperCase();
  return `KK-QT-${year}${month}-${suffix}`;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch {
    return '—';
  }
}

function getValidityDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 7); // Valid for 7 days
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
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
  return `${qty} ${unit || ''}`;
}

function fmtAmt(amount: number | undefined | null): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? Math.round(amount) : 0;
  return 'Rs.' + new Intl.NumberFormat('en-IN').format(safe);
}

function checkPage(doc: any, y: number, margin: number, needed = 30): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 20) {
    doc.addPage();
    return margin;
  }
  return y;
}

// ─── Main PDF Generator ─────────────────────────────────────────────────────
export async function generateQuotationPDF(booking: BulkBooking) {
  const [{ default: jsPDF }, storeProfile] = await Promise.all([
    import('jspdf'),
    getDynamicStoreProfile(),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const quotationId = generateQuotationId(booking.id);
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

  // Title — right side
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('PRICE QUOTATION', pageWidth - margin, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${quotationId}`, pageWidth - margin, 21, { align: 'right' });

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
  doc.text('QUOTATION FOR', col2, ty);
  ty += 5;

  doc.setTextColor(...darkText);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.userName, col2, ty);
  ty += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  
  if (booking.companyName) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Company: ${booking.companyName}`, col2, ty);
    doc.setFont('helvetica', 'normal');
    ty += 4;
  }

  doc.text(`Phone: ${booking.userPhone}`, col2, ty);
  ty += 4;
  
  if (booking.userEmail) {
    doc.text(`Email: ${booking.userEmail}`, col2, ty);
    ty += 4;
  }

  // Wrap delivery address
  if (booking.location) {
    const addressLines = doc.splitTextToSize(booking.location, pageWidth / 2 - margin - 5);
    doc.text(addressLines, col2, ty);
    ty += addressLines.length * 4;
  }

  y = Math.max(y, ty) + 4;

  // ─── Quotation Meta Row ─────────────────────────────────────────────────
  doc.setFillColor(248, 248, 248);
  doc.rect(margin, y, pageWidth - margin * 2, 14, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...grayText);

  const metaY = y + 5;
  doc.text('QUOTATION DATE', col1 + 3, metaY);
  doc.text('VALID UNTIL', col1 + 55, metaY);
  doc.text('EVENT TYPE', col1 + 110, metaY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkText);

  const metaVY = y + 10;
  doc.text(formatDate(booking.reviewedAt || booking.updatedAt || booking.createdAt), col1 + 3, metaVY);
  doc.text(getValidityDate(booking.reviewedAt || booking.updatedAt || booking.createdAt), col1 + 55, metaVY);
  doc.text(booking.type === 'bulk' ? 'Bulk Requirement' : 'Function / Event', col1 + 110, metaVY);

  y += 20;

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
  doc.text('PRODUCT', margin + 10, y + 5);
  doc.text('QTY', margin + 95, y + 5);
  doc.text('RATE', margin + 115, y + 5);
  doc.text('DISCOUNT', margin + 140, y + 5);
  doc.text('AMOUNT', pageWidth - margin - 3, y + 5, { align: 'right' });

  y += 12;

  // Table rows
  doc.setTextColor(...darkText);
  const items = booking.items || [];
  
  if (items.length === 0) {
    // Show single legacy spec item row
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('1', margin + 3, y);
    doc.text(booking.meatDetails || 'Custom Meat Requirement', margin + 10, y);
    doc.text(booking.quantityRequirement || '1 Nos', margin + 95, y);
    doc.text(fmtAmt(booking.quotedPrice), margin + 115, y);
    doc.text(fmtAmt(0), margin + 140, y);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtAmt(booking.quotedPrice), pageWidth - margin - 3, y, { align: 'right' });
    y += 8;
  } else {
    items.forEach((item, idx) => {
      y = checkPage(doc, y, 45);

      const itemTotal = item.lineTotal ?? ((item.unitPrice - (item.discount || 0)) * item.quantity);

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
      const maxNameW = 78;
      const itemName = doc.splitTextToSize(item.productName, maxNameW)[0];
      doc.text(itemName, margin + 10, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...grayText);
      doc.text(formatQty(item.quantity, item.unitType), margin + 95, y);
      doc.text(fmtAmt(item.unitPrice), margin + 115, y);
      doc.text(fmtAmt(item.discount || 0), margin + 140, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text(fmtAmt(itemTotal), pageWidth - margin - 3, y, { align: 'right' });

      y += 8;
    });
  }

  y += 4;

  // ═══════════════════════════════════════════════════════════════════════
  // PRICING SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  y = checkPage(doc, y, 55);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin + 90, y - 2, pageWidth - margin, y - 2);

  const sumLabelX = margin + 95;
  const sumValX = pageWidth - margin - 3;

  const subtotal = booking.subtotal ?? booking.quotedPrice ?? 0;
  const deliveryCharges = booking.deliveryCharges ?? 0;
  const additionalCharges = booking.additionalCharges ?? 0;
  const globalDiscount = booking.globalDiscount ?? 0;
  const grandTotal = booking.grandTotal ?? booking.quotedPrice ?? 0;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  doc.text('Subtotal', sumLabelX, y + 2);
  doc.setTextColor(...darkText);
  doc.text(fmtAmt(subtotal), sumValX, y + 2, { align: 'right' });
  y += 7;

  // Global Discount
  if (globalDiscount > 0) {
    doc.setTextColor(...grayText);
    doc.text('Additional Discount', sumLabelX, y);
    doc.setTextColor(22, 163, 74);
    doc.text(`-${fmtAmt(globalDiscount)}`, sumValX, y, { align: 'right' });
    y += 6;
  }

  // Delivery Charges
  doc.setTextColor(...grayText);
  doc.text('Delivery Charges', sumLabelX, y);
  doc.setTextColor(...darkText);
  doc.text(deliveryCharges === 0 ? 'FREE' : fmtAmt(deliveryCharges), sumValX, y, { align: 'right' });
  y += 6;

  // Additional Charges
  if (additionalCharges > 0) {
    doc.setTextColor(...grayText);
    doc.text('Additional Charges', sumLabelX, y);
    doc.setTextColor(...darkText);
    doc.text(fmtAmt(additionalCharges), sumValX, y, { align: 'right' });
    y += 6;
  }

  // Grand Total Box
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(sumLabelX, y, pageWidth - margin, y);
  y += 5;

  doc.setFillColor(...brandRed);
  doc.roundedRect(sumLabelX - 5, y - 4, pageWidth - margin - sumLabelX + 8, 13, 2, 2, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL', sumLabelX, y + 4);
  doc.text(fmtAmt(grandTotal), sumValX, y + 4, { align: 'right' });

  y += 18;

  // ═══════════════════════════════════════════════════════════════════════
  // TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════
  y = checkPage(doc, y, 40);
  
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 26, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandRed);
  doc.text('TERMS & CONDITIONS', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  doc.text('1. 50% advance payment is required to confirm the booking.', margin + 4, y + 10);
  doc.text('2. Balance payment is due immediately upon delivery.', margin + 4, y + 14);
  doc.text('3. This quotation is calculated based on raw weight and specifications provided.', margin + 4, y + 18);
  doc.text('4. Valid for 7 days from the date of issue. Subject to meat market price fluctuations.', margin + 4, y + 22);

  y += 33;

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  y = checkPage(doc, y, 20);

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`This is a business price quotation generated by ${storeProfile.storeName}. Values represent estimates for bulk orders.`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`For approvals: Contact us via WhatsApp on ${storeProfile.phone} or email ${storeProfile.email}`, pageWidth / 2, y, { align: 'center' });

  return doc;
}

// ─── Download & Share Quotation ────────────────────────────────────────────────
export async function downloadQuotation(booking: BulkBooking) {
  try {
    const pdfDoc = await generateQuotationPDF(booking);
    const quotationId = generateQuotationId(booking.id);
    const filename = `Kari_King_Quotation_${quotationId}.pdf`;

    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1];
      
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache,
      });
      
      await Share.share({
        title: 'Price Quotation',
        text: `Price Quotation for Booking #${booking.id.slice(-6)}`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Quotation'
      });
    } else {
      pdfDoc.save(filename);
    }
  } catch (err) {
    console.error('[Quotation] PDF generation failed:', err);
    alert('Failed to generate quotation PDF. Please try again.');
  }
}

// ─── Print Quotation ─────────────────────────────────────────────────────────
export async function printQuotation(booking: BulkBooking) {
  try {
    const pdfDoc = await generateQuotationPDF(booking);
    pdfDoc.autoPrint();
    const blobUrl = pdfDoc.output('bloburl');
    window.open(blobUrl, '_blank');
  } catch (err) {
    console.error('[Quotation] Print failed:', err);
    alert('Failed to print quotation.');
  }
}
