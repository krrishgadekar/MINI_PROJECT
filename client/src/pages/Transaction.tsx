import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from '../api';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import { Modal, useToast, Skeleton, Badge, ConfirmDialog } from '../components/ui';
import { TaxBreakupCard, EditTaxModal } from '../components/tax';
import { setSimulate409, getSimulate409 } from '../api/mock/debts.mock';
import type { Debt, Payment, AuditEntry, PaymentKind } from '../types';
import {
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Calendar,
  ShieldCheck,
  RefreshCw,
  FileText,
  AlertTriangle,
  History,
  Edit2,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'payment' | 'audit';
  title: string;
  description: string;
  timestamp: string;
  amount?: number;
  kind?: string;
  actor?: string;
  meta?: Record<string, any>;
}

export default function Transaction() {
  const { debtId } = useParams<{ debtId: string }>();
  const queryClient = useQueryClient();
  const { merchant } = useAuth();
  const { activeGroup } = useGroup();
  const { showToast } = useToast();

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [isSettleConfirmOpen, setIsSettleConfirmOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isEditTaxModalOpen, setIsEditTaxModalOpen] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('partial');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Dispute form state
  const [disputeReason, setDisputeReason] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Concurrency 409 simulation state
  const [mock409Active, setMock409Active] = useState(getSimulate409());

  const role = activeGroup?.role ?? 'member';
  const isAdmin = role === 'admin' || role === 'owner';
  const currentUserId = merchant?.id || merchant?.name || '';

  // Fetch Debt Detail via React Query
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.debts.detail(debtId || ''),
    queryFn: () => api.debts.get(debtId || ''),
    enabled: Boolean(debtId),
  });

  const debt: Debt | undefined = data?.debt;
  const payments: Payment[] = data?.payments || [];
  const auditEntries: AuditEntry[] = data?.audit || [];

  // Helper to format names
  const getMerchantName = (m: any) => {
    if (!m) return 'Unknown';
    if (typeof m === 'string') return m.replace(/_/g, ' ');
    return m.name || m.email || m._id || 'Unknown';
  };

  const debtorName = getMerchantName(debt?.debtorId);
  const creditorName = getMerchantName(debt?.creditorId);
  const debtorIdStr = typeof debt?.debtorId === 'object' ? debt.debtorId?._id : debt?.debtorId;
  const creditorIdStr = typeof debt?.creditorId === 'object' ? debt.creditorId?._id : debt?.creditorId;
  const createdByStr = typeof debt?.createdBy === 'object' ? (debt.createdBy as any)?._id : debt?.createdBy;

  const isDebtor = debtorIdStr === currentUserId || debtorName === currentUserId;
  const isCreditor = creditorIdStr === currentUserId || creditorName === currentUserId;
  const isCreator = createdByStr === currentUserId;
  const isCounterparty = (isDebtor || isCreditor) && !isCreator;

  // Due date & overdue calculation
  const dueDateObj = debt?.dueDate ? new Date(debt.dueDate) : null;
  const isOverdue =
    dueDateObj && dueDateObj.getTime() < Date.now() && debt?.status === 'active';
  const daysOverdue = isOverdue
    ? Math.max(1, Math.ceil((Date.now() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Payable & Progress metrics (Requirement 3: partial-payment progress bar now based on payable)
  const payable = debt?.originalAmount || debt?.amount || 0;
  const remaining = debt?.amount ?? 0;
  const paid = Math.max(0, payable - remaining);
  const percentPaid = payable > 0 ? Math.min(100, Math.round((paid / payable) * 100)) : 0;
  const original = payable;

  // Editable tax condition: allowed while active/pending and no payments recorded yet (D2-C & §3)
  const isDebtEditable =
    Boolean(debt && (debt.status === 'active' || debt.status === 'pending') && payments.length === 0);
  const isTaxDebt = Boolean(debt?.taxType || (debt?.taxBreakup && debt.taxBreakup.length > 0));

  // Merge payments and audit entries chronologically
  const timeline: TimelineEvent[] = useMemo(() => {
    const list: TimelineEvent[] = [];

    payments.forEach((p) => {
      list.push({
        id: `pay-${p._id}`,
        type: 'payment',
        title: `Payment Recorded (${p.kind.toUpperCase()})`,
        description: p.note || `Payment of ₹${p.amount.toLocaleString('en-IN')}`,
        timestamp: p.createdAt || new Date().toISOString(),
        amount: p.amount,
        kind: p.kind,
        actor: getMerchantName(p.recordedBy),
      });
    });

    auditEntries.forEach((a) => {
      let desc = '';
      if (a.action === 'DEBT_CREATED') desc = `Proposed amount: ₹${a.meta?.amount || original}`;
      else if (a.action === 'DEBT_CONFIRMED') desc = 'Counterparty confirmed proposal into active graph';
      else if (a.action === 'DEBT_DISPUTED') desc = `Dispute raised: "${a.meta?.reason || 'No reason provided'}"`;
      else if (a.action === 'PAYMENT_RECORDED') desc = `Recorded payment of ₹${a.meta?.amount} (Remaining: ₹${a.meta?.remaining})`;
      else if (a.action === 'DEBT_SETTLED') desc = 'Marked settled directly';
      else desc = a.meta ? JSON.stringify(a.meta) : '';

      list.push({
        id: `aud-${a._id}`,
        type: 'audit',
        title: a.action.replace(/_/g, ' '),
        description: desc,
        timestamp: a.createdAt || new Date().toISOString(),
        actor: getMerchantName(a.actorId),
        meta: a.meta,
      });
    });

    return list.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [payments, auditEntries, original]);

  // Handle 409 Conflict helper
  const handleCasError = (err: any) => {
    const is409 =
      err?.status === 409 ||
      err?.response?.status === 409 ||
      err?.response?.data?.code === 'CONCURRENT_MODIFICATION';

    if (is409) {
      showToast('Debt changed, refreshed', 'warning');
      refetch();
      return true;
    }
    return false;
  };

  // Actions
  const handleConfirm = async () => {
    if (!debtId || isConfirming) return;
    setIsConfirming(true);
    try {
      await api.debts.confirm(debtId);
      showToast('Debt proposal confirmed and activated!', 'success');
      refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    } catch (err: any) {
      if (!handleCasError(err)) {
        showToast(err.response?.data?.message || err.message || 'Error confirming debt', 'error');
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReject = async () => {
    if (!debtId || isRejecting) return;
    setIsRejecting(true);
    try {
      await api.debts.reject(debtId);
      showToast('Debt proposal rejected and cancelled.', 'info');
      setIsRejectConfirmOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    } catch (err: any) {
      if (!handleCasError(err)) {
        showToast(err.response?.data?.message || err.message || 'Error rejecting debt', 'error');
      }
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtId || isSubmittingDispute) return;
    setIsSubmittingDispute(true);
    try {
      await api.debts.dispute(debtId, { reason: disputeReason.trim() });
      showToast('Debt flagged as disputed and excluded from settlement.', 'warning');
      setIsDisputeModalOpen(false);
      setDisputeReason('');
      refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    } catch (err: any) {
      if (!handleCasError(err)) {
        showToast(err.response?.data?.message || err.message || 'Error disputing debt', 'error');
      }
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  const handleSettle = async () => {
    if (!debtId || isSettling) return;
    setIsSettling(true);
    try {
      await api.debts.delete(debtId);
      showToast('Debt successfully settled in full.', 'success');
      setIsSettleConfirmOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    } catch (err: any) {
      if (!handleCasError(err)) {
        showToast(err.response?.data?.message || err.message || 'Error settling debt', 'error');
      }
    } finally {
      setIsSettling(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtId || !debt || isSubmittingPayment) return;

    const numAmount = parseFloat(paymentAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Enter a valid payment amount.', 'error');
      return;
    }

    if (numAmount > debt.amount) {
      showToast('Payment amount exceeds remaining debt balance.', 'error');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      // Client-side idempotency key generated per specification (BE-25)
      const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await api.debts.recordPayment(debtId, {
        amount: numAmount,
        expectedVersion: debt.version,
        kind: paymentKind,
        note: paymentNote.trim() || undefined,
        idempotencyKey,
      });

      if (res.success) {
        showToast(`Payment of ₹${numAmount.toLocaleString('en-IN')} recorded successfully!`, 'success');
        setIsPaymentModalOpen(false);
        setPaymentAmount('');
        setPaymentNote('');
        refetch();
        queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
      }
    } catch (err: any) {
      if (!handleCasError(err)) {
        showToast(err.response?.data?.message || err.message || 'Payment failed.', 'error');
      }
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const toggle409 = () => {
    const nextVal = !mock409Active;
    setSimulate409(nextVal);
    setMock409Active(nextVal);
    showToast(`409 Simulation ${nextVal ? 'ENABLED' : 'DISABLED'}`, nextVal ? 'warning' : 'info');
  };

  if (isLoading) {
    return (
      <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
        <Skeleton width="20%" height={24} style={{ marginBottom: 16 }} />
        <Skeleton height={140} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          <Skeleton height={320} />
          <Skeleton height={260} />
        </div>
      </div>
    );
  }

  if (error || !debt) {
    return (
      <div className="page-container" style={{ padding: 'var(--content-padding)', textAlign: 'center' }}>
        <div className="card" style={{ padding: 48 }}>
          <AlertOctagon size={48} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h2>Debt Transaction Not Found</h2>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 20px' }}>
            The requested debt does not exist or you lack permission to view this transaction.
          </p>
          <Link to="/ledger" className="btn btn-primary">
            <ArrowLeft size={16} /> Return to Ledger
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      {/* Top Navigation & Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Link
          to="/ledger"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-accent)',
            fontSize: 'var(--font-size-sm)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          Back to Ledger
        </Link>

        {/* 409 Concurrency test simulator toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={`btn btn-sm ${mock409Active ? 'btn-danger' : 'btn-secondary'}`}
            onClick={toggle409}
            title="Toggle simulated 409 conflict to test optimistic locking recovery"
            style={{ fontSize: 11 }}
          >
            <RefreshCw size={12} />
            {mock409Active ? 'Simulate 409: ON' : 'Simulate 409: OFF'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh transaction"
          >
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Transaction Header Card */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>
                Transaction #{debt._id.substring(debt._id.length - 8).toUpperCase()}
              </h1>
              {debt.status === 'active' && <Badge variant="success">Active</Badge>}
              {debt.status === 'pending' && <Badge variant="warning">Awaiting Approval</Badge>}
              {debt.status === 'settled' && <Badge variant="muted">Settled</Badge>}
              {debt.status === 'disputed' && <Badge variant="danger">Disputed</Badge>}
              {debt.status === 'cancelled' && <Badge variant="muted">Cancelled</Badge>}
              {isOverdue && <Badge variant="danger">Overdue by {daysOverdue}d</Badge>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--text-muted)', fontSize: 13 }}>
              <span>Version: <strong>v{debt.version}</strong></span>
              <span>•</span>
              <span>Group: <strong>{activeGroup?.name || 'Trade Circle'}</strong></span>
              <span>•</span>
              <span>Created: {new Date(debt.createdAt || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Amount Badge */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isTaxDebt ? 'Remaining Payable' : 'Remaining Debt'}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: debt.status === 'settled' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
              ₹{debt.amount.toLocaleString('en-IN')}
            </div>
            {isTaxDebt && debt.baseAmount !== undefined && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Base: ₹{debt.baseAmount.toLocaleString('en-IN')}
              </div>
            )}
            {!isTaxDebt && original !== debt.amount && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Original: ₹{original.toLocaleString('en-IN')}
              </div>
            )}
          </div>
        </div>

        {/* Repayment Progress Bar (now based on payable) */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span>
              Repayment Progress: <strong>{percentPaid}%</strong> (₹{paid.toLocaleString('en-IN')} paid of ₹{payable.toLocaleString('en-IN')} payable)
            </span>
            <span>₹{remaining.toLocaleString('en-IN')} balance</span>
          </div>
          <div
            style={{
              height: 8,
              width: '100%',
              background: 'var(--bg-tertiary)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percentPaid}%`,
                background: debt.status === 'settled' ? 'var(--text-muted)' : 'var(--accent-gradient, var(--accent-light))',
                borderRadius: 4,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Tax Breakup Card under the amounts (§3) */}
        {isTaxDebt && (
          <TaxBreakupCard
            debt={debt}
            isEditable={isDebtEditable}
            onEditTax={() => setIsEditTaxModalOpen(true)}
            style={{ marginTop: 20 }}
          />
        )}

        {/* Counterparties & Maturity Banner */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid var(--border-secondary)',
          }}
        >
          {/* Debtor Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--danger)',
                fontWeight: 700,
              }}
            >
              Dr
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Debtor (Payer)
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {debtorName} {isDebtor && <span style={{ color: 'var(--text-accent)', fontSize: 12 }}>(You)</span>}
              </div>
            </div>
          </div>

          {/* Creditor Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--success)',
                fontWeight: 700,
              }}
            >
              Cr
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Creditor (Payee)
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {creditorName} {isCreditor && <span style={{ color: 'var(--text-accent)', fontSize: 12 }}>(You)</span>}
              </div>
            </div>
          </div>

          {/* Maturity Date Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Maturity Date
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: isOverdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                {dueDateObj ? dueDateObj.toLocaleDateString() : 'No schedule set'}
              </div>
            </div>
          </div>
        </div>

        {/* Note snippet if present */}
        {debt.note && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 14px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--border-radius-sm)',
              fontSize: 13,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <FileText size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span>{debt.note}</span>
          </div>
        )}
      </div>

      {/* Two Column Layout: Payment Timeline vs Actions Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: 24, alignItems: 'flex-start' }}>
        {/* Left Column: Chronological Payment & Version Timeline */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <History size={20} color="var(--accent-light)" />
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>
              Transaction Timeline & Audit Trail
            </h3>
          </div>

          {timeline.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No payments or audit entries recorded yet.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {/* Timeline continuous vertical track */}
              <div
                style={{
                  position: 'absolute',
                  left: 7,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: 'var(--border-secondary)',
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {timeline.map((event) => {
                  const isPay = event.type === 'payment';

                  return (
                    <div key={event.id} style={{ position: 'relative' }}>
                      {/* Timeline Node Dot */}
                      <div
                        style={{
                          position: 'absolute',
                          left: -24,
                          top: 4,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: isPay ? 'var(--success)' : 'var(--accent-light)',
                          border: '3px solid var(--bg-card)',
                          boxShadow: '0 0 0 2px var(--border-secondary)',
                        }}
                      />

                      <div
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '14px 18px',
                          borderRadius: 'var(--border-radius-sm)',
                          border: '1px solid var(--border-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{event.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {event.description}
                        </p>

                        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                          {event.actor && <span>Recorded by: <strong>{event.actor}</strong></span>}
                          {event.amount && <span>Amount: <strong>₹{event.amount.toLocaleString('en-IN')}</strong></span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Status-Specific Actions Card */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 16 }}>
              Available Operations
            </h3>

            {/* Pending Debt Approval Workflow (BE-20) */}
            {debt.status === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  style={{
                    padding: 12,
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 'var(--border-radius-sm)',
                    fontSize: 12,
                    color: 'var(--warning)',
                  }}
                >
                  This debt is currently awaiting approval. Once confirmed, it will enter the active netting graph.
                </div>

                {isCounterparty || isAdmin ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {isDebtEditable && isTaxDebt && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsEditTaxModalOpen(true)}
                        style={{ justifyContent: 'center' }}
                        id="edit-tax-pending-btn"
                      >
                        <Edit2 size={16} />
                        Edit Tax Details
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleConfirm}
                      style={{ justifyContent: 'center' }}
                      id="confirm-debt-btn"
                    >
                      <CheckCircle2 size={16} />
                      {isAdmin && isCreator ? 'Force Confirm (Admin)' : 'Confirm Debt Proposal'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setIsRejectConfirmOpen(true)}
                      style={{ justifyContent: 'center', color: 'var(--danger)' }}
                      id="reject-debt-btn"
                    >
                      <XCircle size={16} />
                      Reject Proposal
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {isDebtEditable && isTaxDebt && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsEditTaxModalOpen(true)}
                        style={{ justifyContent: 'center' }}
                        id="edit-tax-pending-creator-btn"
                      >
                        <Edit2 size={16} />
                        Edit Tax Details
                      </button>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                      Awaiting confirmation by {debtorIdStr === currentUserId ? creditorName : debtorName}.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active Debt Actions: Record Payment, Dispute, Force Settle */}
            {debt.status === 'active' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isDebtEditable && isTaxDebt && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsEditTaxModalOpen(true)}
                    style={{ justifyContent: 'center' }}
                    id="edit-tax-active-btn"
                  >
                    <Edit2 size={16} />
                    Edit Tax Details
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsPaymentModalOpen(true)}
                  style={{ justifyContent: 'center' }}
                  id="record-payment-btn"
                >
                  <CreditCard size={16} />
                  Record Payment
                </button>

                {(isDebtor || isCreditor || isAdmin) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsDisputeModalOpen(true)}
                    style={{ justifyContent: 'center', color: 'var(--warning)' }}
                    id="dispute-debt-btn"
                  >
                    <AlertTriangle size={16} />
                    Dispute Transaction
                  </button>
                )}

                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsSettleConfirmOpen(true)}
                    style={{ justifyContent: 'center', color: 'var(--text-muted)' }}
                    id="settle-debt-btn"
                  >
                    Force Settle (Admin)
                  </button>
                )}
              </div>
            )}

            {/* Disputed State Notice */}
            {debt.status === 'disputed' && (
              <div
                style={{
                  padding: 14,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: 13,
                  color: 'var(--danger)',
                }}
              >
                <strong>Transaction is Disputed.</strong>
                <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                  This debt is currently excluded from algorithm cycle minimization until resolved.
                </p>
              </div>
            )}

            {/* Settled State Notice */}
            {debt.status === 'settled' && (
              <div
                style={{
                  padding: 14,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: 13,
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={18} />
                <span>Debt fully paid and cleared.</span>
              </div>
            )}
          </div>

          {/* Security & Concurrency Information Card */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <ShieldCheck size={18} color="var(--accent-light)" />
              <h4 style={{ fontSize: 13, fontWeight: 700 }}>Optimistic CAS Versioning</h4>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              All writes enforce atomic compare-and-swap on version counter (current: <strong>v{debt.version}</strong>).
              Concurrent edits or race conditions are detected and automatically safely handled with retries and conflict toasts.
            </p>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Debt Payment"
        maxWidth={480}
      >
        <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Remaining balance: <strong>₹{debt.amount.toLocaleString('en-IN')}</strong> (v{debt.version})
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
              Payment Amount (₹)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                ₹
              </span>
              <input
                type="number"
                className="form-input"
                placeholder={`Max ₹${debt.amount}`}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                max={debt.amount}
                min="1"
                step="any"
                required
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
              Payment Type
            </label>
            <select
              className="form-input"
              value={paymentKind}
              onChange={(e) => setPaymentKind(e.target.value as PaymentKind)}
            >
              <option value="partial">Partial Installment</option>
              <option value="settlement">Full Settlement</option>
              <option value="netting">Netting Credit</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
              Payment Note / Reference
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. UPI transfer #889211"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              disabled={isSubmittingPayment}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingPayment}>
              {isSubmittingPayment ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dispute Modal */}
      <Modal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        title="Dispute Transaction"
        maxWidth={460}
      >
        <form onSubmit={handleDispute} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Disputing this transaction flags the debt as contested and suspends it from netting cycles until approved by mutual consent or admin override.
          </p>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
              Reason for Dispute
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Explain the dispute reason (e.g. quantity discrepancy, damaged consignment)..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDisputeModalOpen(false)}
              disabled={isSubmittingDispute}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={isSubmittingDispute || !disputeReason.trim()}
            >
              {isSubmittingDispute ? 'Submitting...' : 'Flag as Disputed'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reject Confirmation */}
      <ConfirmDialog
        isOpen={isRejectConfirmOpen}
        title="Reject Debt Proposal"
        message="Are you sure you want to reject this trade proposal? The debt will be marked cancelled and cannot be activated."
        confirmLabel="Reject Proposal"
        cancelLabel="Go Back"
        variant="danger"
        onConfirm={handleReject}
        onClose={() => setIsRejectConfirmOpen(false)}
      />

      {/* Settle Confirmation */}
      <ConfirmDialog
        isOpen={isSettleConfirmOpen}
        title="Force Settle Debt"
        message={`Are you sure you want to mark this remaining debt of ₹${debt.amount.toLocaleString('en-IN')} as fully settled?`}
        confirmLabel="Mark Settled"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={handleSettle}
        onClose={() => setIsSettleConfirmOpen(false)}
      />
      {/* Edit Tax Modal (§3) */}
      {isTaxDebt && (
        <EditTaxModal
          isOpen={isEditTaxModalOpen}
          onClose={() => setIsEditTaxModalOpen(false)}
          debt={debt}
          domain={activeGroup?.domain}
          onSuccess={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
          }}
        />
      )}
    </div>
  );
}
