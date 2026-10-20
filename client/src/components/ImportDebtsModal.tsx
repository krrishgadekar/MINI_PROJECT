import React, { useState, useRef } from 'react';
import { api } from '../api';
import { useToast } from './ui/Toast';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  Loader,
  Eye,
  FileCheck,
} from 'lucide-react';

interface ImportDebtsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportDebtsModal({ isOpen, onClose, onSuccess }: ImportDebtsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setDryRunResult(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvText((event.target?.result as string) || '');
      };
      reader.readAsText(selected);
    }
  };

  const handleDryRun = async () => {
    if (!file && !csvText.trim()) {
      showError('Please select a CSV file first.');
      return;
    }

    setIsDryRunning(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else {
        formData.append('csvText', csvText);
      }

      const res = await api.debts.importCsv(formData, true);
      setDryRunResult(res);
      if (res.errorCount && res.errorCount > 0) {
        showError(`Dry run found ${res.errorCount} row error(s). Review below.`);
      } else {
        showSuccess(`Dry run passed! ${res.validCount || 0} valid debt(s) ready to import.`);
      }
    } catch (err: any) {
      showError(err.response?.data?.message || 'Dry run failed.');
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file && !csvText.trim()) {
      showError('Please select a CSV file first.');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else {
        formData.append('csvText', csvText);
      }

      const res = await api.debts.importCsv(formData, false);
      showSuccess(`Successfully imported ${res.importedCount || res.debts?.length || 0} active debts!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err.response?.data?.message || 'Failed to import debts.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Debts CSV Modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'var(--bg-secondary, #0f172a)',
          border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.15))',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--accent-subtle, rgba(124, 58, 237, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-light, #a78bfa)',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-md, 16px)', fontWeight: 700, margin: 0 }}>
                Import Debts via CSV
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', margin: '2px 0 0' }}>
                Admin bulk import with Zod row validation & dry-run preview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-primary, rgba(255, 255, 255, 0.2))',
              borderRadius: 12,
              padding: '24px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? 'var(--accent-subtle, rgba(124, 58, 237, 0.08))' : 'var(--bg-tertiary, rgba(255, 255, 255, 0.02))',
              transition: 'all 0.2s ease',
              marginBottom: 16,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <Upload size={32} color="var(--accent-light, #a78bfa)" style={{ margin: '0 auto 10px' }} />
            {file ? (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change file
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                  Click to select a CSV file
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Expected columns: <code style={{ color: 'var(--accent-light)' }}>debtor, creditor, amount, dueDate, note</code>
                </div>
              </div>
            )}
          </div>

          {/* Dry Run Preview Summary */}
          {dryRunResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--bg-elevated, rgba(255, 255, 255, 0.05))',
                    border: '1px solid var(--border-secondary)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Rows</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{dryRunResult.totalRows}</div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#4ade80' }}>Valid Debts</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', marginTop: 2 }}>
                    {dryRunResult.validCount}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: dryRunResult.errorCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: dryRunResult.errorCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-secondary)',
                  }}
                >
                  <div style={{ fontSize: 11, color: dryRunResult.errorCount > 0 ? '#f87171' : 'var(--text-muted)' }}>
                    Errors Found
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: dryRunResult.errorCount > 0 ? '#f87171' : 'var(--text-primary)',
                      marginTop: 2,
                    }}
                  >
                    {dryRunResult.errorCount}
                  </div>
                </div>
              </div>

              {/* Errors Breakdown */}
              {dryRunResult.errors && dryRunResult.errors.length > 0 && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    <AlertCircle size={16} />
                    <span>Row Validation Errors</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                    {dryRunResult.errors.map((err: any, idx: number) => (
                      <div key={idx} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 700, color: '#f87171' }}>Row {err.row}:</span> {err.errors.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid Rows Preview Table */}
              {dryRunResult.preview && dryRunResult.preview.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    <CheckCircle2 size={16} color="#4ade80" />
                    <span>Valid Debts Preview (First {dryRunResult.preview.length})</span>
                  </div>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border-secondary)', borderRadius: 8 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-secondary)' }}>
                          <th style={{ padding: '8px 12px' }}>Debtor</th>
                          <th style={{ padding: '8px 12px' }}>Creditor</th>
                          <th style={{ padding: '8px 12px' }}>Amount</th>
                          <th style={{ padding: '8px 12px' }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dryRunResult.preview.map((row: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                            <td style={{ padding: '8px 12px' }}>{row.debtorIdentifier || row.debtorId}</td>
                            <td style={{ padding: '8px 12px' }}>{row.creditorIdentifier || row.creditorId}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>₹{Number(row.amount).toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '14px 24px',
            borderTop: '1px solid var(--border-secondary, rgba(255, 255, 255, 0.08))',
            background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.02))',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isImporting || isDryRunning}>
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDryRun}
            disabled={!file || isDryRunning || isImporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-secondary)' }}
          >
            {isDryRunning ? <Loader size={16} className="animate-spin" /> : <Eye size={16} />}
            Run Dry Run Preview
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmImport}
            disabled={
              !dryRunResult ||
              dryRunResult.errorCount > 0 ||
              dryRunResult.validCount === 0 ||
              isImporting ||
              isDryRunning
            }
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isImporting ? <Loader size={16} className="animate-spin" /> : <FileCheck size={16} />}
            Confirm & Import Debts
          </button>
        </div>
      </div>
    </div>
  );
}
