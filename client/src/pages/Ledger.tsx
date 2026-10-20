import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, queryKeys } from '../api';
import { useAuth } from '../state/AuthProvider';
import { useGroup } from '../state/GroupProvider';
import AddDebtModal from '../components/AddDebtModal';
import ImportDebtsModal from '../components/ImportDebtsModal';
import { Skeleton, Badge, EmptyState } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import type { Debt } from '../types';
import {
  Plus,
  Search,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Upload,
  Loader,
} from 'lucide-react';

type TabStatus = 'all' | 'active' | 'pending' | 'overdue' | 'settled' | 'disputed';
type SortField = 'createdAt' | 'amount' | 'dueDate';
type SortOrder = 'asc' | 'desc';

export default function Ledger() {
  const navigate = useNavigate();
  const { merchant } = useAuth();
  const { activeGroup, activeGroupId } = useGroup();
  const { success: showToastSuccess, error: showToastError } = useToast();

  const [activeTab, setActiveTab] = useState<TabStatus>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const role = activeGroup?.role ?? 'member';
  const isAdmin = role === 'admin' || role === 'owner';
  const effectiveScope = isAdmin ? scope : 'mine';

  const sortParam = `${sortField}:${sortOrder}`;

  // Fetch debts via React Query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.debts.list({
      activeGroupId,
      effectiveScope,
      activeTab,
      sortParam,
      searchQuery,
      currentPage,
    }),
    queryFn: async () => {
      const params: any = {
        scope: effectiveScope,
        page: currentPage,
        limit: 15,
        sort: sortParam,
      };

      if (activeTab !== 'all') {
        params.status = activeTab;
      }

      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }

      return api.debts.list(params);
    },
    enabled: Boolean(activeGroupId),
  });

  const debts: Debt[] = data?.debts || [];
  const totalPages = data?.totalPages || 1;
  const totalDebts = data?.total ?? debts.length;

  // Calculate quick summary metrics
  const myId = merchant?.id || merchant?.name || '';
  const metrics = useMemo(() => {
    let receivables = 0;
    let payables = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    const now = Date.now();

    debts.forEach((d) => {
      const debtorId = typeof d.debtorId === 'object' ? d.debtorId?._id || d.debtorId?.name : d.debtorId;
      const creditorId = typeof d.creditorId === 'object' ? d.creditorId?._id || d.creditorId?.name : d.creditorId;

      if (d.status === 'pending') {
        pendingCount++;
      }

      if (d.dueDate && new Date(d.dueDate).getTime() < now && d.status === 'active') {
        overdueCount++;
      }

      if (d.status === 'active') {
        if (creditorId === myId) {
          receivables += d.amount;
        }
        if (debtorId === myId) {
          payables += d.amount;
        }
      }
    });

    return { receivables, payables, pendingCount, overdueCount };
  }, [debts, myId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getStatusBadge = (debt: Debt) => {
    const isPastDue =
      debt.dueDate && new Date(debt.dueDate).getTime() < Date.now() && debt.status === 'active';

    if (isPastDue) {
      return (
        <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          Overdue
        </span>
      );
    }

    switch (debt.status) {
      case 'active':
        return <span className="status-badge status-active">Active</span>;
      case 'pending':
        return <span className="status-badge status-pending">Pending Approval</span>;
      case 'settled':
        return <span className="status-badge status-settled">Settled</span>;
      case 'disputed':
        return (
          <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            Disputed
          </span>
        );
      case 'cancelled':
        return <span className="status-badge status-netted">Cancelled</span>;
      default:
        return <span className="status-badge">{debt.status}</span>;
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const blob = await api.debts.exportCsv(
        activeTab !== 'all' ? activeTab : undefined,
        effectiveScope
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debts_${activeGroup?.name || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToastSuccess('CSV export downloaded successfully!');
    } catch {
      showToastError('Failed to export debts CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  const formatMerchantName = (m: any) => {
    if (!m) return 'Unknown';
    if (typeof m === 'string') return m.replace(/_/g, ' ');
    return m.name || m.email || m._id || 'Unknown';
  };

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Trade Debt Ledger</h1>
            <Badge variant="primary">{activeGroup?.name || 'Active Group'}</Badge>
            {isAdmin ? (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg-tertiary)', color: 'var(--text-accent)' }}>
                Admin View
              </span>
            ) : (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                Ego-network
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Peer-to-peer receivables and payables, optimistic version locking, counterparty approvals, and click-through transaction logs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-tertiary)',
                padding: 3,
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              <button
                type="button"
                className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setScope('all')}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                All Group Debts
              </button>
              <button
                type="button"
                className={`btn btn-sm ${scope === 'mine' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setScope('mine')}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                My Debts Only
              </button>
            </div>
          )}

          {/* Export CSV Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCsv}
            disabled={isExporting}
            id="export-debts-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            aria-label="Export debts as CSV"
          >
            {isExporting ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
            Export CSV
          </button>

          {/* Admin Import CSV Button */}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsImportModalOpen(true)}
              id="import-debts-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              aria-label="Import debts from CSV"
            >
              <Upload size={15} />
              Import CSV
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAddModalOpen(true)}
            id="add-debt-btn"
            aria-label="Add a new debt obligation"
          >
            <Plus size={16} aria-hidden="true" />
            Add Debt
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18, borderLeft: '3px solid var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span>My Receivables</span>
            <TrendingUp size={16} color="var(--success)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--success)' }}>
            ₹{metrics.receivables.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Owed to you by counterparties</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '3px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span>My Payables</span>
            <TrendingDown size={16} color="var(--warning)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--warning)' }}>
            ₹{metrics.payables.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>You owe to creditors</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '3px solid var(--accent-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span>Pending Approvals</span>
            <Clock size={16} color="var(--accent-light)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {metrics.pendingCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Awaiting counterparty confirmation</div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '3px solid var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span>Overdue Debts</span>
            <AlertTriangle size={16} color="var(--danger)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--danger)' }}>
            {metrics.overdueCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Exceeded maturity schedule</div>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tabs Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-secondary)',
            padding: '12px 20px',
            gap: 12,
            background: 'var(--bg-secondary)',
          }}
        >
          <div role="tablist" aria-label="Filter debts by status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'active', label: 'Active' },
                { id: 'pending', label: 'Pending' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'settled', label: 'Settled' },
                { id: 'disputed', label: 'Disputed' },
                { id: 'all', label: 'All Debts' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-label={`Show ${tab.label} debts`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 13, borderRadius: 20, padding: '4px 12px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: 260 }}>
            <label htmlFor="ledger-search" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}>Search debts</label>
            <input
              id="ledger-search"
              type="search"
              className="form-input"
              placeholder="Search debtor, creditor, note..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Search debts by debtor, creditor, or note"
              style={{ paddingLeft: 32, height: 34, fontSize: 13 }}
            />
            <Search
              size={14}
              aria-hidden="true"
              style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }}
            />
          </div>
        </div>

        {/* Debts Table */}
        {isLoading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-secondary)' }}>
                <Skeleton height={20} />
                <Skeleton height={20} />
                <Skeleton height={20} />
                <Skeleton height={20} />
                <Skeleton height={20} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
            <AlertTriangle size={32} style={{ marginBottom: 10 }} />
            <p>Failed to load debts: {(error as any)?.message || 'Unknown error'}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()} style={{ marginTop: 12 }}>
              Retry
            </button>
          </div>
        ) : debts.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              title={`No ${activeTab === 'all' ? '' : activeTab} debts found`}
              description={
                searchQuery
                  ? 'No debts match your search query.'
                  : 'There are currently no debts in this category for this trade group.'
              }
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsAddModalOpen(true)}
                  style={{ marginTop: 12 }}
                >
                  Create Debt Proposal
                </button>
              }
            />
          </div>
        ) : (
          <div className="data-table-wrapper" style={{ margin: 0 }}>
            <table className="data-table" aria-label="Debt obligations ledger">
              <thead>
                <tr>
                  <th style={{ width: '22%' }} scope="col">Debtor (Payer)</th>
                  <th style={{ width: '22%' }} scope="col">Creditor (Payee)</th>
                  <th
                    style={{ width: '18%', cursor: 'pointer' }}
                    onClick={() => handleSort('amount')}
                    scope="col"
                    aria-sort={sortField === 'amount' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit' }} aria-label="Sort by amount">
                      Remaining / Original
                      <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th style={{ width: '15%' }} scope="col">Status</th>
                  <th
                    style={{ width: '15%', cursor: 'pointer' }}
                    onClick={() => handleSort('dueDate')}
                    scope="col"
                    aria-sort={sortField === 'dueDate' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit' }} aria-label="Sort by due date">
                      Due Date
                      <ArrowUpDown size={13} aria-hidden="true" />
                    </button>
                  </th>
                  <th style={{ width: '8%', textAlign: 'right' }} scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((debt) => {
                  const debtorName = formatMerchantName(debt.debtorId);
                  const creditorName = formatMerchantName(debt.creditorId);
                  const isDebtor = debtorName === formatMerchantName(merchant);
                  const isCreditor = creditorName === formatMerchantName(merchant);

                  return (
                    <tr
                      key={debt._id}
                      onClick={() => navigate(`/ledger/${debt._id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/ledger/${debt._id}`); }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View debt ₹${debt.amount.toLocaleString('en-IN')} from ${debtorName} to ${creditorName}, status: ${debt.status}`}
                      style={{ cursor: 'pointer' }}
                      className="ledger-row-hover"
                    >
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>
                            {debtorName} {isDebtor && <span style={{ fontSize: 11, color: 'var(--text-accent)' }}>(You)</span>}
                          </span>
                          {debt.note && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                              {debt.note}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>
                            {creditorName} {isCreditor && <span style={{ fontSize: 11, color: 'var(--text-accent)' }}>(You)</span>}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            v{debt.version}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            ₹{debt.amount.toLocaleString('en-IN')}
                          </span>
                          {debt.originalAmount && debt.originalAmount !== debt.amount && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                              ₹{debt.originalAmount.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{getStatusBadge(debt)}</td>
                      <td>
                        {debt.dueDate ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <Calendar size={13} color="var(--text-muted)" />
                            <span>{new Date(debt.dueDate).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No date</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ledger/${debt._id}`);
                          }}
                          style={{ padding: 6 }}
                          title="Open Transaction Detail"
                          aria-label={`Open transaction detail for debt ${debt._id}`}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-secondary)',
            background: 'var(--bg-secondary)',
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            Showing <strong>{debts.length}</strong> of <strong>{totalDebts}</strong> debts
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add Debt Modal */}
      <AddDebtModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Admin CSV Import Modal */}
      <ImportDebtsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
