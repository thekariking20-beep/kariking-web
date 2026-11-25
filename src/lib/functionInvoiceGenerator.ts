import { BulkBooking } from '../types';
import { getDynamicStoreProfile } from './storeProfile';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── ID Generators ───────────────────────────────────────────────────────────
function generateQuotationId(bookingId: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = bookingId.slice(-6).toUpperCase();
  return `KK-FNQT-${year}${month}-${suffix}`;
}

function generateInvoiceId(bookingId: string): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = bookingId.slice(-6).toUpperCase();
  return `KK-FNINV-${year}${month}-${suffix}`;
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

// ─── Base PDF Builder ────────────────────────────────────────────────────────
async function generatePDF(booking: BulkBooking, isInvoice: boolean) {
  const [{ default: jsPDF }, storeProfile] = await Promise.all([
    import('jspdf'),
    getDynamicStoreProfile(),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const documentId = isInvoice ? generateInvoiceId(booking.id) : generateQuotationId(booking.id);
  const margin = 18;
  let y = 0;

  // Colors
  const brandRed: [number, number, number] = [122, 0, 0];
  const darkText: [number, number, number] = [30, 30, 30];
  const grayText: [number, number, number] = [120, 120, 120];
  const lightGray: [number, number, number] = [245, 245, 245];
  const white: [number, number, number] = [255, 255, 255];
  const greenText: [number, number, number] = [22, 163, 74];

  // Header Bar
  doc.setFillColor(...brandRed);
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(storeProfile.storeName.toUpperCase(), margin, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(storeProfile.tagline, margin, 21);

  // Document Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(isInvoice ? 'TAX INVOICE' : 'FUNCTION QUOTATION', pageWidth - margin, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${documentId}`, pageWidth - margin, 21, { align: 'right' });

  y = 40;

  // FROM / TO Columns
  const col1 = margin;
  const col2 = pageWidth / 2 + 8;

  // FROM (synced from Admin Business Settings)
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

  // TO
  let ty = 40;
  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(isInvoice ? 'BILLED TO' : 'QUOTATION FOR', col2, ty);
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

  // Wrap Event Address if available
  const eventFullAddress = [
    booking.eventAddress,
    booking.eventArea,
    booking.eventCity,
    booking.eventPincode ? `Pin: ${booking.eventPincode}` : ''
  ].filter(Boolean).join(', ');

  const deliveryDest = eventFullAddress || booking.location;
  if (deliveryDest) {
    doc.setFont('helvetica', 'bold');
    doc.text('Event Address:', col2, ty);
    doc.setFont('helvetica', 'normal');
    ty += 4;
    const addressLines = doc.splitTextToSize(deliveryDest, pageWidth / 2 - margin - 5);
    doc.text(addressLines, col2, ty);
    ty += addressLines.length * 4;
  }

  y = Math.max(y, ty) + 6;

  // ─── Event Specs Meta Row ────────────────────────────────────────────────
  doc.setFillColor(248, 248, 248);
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...grayText);

  const metaY = y + 5;
  doc.text(isInvoice ? 'INVOICE DATE' : 'QUOTATION DATE', col1 + 3, metaY);
  doc.text('EVENT TYPE', col1 + 45, metaY);
  doc.text('EVENT DATE & TIME', col1 + 95, metaY);
  doc.text('GUEST BREAKDOWN', col1 + 140, metaY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkText);

  const metaVY = y + 10;
  const docDate = isInvoice 
    ? (booking.completedAt || booking.updatedAt || booking.createdAt) 
    : (booking.reviewedAt || booking.updatedAt || booking.createdAt);
  
  doc.text(formatDate(docDate), col1 + 3, metaVY);
  doc.text(booking.functionType || 'General Function', col1 + 45, metaVY);
  
  const evDate = booking.eventDate ? formatDate(booking.eventDate) : formatDate(booking.requiredDate);
  const evTime = booking.eventTime || booking.deliveryTime || '—';
  doc.text(`${evDate} @ ${evTime}`, col1 + 95, metaVY);

  // Guest breakdown string
  const adults = booking.adultCount || booking.peopleCount || 0;
  const children = booking.childrenCount || 0;
  const veg = booking.vegCount || 0;
  const nonveg = booking.nonVegCount || 0;
  
  doc.text(`Total: ${adults + children} pax`, col1 + 140, metaVY);
  
  // Second line of meta details (detailed breakdown)
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayText);
  const metaVY2 = y + 15;
  
  doc.text(`Adults: ${adults} | Children: ${children}`, col1 + 140, metaVY2);
  doc.text(`Veg: ${veg} | Non-Veg: ${nonveg}`, col1 + 140, metaVY2 + 4);

  if (booking.deliveryDate) {
    doc.text(`Delivery Date: ${formatDate(booking.deliveryDate)}`, col1 + 3, metaVY2);
  }

  y += 28;

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
  doc.text('PRODUCT REQUIREMENT', margin + 10, y + 5);
  doc.text('QTY', margin + 95, y + 5);
  doc.text('RATE', margin + 115, y + 5);
  doc.text('DISCOUNT', margin + 140, y + 5);
  doc.text('AMOUNT', pageWidth - margin - 3, y + 5, { align: 'right' });

  y += 12;

  // Table rows
  doc.setTextColor(...darkText);
  const items = booking.items || [];

  if (items.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('1', margin + 3, y);
    doc.text(booking.meatDetails || 'Event Meat Requirement', margin + 10, y);
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
  y = checkPage(doc, y, 65);

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
  y += 13;

  // Advance Payments (if invoice or if quoted price exists)
  if (booking.quotedPrice && booking.advanceAmount) {
    doc.setFontSize(8);
    
    // Advance Paid Status
    doc.setTextColor(...grayText);
    doc.text('Advance Paid (50%)', sumLabelX, y);
    doc.setTextColor(...(booking.advancePaid ? greenText : brandRed));
    doc.text(`${booking.advancePaid ? 'PAID' : 'PENDING'} ${fmtAmt(booking.advanceAmount)}`, sumValX, y, { align: 'right' });
    y += 5;

    // Balance Due
    doc.setTextColor(...grayText);
    doc.text(isInvoice ? 'Balance Amount' : 'Balance Due on Delivery', sumLabelX, y);
    doc.setTextColor(...darkText);
    const balance = grandTotal - (booking.advancePaid ? booking.advanceAmount : 0);
    doc.text(fmtAmt(balance), sumValX, y, { align: 'right' });
    y += 6;
  }

  y += 6;

  // Special Instructions
  if (booking.specialInstructions) {
    y = checkPage(doc, y, 25);
    doc.setFillColor(254, 252, 232); // Light yellow box
    doc.setDrawColor(254, 240, 138);
    const boxH = 14;
    doc.roundedRect(margin, y, pageWidth - margin * 2, boxH, 1, 1, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(161, 98, 7);
    doc.text('SPECIAL INSTRUCTIONS', margin + 3, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...darkText);
    doc.text(booking.specialInstructions, margin + 3, y + 9);
    y += boxH + 8;
  }

  // ─── Terms and Conditions ───────────────────────────────────────────────
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
  doc.text('1. 50% advance payment is required to confirm the function booking.', margin + 4, y + 10);
  doc.text('2. Balance payment must be settled upon or before delivery of goods.', margin + 4, y + 14);
  doc.text('3. Quantities are finalized 48 hours before the event date.', margin + 4, y + 18);
  doc.text('4. Valid for 7 days. Pricing is subject to live market rates.', margin + 4, y + 22);

  y += 33;

  // ─── Footer ─────────────────────────────────────────────────────────────
  y = checkPage(doc, y, 20);

  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(...grayText);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(isInvoice ? `Thank you for choosing ${storeProfile.storeName} to cater your function!` : `This is a quotation generated by ${storeProfile.storeName} for event catering.`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`For any changes: Contact us via WhatsApp on ${storeProfile.phone} or email ${storeProfile.email}`, pageWidth / 2, y, { align: 'center' });

  return doc;
}

// ─── Public Actions for Quotation ──────────────────────────────────────────
export async function downloadFunctionQuotation(booking: BulkBooking) {
  try {
    const pdfDoc = await generatePDF(booking, false);
    const quotationId = generateQuotationId(booking.id);
    const filename = `Kari_King_Function_Quotation_${quotationId}.pdf`;

    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: 'Function Quotation',
        text: `Function Quotation for Booking #${booking.id.slice(-6)}`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Quotation'
      });
    } else {
      pdfDoc.save(filename);
    }
  } catch (err) {
    console.error('[Function Quotation] PDF generation failed:', err);
    alert('Failed to generate quotation PDF. Please try again.');
  }
}

