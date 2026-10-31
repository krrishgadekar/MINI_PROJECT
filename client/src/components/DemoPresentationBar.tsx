import { useState, useMemo } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from '../api';
import { useToast } from './ui/Toast';
import Logo from './Logo';
import {
  Users,
  CheckCircle2,
  ChevronDown,
  Eye,
  Check,
} from 'lucide-react';
import type { Debt } from '../types';

export interface DemoMerchantInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  tradeRole: string;
  color: string;
  tagline: string;
}

export const DEMO_MERCHANTS: DemoMerchantInfo[] = [
  {
    id: '6ad99888e5b5dd4529e55708',
    name: 'Wholesale_A',
    email: 'wholesale.a@demo.com',
    role: 'Owner',
    tradeRole: 'Bulk Wholesaler',
    color: '#0d2247',
    tagline: 'Market Circle Owner · Holds Market Receivables',
  },
  {
    id: '6ad99888e5b5dd4529e55709',
    name: 'Retailer_B',
    email: 'retailer.b@demo.com',
    role: 'Admin',
    tradeRole: 'City Retail Shop',
    color: '#c8502a',
    tagline: 'Has Dues to Wholesale_A · Receives from Vendor_D',
  },
  {
    id: '6ad99888e5b5dd4529e5570b',
    name: 'Vendor_D',
    email: 'vendor.d@demo.com',
    role: 'Member',
    tradeRole: 'Cold Storage & Stock',
    color: '#1e6b4b',
    tagline: 'Owes to Retailer_B · Creditor to Wholesale_A',
  },
  {
    id: '6ad99888e5b5dd4529e5570d',
    name: 'Farmer_F',
    email: 'farmer.f@demo.com',
    role: 'Member',
    tradeRole: 'Produce Farmer',
    color: '#c27814',
    tagline: 'Direct Agriculture Supplier · Creditor to Stall_G',
  },
  {
    id: '6ad99888e5b5dd4529e5570e',
    name: 'Stall_G',
    email: 'stall.g@demo.com',
    role: 'Member',
    tradeRole: 'Market Retail Stall',
    color: '#9333ea',
    tagline: 'Has Dues to Farmer_F · Receives from Buyer_H',
  },
  {
    id: '6ad99888e5b5dd4529e5570a',
    name: 'Supplier_C',
    email: 'supplier.c@demo.com',
    role: 'Member',
    tradeRole: 'Packaging & Equipment',
    color: '#0891b2',
    tagline: 'Transacts with Logistics_E and Wholesale_A',
  },
  {
    id: '6ad99888e5b5dd4529e5570c',
    name: 'Logistics_E',
    email: 'logistics.e@demo.com',
    role: 'Member',
    tradeRole: 'Freight & Transport',
    color: '#2563eb',
    tagline: 'Mutual Trade Offset with Supplier_C',
  },
  {
    id: '6ad99888e5b5dd4529e5570f',
    name: 'Buyer_H',
    email: 'buyer.h@demo.com',
    role: 'Member',
    tradeRole: 'Bulk Supermarket Buyer',
    color: '#0d9488',
    tagline: 'Buyer · Owes to Stall_G',
  },
];

