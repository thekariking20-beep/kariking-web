import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, Mail, Phone, MapPin, Clock, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type TabType = 'privacy' | 'terms';

// ─── Collapsible Section ──────────────────────────────────────────────────────
function Section({ title, number, children, defaultOpen = false }: { 
  title: string; number: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-white bg-[#7A0000] w-6 h-6 rounded-lg flex items-center justify-center">
            {number}
          </span>
          <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed space-y-3 border-t border-gray-50 pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PrivacyTerms() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>(
    location.hash === '#terms' ? 'terms' : 'privacy'
  );

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      {/* ── Sticky Header ───────────────────────────────────────────── */}
      <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-20 shadow-[0_2px_10px_rgba(0,0,0,0.05)] border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black text-gray-900 leading-none">Legal</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#7A0000] to-[#5A0000] flex items-center justify-center mb-3 shadow-lg shadow-red-900/20">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black text-gray-900">Legal Policies</h2>
          <p className="text-xs text-gray-400 mt-1.5 font-medium">Last updated: April 13, 2026</p>
        </div>

        {/* ── Tab Switcher ──────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
          <button
            onClick={() => setActiveTab('privacy')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              activeTab === 'privacy'
                ? "bg-[#7A0000] text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Shield className="w-4 h-4" /> Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              activeTab === 'terms'
                ? "bg-[#7A0000] text-white shadow-md"
                : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <FileText className="w-4 h-4" /> Terms & Conditions
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            PRIVACY POLICY TAB
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'privacy' && (
          <motion.div
            key="privacy"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800 font-medium leading-relaxed">
              At <strong>Kari King</strong>, your privacy is our priority. This policy explains what data we collect, how we use it, and your rights regarding your personal information.
            </div>

            <Section number="1" title="Information We Collect" defaultOpen>
              <p><strong>Personal Information:</strong> When you create an account, we collect your mobile phone number for OTP-based authentication. During profile setup, we may collect your name and delivery address.</p>
              <p><strong>Location Data:</strong> We collect your delivery address coordinates only when you explicitly save a delivery location — used solely to facilitate accurate doorstep delivery and calculate delivery fees.</p>
              <p><strong>Order Data:</strong> We store your order history, items purchased, payment method used, and delivery details to provide order tracking and customer support.</p>
              <p><strong>Payment Information:</strong> We do <strong>not</strong> store your credit card, debit card, or UPI details. All payments are processed via direct UPI QR code scanning. Your UTR (transaction reference) is stored solely for payment verification purposes.</p>
              <p><strong>Device Information:</strong> We may collect device type, browser version, and push notification tokens (FCM) to send order status updates.</p>
            </Section>

            <Section number="2" title="How We Use Your Information">
              <p>We use the collected information strictly for:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Authenticating your identity via OTP verification</li>
                <li>Processing and delivering your orders</li>
                <li>Sending real-time order status notifications</li>
                <li>Providing customer support and resolving disputes</li>
                <li>Calculating delivery fees based on your location</li>
                <li>Managing the Kari Coins loyalty rewards system</li>
                <li>Improving our services and user experience</li>
              </ul>
              <p className="text-xs text-gray-500 mt-2">We will <strong>never</strong> sell, rent, or trade your personal data to any third party for marketing purposes.</p>
            </Section>

            <Section number="3" title="Data Sharing">
              <p>We share your data only in these limited cases:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Delivery Partners:</strong> Your name, phone number, and delivery address are shared with assigned delivery personnel to complete your delivery.</li>
                <li><strong>Payment Verification:</strong> Your UTR (transaction reference number) is stored to verify UPI payments. No sensitive payment credentials are retained.</li>
                <li><strong>Legal Compliance:</strong> We may disclose data if required by Indian law, regulation, or court order.</li>
              </ul>
            </Section>

            <Section number="4" title="Data Security">
              <p>We implement industry-standard security measures:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Firebase Authentication with OTP-based login (no passwords stored for regular users)</li>
                <li>All data transmitted over HTTPS/TLS encryption</li>
                <li>Firestore security rules restricting data access to authorized users only</li>
                <li>Client-side rate limiting to prevent abuse and brute-force attacks</li>
                <li>Admin access restricted to verified dashboard users</li>
              </ul>
            </Section>

            <Section number="5" title="Cookies & Local Storage">
              <p>We use browser local storage to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Maintain your logged-in session (Firebase Auth persistence)</li>
                <li>Store your shopping cart contents locally</li>
                <li>Track security-related rate limiting counters</li>
              </ul>
              <p>We do <strong>not</strong> use third-party tracking cookies or advertising pixels.</p>
            </Section>

            <Section number="6" title="Your Rights">
              <p>You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information via your profile</li>
                <li><strong>Deletion:</strong> Request account deletion by contacting us at <a href="mailto:thekariking20@gmail.com" className="text-[#7A0000] font-bold underline">thekariking20@gmail.com</a></li>
                <li><strong>Opt-out:</strong> Disable push notifications from your browser settings at any time</li>
              </ul>
            </Section>

            <Section number="7" title="Data Retention">
              <p>We retain your personal data for as long as your account is active. Order history is retained for accounting and legal compliance for a period of 3 years from the order date.</p>
              <p>Upon account deletion, all personal data is permanently removed from our systems within 30 days, except where retention is required by law.</p>
            </Section>

            <Section number="8" title="Children's Privacy">
              <p>Kari King is not intended for use by individuals under 18 years of age. We do not knowingly collect personal information from minors. If we learn that we have inadvertently collected data from a child, we will delete it promptly.</p>
            </Section>

            <Section number="9" title="Changes to This Policy">
              <p>We may update this Privacy Policy from time to time. Any changes will be reflected on this page with an updated "Last updated" date. Continued use of the app after changes constitutes acceptance of the revised policy.</p>
            </Section>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TERMS & CONDITIONS TAB
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'terms' && (
          <motion.div
            key="terms"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800 font-medium leading-relaxed">
              By using <strong>Kari King</strong> (app.kariking.in), you agree to be bound by these Terms & Conditions. Please read them carefully before placing any order.
            </div>

            <Section number="1" title="Acceptance of Terms" defaultOpen>
              <p>By accessing or using Kari King's web application, creating an account, or placing an order, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions, along with our Privacy Policy.</p>
              <p>If you do not agree to these Terms, you must not use the platform.</p>
            </Section>

            <Section number="2" title="Account & Authentication">
              <p>To use Kari King, you must register using a valid Indian mobile phone number (+91). Authentication is performed via OTP (One-Time Password) or admin-assigned password for staff accounts.</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You are responsible for maintaining the confidentiality of your account</li>
                <li>One account per mobile number is allowed</li>
                <li>You must provide accurate delivery information</li>
                <li>Kari King reserves the right to suspend accounts engaged in fraudulent or abusive activity</li>
              </ul>
            </Section>

            <Section number="3" title="Ordering & Pricing">
              <p><strong>Product Availability:</strong> All products are subject to availability. We reserve the right to limit quantities or discontinue any product without prior notice.</p>
              <p><strong>Pricing:</strong> Meat prices may fluctuate based on daily market rates. The price displayed at the time of checkout is the final confirmed price for your order.</p>
              <p><strong>Minimum Order:</strong> Certain offers and free delivery thresholds (currently ₹500) apply. Delivery charges of ₹40 apply on orders below the threshold.</p>
              <p><strong>Accuracy:</strong> We strive to ensure all product descriptions, weights, and images are accurate. Minor variations in appearance may occur as these are natural, fresh products.</p>
            </Section>

            <Section number="4" title="Payment Terms">
              <p>Kari King supports the following payment methods:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>UPI QR Payment:</strong> Scan the QR code and pay via any UPI app (GPay, PhonePe, Paytm). Submit your 12-digit UTR for manual verification by our team.</li>
                <li><strong>Kari Coins:</strong> Use earned loyalty coins (1 coin = ₹20 value) to partially or fully pay for orders.</li>
              </ul>
              <p className="font-bold text-gray-700">Cash on Delivery (COD) is NOT available.</p>
              <p>All prices are in Indian Rupees (₹) and inclusive of applicable taxes unless stated otherwise.</p>
            </Section>

            <Section number="5" title="Kari Coins (Loyalty Rewards)">
              <p>Kari Coins are a loyalty reward system:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>1 Kari Coin = ₹20 monetary value</li>
                <li>Coins can be earned via referrals and promotional campaigns</li>
                <li>Coins can be used to discount orders (partially or fully)</li>
                <li>Coins have no cash withdrawal value and cannot be transferred</li>
                <li>Kari King reserves the right to modify or discontinue the coins program</li>
                <li>Fraudulent attempts to manipulate coins will result in immediate account suspension</li>
              </ul>
            </Section>

            <Section number="6" title="Delivery Policy">
              <p><strong>Delivery Area:</strong> We currently deliver within our designated service area. Your delivery eligibility is determined by the address you provide.</p>
              <p><strong>Delivery Time:</strong> We aim to deliver within 60 minutes of order confirmation. Actual delivery time may vary based on order volume, weather conditions, and traffic.</p>
              <p><strong>Receiving Orders:</strong> You or an authorized person must be available at the delivery address to receive the order. If delivery cannot be completed due to customer unavailability, the order may be marked as delivered after reasonable attempts.</p>
              <p><strong>Delivery Charges:</strong> Orders above ₹500 qualify for free delivery. A flat ₹40 delivery fee applies to smaller orders.</p>
            </Section>

            <Section number="7" title="Cancellation & Refund Policy">
              <p><strong>Cancellation:</strong> Since we deal in fresh, perishable meat products, orders cannot be cancelled once packed or dispatched. You may request cancellation only before the order is packed.</p>
              <p><strong>Refund Eligibility:</strong> Refunds are considered only if:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Wrong items were delivered</li>
                <li>Products arrived in a damaged or spoiled condition</li>
                <li>Significant quantity discrepancy from what was ordered</li>
              </ul>
              <p><strong>Refund Process:</strong> Contact us at <a href="mailto:thekariking20@gmail.com" className="text-[#7A0000] font-bold underline">thekariking20@gmail.com</a> within 30 minutes of delivery with photographic evidence. Valid claims will be refunded to the original payment method within 5-7 business days, or credited as Kari Coins.</p>
              <p><strong>No Refunds For:</strong> Change of mind, incorrect address provided by the customer, or unavailability to receive the order.</p>
            </Section>

            <Section number="8" title="Quality Assurance">
              <p>We are committed to delivering only the freshest products:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>All meat is sourced fresh daily from trusted suppliers</li>
                <li>Products are cleaned, cut, and packed under hygienic conditions</li>
                <li>Cold chain is maintained during storage and delivery</li>
                <li>We encourage customers to refrigerate products immediately upon receipt</li>
              </ul>
            </Section>

            <Section number="9" title="Prohibited Activities">
              <p>You agree NOT to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Use the platform for any illegal or unauthorized purpose</li>
                <li>Attempt to hack, reverse-engineer, or compromise our systems</li>
                <li>Create multiple accounts for fraudulent coin/referral manipulation</li>
                <li>Place fake or prank orders</li>
                <li>Harass or abuse delivery partners or customer support staff</li>
                <li>Resell products purchased through Kari King for commercial purposes</li>
              </ul>
              <p>Violation of these terms may result in permanent account suspension without refund.</p>
            </Section>

            <Section number="10" title="Intellectual Property">
              <p>All content on the Kari King platform including logos, text, graphics, images, and software is the property of Kari King and is protected by applicable intellectual property laws. You may not reproduce, distribute, or modify any content without our prior written consent.</p>
            </Section>

            <Section number="11" title="Limitation of Liability">
              <p>To the maximum extent permitted by law, Kari King shall not be liable for:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Delays caused by events beyond our control (force majeure, weather, strikes)</li>
                <li>Any indirect, incidental, or consequential damages</li>
                <li>Losses arising from unauthorized access to your account due to your negligence</li>
              </ul>
              <p>Our total liability for any claim shall not exceed the value of the specific order in question.</p>
            </Section>

            <Section number="12" title="Governing Law & Disputes">
              <p>These Terms are governed by the laws of India. Any disputes arising from the use of Kari King shall be subject to the exclusive jurisdiction of the courts in Tamil Nadu, India.</p>
              <p>We encourage customers to first contact us directly to resolve any disputes amicably before pursuing legal remedies.</p>
            </Section>

            <Section number="13" title="Changes to Terms">
              <p>Kari King reserves the right to modify these Terms and Conditions at any time. Updated terms will be published on this page. Continued use of the platform after modifications constitutes acceptance of the revised terms.</p>
            </Section>
          </motion.div>
        )}

        {/* ── Contact Card ──────────────────────────────────────────── */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h4 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#7A0000]" /> Contact Us
          </h4>
          <div className="space-y-3">
            <a href="mailto:thekariking20@gmail.com" className="flex items-center gap-3 text-sm text-gray-600 hover:text-[#7A0000] transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <Mail className="w-4 h-4 text-[#7A0000]" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-xs">Email</p>
                <p className="text-gray-500">thekariking20@gmail.com</p>
              </div>
            </a>
            <a href="tel:+916380886374" className="flex items-center gap-3 text-sm text-gray-600 hover:text-[#7A0000] transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Phone className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-xs">Phone</p>
                <p className="text-gray-500">+91 6380886374</p>
              </div>
            </a>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-xs">Website</p>
                <a href="https://app.kariking.in" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#7A0000] transition-colors flex items-center gap-1">
                  app.kariking.in <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer Branding ──────────────────────────────────────── */}
        <div className="text-center mt-8 pb-4">
          <p className="text-[11px] text-gray-300 font-medium tracking-widest">© 2026 Kari King. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