export async function printFunctionQuotation(booking: BulkBooking) {
  try {
    const pdfDoc = await generatePDF(booking, false);
    pdfDoc.autoPrint();
    const blobUrl = pdfDoc.output('bloburl');
    window.open(blobUrl, '_blank');
  } catch (err) {
    console.error('[Function Quotation] Print failed:', err);
    alert('Failed to print quotation.');
  }
}

// ─── Public Actions for Invoice ─────────────────────────────────────────────
export async function downloadFunctionInvoice(booking: BulkBooking) {
  try {
    const pdfDoc = await generatePDF(booking, true);
    const invoiceId = generateInvoiceId(booking.id);
    const filename = `Kari_King_Function_Invoice_${invoiceId}.pdf`;

    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1];
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: 'Tax Invoice',
        text: `Tax Invoice for Function Booking #${booking.id.slice(-6)}`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Invoice'
      });
    } else {
      pdfDoc.save(filename);
    }
  } catch (err) {
    console.error('[Function Invoice] PDF generation failed:', err);
    alert('Failed to generate invoice PDF. Please try again.');
  }
}

export async function printFunctionInvoice(booking: BulkBooking) {
  try {
    const pdfDoc = await generatePDF(booking, true);
    pdfDoc.autoPrint();
    const blobUrl = pdfDoc.output('bloburl');
    window.open(blobUrl, '_blank');
  } catch (err) {
    console.error('[Function Invoice] Print failed:', err);
    alert('Failed to print invoice.');
  }
}