export default function DemoPresentationBar() {
  const { merchant, switchMerchant, isSwitching } = useAuth();
  const { activeGroupId } = useGroup();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDualModalOpen, setIsDualModalOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  // Load debts for current group to detect active payables for the current merchant
  const { data: debtsData, refetch: refetchDebts } = useQuery({
    queryKey: queryKeys.debts.list({ activeGroupId, limit: 50 }),
    queryFn: () => api.debts.list({ limit: 50 }),
    enabled: Boolean(activeGroupId),
  });

  const currentMerchantName = merchant?.name || 'Wholesale_A';
  const currentMerchantInfo =
    DEMO_MERCHANTS.find((m) => m.name === currentMerchantName || m.email === merchant?.email) ||
    DEMO_MERCHANTS[0];

  // Find all active debts where the current merchant is the debtor (owes money)
  const activePayables = useMemo(() => {
    const list = debtsData?.debts || [];
    return list.filter((d: Debt) => {
      if (d.status !== 'active') return false;
      const debtorName =
        typeof d.debtorId === 'object' ? d.debtorId?.name : d.debtorId;
      const debtorId =
        typeof d.debtorId === 'object' ? d.debtorId?._id : d.debtorId;
      return (
        debtorName === currentMerchantName ||
        debtorId === merchant?.id ||
        debtorName === merchant?.id
      );
    });
  }, [debtsData, currentMerchantName, merchant]);

  // Primary payable to highlight (e.g. Retailer_B owing Wholesale_A)
  const primaryDue = activePayables[0];

  const handleSwitchAccount = async (targetEmail: string, targetName: string) => {
    if (isSwitching || targetEmail === merchant?.email) return;
    try {
      await switchMerchant(targetEmail);
      setIsDropdownOpen(false);
      // Invalidate all react queries to immediately update UI
      queryClient.invalidateQueries();
      toast.success(`Active persona: ${targetName}. Ledgers and topology updated.`);
    } catch (err: any) {
      toast.error('Failed to switch demo account: ' + err.message);
    }
  };

  const handlePayDue = async (amount: number, kind: 'settlement' | 'partial' = 'partial') => {
    if (!primaryDue || isPaying) return;
    try {
      setIsPaying(true);
      const idempotencyKey = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await api.debts.recordPayment(primaryDue._id, {
        amount,
        kind,
        note: `Paid during faculty presentation demo by ${currentMerchantName}`,
        idempotencyKey,
      });

      toast.success(
        `Settled ₹${amount.toLocaleString('en-IN')}! Balance updated in MongoDB ledger.`,
      );

      // Invalidate queries so that books, ledger, and graph update
      await queryClient.invalidateQueries();
      refetchDebts();
    } catch (err: any) {
      toast.error('Payment failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsPaying(false);
    }
  };

  // Find Wholesale_A and Retailer_B for dual view
  const wholesaleRetailerDebt = useMemo(() => {
    const list = debtsData?.debts || [];
    return list.find((d: Debt) => {
      const dName = typeof d.debtorId === 'object' ? d.debtorId?.name : d.debtorId;
      const cName = typeof d.creditorId === 'object' ? d.creditorId?.name : d.creditorId;
      return (
        (dName === 'Retailer_B' && cName === 'Wholesale_A') ||
        (dName === 'Wholesale_A' && cName === 'Retailer_B')
      );
    });
  }, [debtsData]);

  return (
    <>
      {/* Floating Architectural Ribbon / Pill Bar */}
      <div
        className="demo-presentation-bar"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid #dcd5cb',
          borderRadius: 4,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: '0 2px 10px rgba(13, 24, 41, 0.05)',
          zIndex: 50,
          position: 'sticky',
          top: 10,
          marginBottom: 20,
        }}
      >
        {/* Left Section: Illoca Architectural Stamp & Active Merchant */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Geometric brand mark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingRight: 10,
              borderRight: '1px solid #e8e2d8',
            }}
          >
            <Logo size={22} />

            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#0d2247',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Demo Showcase
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Account:
            </span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                background: '#f4f0eb',
                border: '1px solid #dcd5cb',
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: currentMerchantInfo.color,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0d1829',
                }}
              >
                {currentMerchantInfo.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                }}
              >
                · {currentMerchantInfo.tradeRole}
              </span>
            </div>
          </div>
        </div>

        {/* Center Section: Quick Persona Switch Stamps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              marginRight: 2,
            }}
          >
            Switch:
          </span>

          {DEMO_MERCHANTS.slice(0, 4).map((m) => {
            const isCurrent = m.name === currentMerchantName;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSwitchAccount(m.email, m.name)}
                disabled={isSwitching || isCurrent}
                style={{
                  background: isCurrent ? '#0d2247' : '#ffffff',
                  color: isCurrent ? '#ffffff' : '#424d5d',
                  border: isCurrent ? '1px solid #0d2247' : '1px solid #dcd5cb',
                  padding: '4px 10px',
                  borderRadius: 2,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  fontWeight: isCurrent ? 700 : 500,
                  cursor: isCurrent ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s ease',
                  opacity: isSwitching ? 0.6 : 1,
                }}
                title={m.tagline}
              >
                <span>{m.name}</span>
                {isCurrent && <Check size={11} color="#c8502a" />}
              </button>
            );
          })}

          {/* More Accounts Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                background: '#ffffff',
                color: '#424d5d',
                border: '1px solid #dcd5cb',
                padding: '4px 8px',
                borderRadius: 2,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>+4 MORE</span>
              <ChevronDown size={11} />
            </button>

            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  background: '#ffffff',
                  border: '1px solid #0d2247',
                  borderRadius: 2,
                  padding: 4,
                  minWidth: 230,
                  boxShadow: '0 12px 30px rgba(13, 24, 41, 0.12)',
                  zIndex: 100,
                }}
              >
                {DEMO_MERCHANTS.map((m) => {
                  const isCur = m.name === currentMerchantName;
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSwitchAccount(m.email, m.name)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isCur ? '#f4f0eb' : 'transparent',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCur) e.currentTarget.style.background = '#faf8f4';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCur) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            background: m.color,
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: '#0d1829' }}>{m.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {m.tradeRole}
                          </div>
                        </div>
                      </div>
                      {isCur && <Check size={13} color="#c8502a" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Due Settlement Quick Action & Dual Comparison View */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {primaryDue ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(200, 80, 42, 0.08)',
                border: '1px solid rgba(200, 80, 42, 0.3)',
                padding: '3px 8px',
                borderRadius: 2,
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                <span style={{ color: '#c8502a', fontWeight: 700 }}>DUE: </span>
                <span style={{ fontWeight: 700, color: '#0d1829' }}>
                  ₹{primaryDue.amount.toLocaleString('en-IN')}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: 4 }}>
                  → {typeof primaryDue.creditorId === 'object' ? primaryDue.creditorId?.name : primaryDue.creditorId}
                </span>
              </div>

              {/* Illoca-style button with Terracotta Icon Accent */}
              <button
                type="button"
                onClick={() => handlePayDue(primaryDue.amount, 'settlement')}
                disabled={isPaying}
                style={{
                  background: '#0d2247',
                  color: '#ffffff',
                  border: '1px solid #0d2247',
                  padding: '4px 10px',
                  borderRadius: 2,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isPaying ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    background: '#c8502a',
                    borderRadius: 1,
                  }}
                />
                <span>{isPaying ? 'Settling...' : 'Pay & Settle'}</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: '#1e6b4b',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(30, 107, 75, 0.08)',
                border: '1px solid rgba(30, 107, 75, 0.25)',
                padding: '4px 8px',
                borderRadius: 2,
              }}
            >
              <CheckCircle2 size={12} />
              <span>All Clear (₹0 Due)</span>
            </div>
          )}

          {/* Dual Perspective Compare Button */}
          <button
            type="button"
            onClick={() => setIsDualModalOpen(true)}
            style={{
              background: '#ffffff',
              color: '#0d2247',
              border: '1px solid #0d2247',
              padding: '4px 10px',
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
            title="Compare Wholesaler and Retailer accounts side-by-side"
          >
            <Eye size={12} />
            <span>Compare Accounts</span>
          </button>
        </div>
      </div>

      {/* Dual Perspective Modal — Architectural Split Blueprint */}
      {isDualModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(13, 24, 41, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setIsDualModalOpen(false)}
        >
          <div
            style={{
              maxWidth: 820,
              width: '100%',
              padding: 24,
              background: '#ffffff',
              border: '1px solid #0d2247',
              borderRadius: 4,
              boxShadow: '0 20px 50px rgba(13, 24, 41, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                borderBottom: '1px solid #dcd5cb',
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: '#c8502a',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}
                >
                  Dual-Ledger Sync
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#0d2247',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <Users size={18} color="#0d2247" />
                  <span>Dual Account View: Wholesaler vs. Retailer</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 4 }}>
                  See how transactions synchronize between merchant accounts in real-time.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDualModalOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid #dcd5cb',
                  borderRadius: 2,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Split Comparison Columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                marginBottom: 20,
              }}
            >
              {/* Wholesale_A Column */}
              <div
                style={{
                  background: '#faf8f4',
                  border: '1px solid #dcd5cb',
                  borderRadius: 2,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 2,
                      background: '#0d2247',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                    }}
                  >
                    WH
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0d1829' }}>
                      Wholesale_A
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      BULK DISTRIBUTOR (CREDITOR)
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e8e2d8', paddingTop: 12 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    RECEIVABLE EXPECTED:
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      color: '#1e6b4b',
                      margin: '4px 0',
                    }}
                  >
                    ₹{wholesaleRetailerDebt ? wholesaleRetailerDebt.amount.toLocaleString('en-IN') : '0'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    From: Retailer_B (Invoice #INV-401)
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 2,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background:
                          wholesaleRetailerDebt?.status === 'settled'
                            ? 'rgba(30, 107, 75, 0.1)'
                            : 'rgba(13, 34, 71, 0.08)',
                        color:
                          wholesaleRetailerDebt?.status === 'settled' ? '#1e6b4b' : '#0d2247',
                        border: '1px solid currentColor',
                      }}
                    >
                      STATUS: {wholesaleRetailerDebt ? wholesaleRetailerDebt.status.toUpperCase() : 'SETTLED'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleSwitchAccount('wholesale.a@demo.com', 'Wholesale_A');
                    setIsDualModalOpen(false);
                  }}
                  style={{
                    width: '100%',
                    marginTop: 14,
                    background: '#0d2247',
                    color: '#ffffff',
                    border: '1px solid #0d2247',
                    padding: '8px 12px',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  VIEW AS WHOLESALE_A
                </button>
              </div>

              {/* Retailer_B Column */}
              <div
                style={{
                  background: '#faf8f4',
                  border: '1px solid #dcd5cb',
                  borderRadius: 2,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 2,
                      background: '#c8502a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                    }}
                  >
                    RE
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0d1829' }}>
                      Retailer_B
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      RETAIL STORE (DEBTOR)
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e8e2d8', paddingTop: 12 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    PAYABLE DUE:
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      color: '#c8502a',
                      margin: '4px 0',
                    }}
                  >
                    ₹{wholesaleRetailerDebt ? wholesaleRetailerDebt.amount.toLocaleString('en-IN') : '0'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Owed to: Wholesale_A
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 2,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background:
                          wholesaleRetailerDebt?.status === 'settled'
                            ? 'rgba(30, 107, 75, 0.1)'
                            : 'rgba(200, 80, 42, 0.1)',
                        color:
                          wholesaleRetailerDebt?.status === 'settled' ? '#1e6b4b' : '#c8502a',
                        border: '1px solid currentColor',
                      }}
                    >
                      STATUS: {wholesaleRetailerDebt ? wholesaleRetailerDebt.status.toUpperCase() : 'SETTLED'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleSwitchAccount('retailer.b@demo.com', 'Retailer_B');
                    setIsDualModalOpen(false);
                  }}
                  style={{
                    width: '100%',
                    marginTop: 14,
                    background: '#ffffff',
                    color: '#c8502a',
                    border: '1px solid #c8502a',
                    padding: '8px 12px',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  VIEW AS RETAILER_B
                </button>
              </div>
            </div>

            {/* Explanation Note for Faculty Presentation */}
            <div
              style={{
                background: '#f4f0eb',
                border: '1px solid #dcd5cb',
                borderRadius: 2,
                padding: '12px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: '#0d2247' }}>[PRESENTATION NOTE]:</strong>{' '}
              CreditFlow maintains double-entry network integrity across isolated accounts. When Retailer_B clicks &quot;Pay & Settle&quot;, state updates in MongoDB with optimistic version locking, and the Network Graph dynamically recalculates obligations.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
