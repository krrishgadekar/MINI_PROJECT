import React, { useState, useEffect } from 'react';
import { Modal, useToast } from './ui';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import { api } from '../api';
import { seedData } from '../data/seedData';
import { TaxPreviewBox } from './tax/TaxPreviewBox';
import { useTaxRules, useTaxPreview } from '../hooks/useTax';
import type { Debt, TaxDomain, TaxInputDef } from '../types';
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
  const { activeGroupId, activeGroup } = useGroup();
  const { showToast } = useToast();

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [merchantSearch, setMerchantSearch] = useState<string>('');
  const [direction, setDirection] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fetchedGroupDomain, setFetchedGroupDomain] = useState<TaxDomain>('none');

  // Tax form state for tax groups
  const [baseAmount, setBaseAmount] = useState<string>('');
  const [taxType, setTaxType] = useState<string>('');
  const [taxInputs, setTaxInputs] = useState<Record<string, any>>({});

  // Active domain: fallback to fetched domain from group API
  const groupDomain: TaxDomain = activeGroup?.domain || fetchedGroupDomain || 'none';
  const isTaxGroup = groupDomain !== 'none';

  // Tax rules query for active domain
  const { data: rulesData, isLoading: isLoadingRules } = useTaxRules(
    isTaxGroup ? groupDomain : undefined
  );

  // Auto-select initial tax type and initialize default inputs
  useEffect(() => {
    if (isTaxGroup && rulesData?.types && rulesData.types.length > 0 && !taxType) {
      const firstRule = rulesData.types[0];
      setTaxType(firstRule.key);
      const initialInputs: Record<string, any> = {};
      firstRule.inputs?.forEach((inp: TaxInputDef) => {
        if (inp.default !== undefined) {
          initialInputs[inp.name] = inp.default;
        }
      });
      setTaxInputs(initialInputs);
    }
  }, [isTaxGroup, rulesData, taxType]);

  const selectedRule = rulesData?.types?.find((t) => t.key === taxType);

  const handleTaxTypeChange = (newType: string) => {
    setTaxType(newType);
    const rule = rulesData?.types?.find((t) => t.key === newType);
    const nextInputs: Record<string, any> = {};
    rule?.inputs?.forEach((inp: TaxInputDef) => {
      if (inp.default !== undefined) {
        nextInputs[inp.name] = inp.default;
      }
    });
    setTaxInputs(nextInputs);
  };

  const handleInputChange = (name: string, value: any) => {
    setTaxInputs((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const numBase = parseFloat(baseAmount);
  const isValidBase = !isNaN(numBase) && numBase > 0;

  // Live tax preview query (debounced 300ms)
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    error: previewError,
  } = useTaxPreview(
    isTaxGroup && taxType ? taxType : undefined,
    isTaxGroup && isValidBase ? numBase : undefined,
    taxInputs
  );

  // Fetch available counterparties and group domain
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchMembers = async () => {
      try {
        if (activeGroupId) {
          const res = await api.groups.get(activeGroupId);
          if (isMounted && res.success) {
            if (res.group?.domain) {
              setFetchedGroupDomain(res.group.domain);
            }
            if (res.members) {
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
      (m.email && m.email.toLowerCase().includes(merchantSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedMerchantId) {
      showToast('Please select a merchant counterparty.', 'error');
      return;
    }

    const myId = merchant?.id || merchant?.name || 'CurrentUser';
    const debtorId = direction === 'i_owe' ? myId : selectedMerchantId;
    const creditorId = direction === 'they_owe' ? myId : selectedMerchantId;

    if (isTaxGroup) {
      if (!isValidBase) {
        showToast('Please enter a valid positive base amount.', 'error');
        return;
      }
      if (!taxType) {
        showToast('Please select a tax type.', 'error');
        return;
      }
      if (!previewData || isPreviewLoading || isPreviewError) {
        showToast('Please wait for the live tax preview calculation to succeed.', 'warning');
        return;
      }

      setIsSubmitting(true);
      try {
        // Send baseAmount, taxType, taxInputs (never amount)
        const res = await api.debts.create({
          debtorId,
          creditorId,
          baseAmount: numBase,
          taxType,
          taxInputs,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          note: note.trim() || undefined,
        });

        if (res.success) {
          showToast(
            'Taxed debt proposal created in "Pending" state. Awaiting counterparty approval.',
            'success'
          );
          onSuccess?.(res.debt);
          setBaseAmount('');
          setNote('');
          setDueDate('');
          onClose();
        } else {
          showToast('Failed to create debt proposal.', 'error');
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Error creating debt request.';
        showToast(msg, 'error');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Legacy untaxed flow ('none' group): keep untouched
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        showToast('Please enter a valid positive debt amount.', 'error');
        return;
      }

      setIsSubmitting(true);
      try {
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
            'success'
          );
          onSuccess?.(res.debt);
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
    }
  };

  const isSubmitDisabled =
    isSubmitting ||
    !selectedMerchantId ||
    (isTaxGroup
      ? !isValidBase || !taxType || !previewData || isPreviewLoading || isPreviewError
      : !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isTaxGroup ? `Create Taxed Debt Proposal (${groupDomain.toUpperCase()})` : "Create Trade Debt Proposal"}
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

        {/* Amount Input: Either Tax Form (Base + Tax Type + Inputs + Live Preview) OR Legacy Amount */}
        {isTaxGroup ? (
          <>
            {/* Base Amount */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                Base Amount (₹) <span style={{ color: '#ef4444' }}>*</span>
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
                  placeholder="e.g. 10000"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  min="1"
                  step="any"
                  required
                  id="add-debt-base-amount"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            {/* Tax Type Selector */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                Tax Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              {isLoadingRules ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading rules for {groupDomain}...</div>
              ) : (
                <select
                  className="form-input"
                  value={taxType}
                  onChange={(e) => handleTaxTypeChange(e.target.value)}
                  required
                  id="add-debt-tax-type"
                >
                  {rulesData?.types?.map((rule) => (
                    <option key={rule.key} value={rule.key}>
                      {rule.label} ({rule.effect === 'deduct' ? 'Deduct / TDS' : 'Add'})
                    </option>
                  ))}
                </select>
              )}
              {selectedRule?.note && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {selectedRule.note}
                </div>
              )}
            </div>

            {/* Extra inputs from rule definition */}
            {selectedRule?.inputs && selectedRule.inputs.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.04))',
                  borderRadius: 6,
                  border: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Rule Inputs ({selectedRule.label}):
                </div>
                {selectedRule.inputs.map((inp: TaxInputDef) => {
                  if (inp.type === 'select') {
                    return (
                      <div key={inp.name}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                          {inp.label}
                        </label>
                        <select
                          className="form-input"
                          value={taxInputs[inp.name] ?? inp.default ?? ''}
                          onChange={(e) => handleInputChange(inp.name, Number(e.target.value))}
                        >
                          {inp.options?.map((opt) => (
                            <option key={String(opt)} value={opt}>
                              {opt}%
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (inp.type === 'number') {
                    return (
                      <div key={inp.name}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                          {inp.label}
                        </label>
                        <input
                          type="number"
                          className="form-input"
                          value={taxInputs[inp.name] ?? inp.default ?? 0}
                          onChange={(e) => handleInputChange(inp.name, parseFloat(e.target.value))}
                          step="any"
                        />
                      </div>
                    );
                  }

                  if (inp.type === 'boolean') {
                    return (
                      <label
                        key={inp.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          cursor: 'pointer',
                          marginTop: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(taxInputs[inp.name])}
                          onChange={(e) => handleInputChange(inp.name, e.target.checked)}
                          style={{ width: 16, height: 16 }}
                        />
                        <span>{inp.label}</span>
                      </label>
                    );
                  }

                  return null;
                })}
              </div>
            )}

            {/* Live Tax Preview Box */}
            {isValidBase && taxType && (
              <TaxPreviewBox
                preview={previewData}
                isLoading={isPreviewLoading}
                error={previewError as Error | null}
              />
            )}
          </>
        ) : (
          /* Legacy single Amount field for domain 'none' groups untouched */
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
        )}

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
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitDisabled}
            id="add-debt-submit-btn"
          >
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
