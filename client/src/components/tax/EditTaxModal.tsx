/**
 * components/tax/EditTaxModal.tsx — Reusable Tax Form & Preview Modal for Edits (§3)
 *
 * Reuses the same tax inputs, dynamic extra fields, and live TaxPreviewBox.
 * Calls api.debts.update with { baseAmount, taxType, taxInputs, expectedVersion }.
 * If blocked (409 conflict or payments recorded), displays the 409 message in a toast.
 */

import React, { useState, useEffect } from 'react';
import { Modal, useToast } from '../ui';
import { TaxPreviewBox } from './TaxPreviewBox';
import { useTaxRules, useTaxPreview } from '../../hooks/useTax';
import { api } from '../../api';
import type { Debt, TaxDomain, TaxInputDef } from '../../types';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface EditTaxModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: Debt;
  domain?: TaxDomain;
  onSuccess?: (updatedDebt: Debt) => void;
}

export const EditTaxModal: React.FC<EditTaxModalProps> = ({
  isOpen,
  onClose,
  debt,
  domain = 'gst',
  onSuccess,
}) => {
  const { showToast } = useToast();
  const effectiveDomain = domain && domain !== 'none' ? domain : 'gst';

  const [baseAmount, setBaseAmount] = useState<string>(
    String(debt.baseAmount ?? debt.amount ?? '')
  );
  const [taxType, setTaxType] = useState<string>(debt.taxType || '');
  const [taxInputs, setTaxInputs] = useState<Record<string, any>>(debt.taxInputs || {});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch rules for this domain
  const { data: rulesData, isLoading: isLoadingRules } = useTaxRules(effectiveDomain);

  // Sync state when debt changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setBaseAmount(String(debt.baseAmount ?? debt.amount ?? ''));
      const initialType = debt.taxType || (rulesData?.types?.[0]?.key ?? '');
      setTaxType(initialType);
      setTaxInputs(debt.taxInputs || {});
    }
  }, [isOpen, debt, rulesData]);

  // If taxType is not set yet, pick first rule
  useEffect(() => {
    if (rulesData?.types && rulesData.types.length > 0 && !taxType) {
      const first = rulesData.types[0];
      setTaxType(first.key);
      const defaults: Record<string, any> = {};
      first.inputs?.forEach((inp: TaxInputDef) => {
        if (inp.default !== undefined) defaults[inp.name] = inp.default;
      });
      setTaxInputs(defaults);
    }
  }, [rulesData, taxType]);

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

  // Live Tax Preview Hook (debounced 300ms)
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    error: previewError,
  } = useTaxPreview(
    taxType || undefined,
    isValidBase ? numBase : undefined,
    taxInputs
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!isValidBase) {
      showToast('Please enter a valid positive base amount.', 'error');
      return;
    }

    if (!taxType) {
      showToast('Please select a valid tax type.', 'error');
      return;
    }

    if (!previewData || isPreviewLoading || isPreviewError) {
      showToast('Please wait for the tax preview calculation to finish.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.debts.update(debt._id, {
        baseAmount: numBase,
        taxType,
        taxInputs,
        expectedVersion: debt.version,
      });

      if (res.success) {
        showToast('Tax details and payable amount updated successfully!', 'success');
        onSuccess?.(res.debt);
        onClose();
      } else {
        showToast('Failed to update tax details.', 'error');
      }
    } catch (err: any) {
      const is409 =
        err?.status === 409 ||
        err?.response?.status === 409 ||
        err?.code === 'CONCURRENT_MODIFICATION' ||
        err?.response?.data?.code === 'CONCURRENT_MODIFICATION' ||
        err?.response?.data?.code === 'PAYMENTS_ALREADY_RECORDED' ||
        err?.response?.data?.code === 'INVALID_STATUS';

      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        'Conflict: Unable to update tax details (409).';

      if (is409) {
        // Requirement 3: "show the 409 message in a toast if blocked"
        showToast(errorMsg, 'warning');
      } else {
        showToast(errorMsg, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Tax Details & Recompute Payable"
      maxWidth={520}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Banner */}
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-secondary, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} color="#60a5fa" style={{ flexShrink: 0 }} />
          <span>
            Edits update the tax breakup and adjust the payable amount (atomic CAS v{debt.version}).
            Allowed only before any payments are recorded.
          </span>
        </div>

        {/* Base Amount Input */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600 }}>
            Base Amount (₹) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: 10,
                color: 'var(--text-muted, #94a3b8)',
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
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Tax Type Selector */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600 }}>
            Tax Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          {isLoadingRules ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading tax rules...</div>
          ) : (
            <select
              className="form-input"
              value={taxType}
              onChange={(e) => handleTaxTypeChange(e.target.value)}
              required
            >
              {rulesData?.types?.map((rule) => (
                <option key={rule.key} value={rule.key}>
                  {rule.label} ({rule.effect === 'deduct' ? 'Deduct / TDS' : 'Add'})
                </option>
              ))}
            </select>
          )}
          {selectedRule?.note && (
            <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
              {selectedRule.note}
            </div>
          )}
        </div>

        {/* Dynamic Extra Inputs */}
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
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #cbd5e1)' }}>
              Rule Parameters:
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

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              isSubmitting ||
              !isValidBase ||
              !taxType ||
              !previewData ||
              isPreviewLoading ||
              isPreviewError
            }
          >
            {isSubmitting ? (
              'Updating...'
            ) : (
              <>
                <CheckCircle2 size={16} />
                Update Tax & Payable
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditTaxModal;
