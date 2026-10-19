import React, { useState, useEffect } from 'react';
import { Modal, useToast } from './ui';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import { api } from '../api';
import { seedData } from '../data/seedData';
import type { Debt } from '../types';
import { AlertCircle, User, Calendar, FileText, CheckCircle2 } from 'lucide-react';

interface AddDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newDebt: Debt) => void;
}

interface MemberOption {
  id: string;
  name: string;
  email?: string;
}

export default function AddDebtModal({ isOpen, onClose, onSuccess }: AddDebtModalProps) {
  const { merchant } = useAuth();
  const { activeGroupId } = useGroup();
  const { showToast } = useToast();

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [merchantSearch, setMerchantSearch] = useState<string>('');
  const [direction, setDirection] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch available counterparties from group members
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchMembers = async () => {
      try {
        if (activeGroupId) {
          const res = await api.groups.get(activeGroupId);
          if (isMounted && res.success && res.members) {
            const mapped: MemberOption[] = res.members.map((m: any) => ({
              id: m.merchantId?._id || m.merchantId || m.id,
              name: m.name || m.merchantId?.name || `Merchant ${m.merchantId || m.id}`,
              email: m.email || m.merchantId?.email,
            }));
            // Filter out self
            const filtered = mapped.filter((m) => m.id !== merchant?.id);
            if (filtered.length > 0) {
              setMembers(filtered);
              setSelectedMerchantId(filtered[0].id);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Could not load group members for modal, falling back to mock merchants:', err);
      }

      // Fallback to seedData merchants for mock / standalone demo
      if (isMounted) {
        const fallback = seedData.merchants
          .filter((name) => name !== merchant?.name)
          .map((name) => ({ id: name, name: name.replace(/_/g, ' ') }));
        setMembers(fallback);
        if (fallback.length > 0) {
          setSelectedMerchantId(fallback[0].id);
        }
      }
    };

    fetchMembers();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeGroupId, merchant]);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(merchantSearch.toLowerCase()) ||
      (m.email && m.email.toLowerCase().includes(merchantSearch.toLowerCase())),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchantId) {
      showToast('Please select a merchant counterparty.', 'error');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid positive debt amount.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const myId = merchant?.id || merchant?.name || 'CurrentUser';
      const debtorId = direction === 'i_owe' ? myId : selectedMerchantId;
      const creditorId = direction === 'they_owe' ? myId : selectedMerchantId;

      const res = await api.debts.create({
        debtorId,
        creditorId,
        amount: numAmount,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        note: note.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'Debt request created in "Pending" state. Awaiting counterparty approval.',
          'success',
        );
        onSuccess?.(res.debt);
        // Reset form
        setAmount('');
        setNote('');
        setDueDate('');
        onClose();
      } else {
        showToast('Failed to create debt request.', 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Error creating debt request.';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Trade Debt Proposal"
      maxWidth={540}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Trust & approval notice banner */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--accent-primary-dim)',
            border: '1px solid var(--accent-primary-border)',
            borderRadius: 'var(--border-radius-sm)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <AlertCircle size={20} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-accent)' }}>
              Awaiting Counterparty Approval
            </span>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
              Peer-to-peer debts start in <span className="status-badge status-pending" style={{ padding: '2px 6px', fontSize: 11 }}>pending</span> status.
              The counterparty must confirm before it becomes active and included in settlement cycle netting.
            </p>
          </div>
        </div>

        {/* Direction Toggle */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Transaction Direction
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              className={`btn ${direction === 'they_owe' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDirection('they_owe')}
              style={{ justifyContent: 'center', fontSize: 'var(--font-size-sm)' }}
            >
              They Owe Me (Receivable)
            </button>
            <button
              type="button"
              className={`btn ${direction === 'i_owe' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDirection('i_owe')}
              style={{ justifyContent: 'center', fontSize: 'var(--font-size-sm)' }}
            >
              I Owe Them (Payable)
            </button>
          </div>
        </div>

        {/* Counterparty Search & Select */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Counterparty Merchant
          </label>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search group members..."
              value={merchantSearch}
              onChange={(e) => setMerchantSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
            <User
              size={16}
              style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
            />
          </div>

          <select
            className="form-input"
            value={selectedMerchantId}
            onChange={(e) => setSelectedMerchantId(e.target.value)}
            required
            size={Math.min(4, Math.max(2, filteredMembers.length))}
            style={{ width: '100%', height: 'auto', padding: 6 }}
          >
            {filteredMembers.map((m) => (
              <option key={m.id} value={m.id} style={{ padding: '8px 10px' }}>
                {m.name} {m.email ? `(${m.email})` : ''}
              </option>
            ))}
            {filteredMembers.length === 0 && (
              <option disabled value="">
                No matching group members found
              </option>
            )}
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Principal Amount (₹)
          </label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: 10,
                color: 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              ₹
            </span>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 25000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="any"
              required
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Due Date Input */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Due Date (Optional)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="date"
              className="form-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
            <Calendar
              size={16}
              style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
            />
          </div>
        </div>

        {/* Note / Memo */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Invoice / Trade Note (Optional)
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              className="form-input"
              rows={2}
              placeholder="e.g. Produce delivery batch #408, net 30 terms"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ paddingLeft: 34, resize: 'vertical' }}
            />
            <FileText
              size={16}
              style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || !selectedMerchantId}>
            {isSubmitting ? (
              'Submitting...'
            ) : (
              <>
                <CheckCircle2 size={16} />
                Submit Proposal
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
