import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, queryKeys } from '../api';
import { useGroup } from '../state/GroupProvider';
import { Skeleton, Badge, EmptyState } from '../components/ui';
import type { AuditEntry } from '../types';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  FileText,
  Filter,
} from 'lucide-react';

export default function Activity() {
  const { activeGroup, activeGroupId } = useGroup();

  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.audit.list({ activeGroupId, selectedEntityType, currentPage }),
    queryFn: async () => {
      const params: any = {
        page: currentPage,
        limit: 15,
      };
      if (selectedEntityType !== 'all') {
        params.entityType = selectedEntityType;
      }
      return api.audit.list(params);
    },
    enabled: Boolean(activeGroupId),
  });

  const auditLogs: AuditEntry[] = data?.audit || [];

  const getActionIcon = (action: string) => {
    if (action.includes('PAYMENT')) return <CreditCard size={18} color="var(--success)" />;
    if (action.includes('CONFIRM')) return <CheckCircle2 size={18} color="var(--accent-light)" />;
    if (action.includes('REJECT') || action.includes('CANCEL'))
      return <XCircle size={18} color="var(--danger)" />;
    if (action.includes('DISPUTE')) return <AlertTriangle size={18} color="var(--warning)" />;
    if (action.includes('RISK')) return <RefreshCw size={18} color="var(--accent-primary)" />;
    return <FileText size={18} color="var(--text-muted)" />;
  };

  const formatActor = (actor: any) => {
    if (!actor) return 'System';
    if (typeof actor === 'string') return actor.replace(/_/g, ' ');
    return actor.name || actor.email || actor._id || 'Unknown';
  };

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      {/* Top Header */}
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
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Audit Activity Feed</h1>
            <Badge variant="primary">{activeGroup?.name || 'Active Group'}</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Immutable event log of all debt proposals, payment receipts, disputes, and risk recalculations in this trade group.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter Chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Filter size={14} /> Filter Entity:
        </span>
        {[
          { id: 'all', label: 'All Entities' },
          { id: 'Debt', label: 'Debts' },
          { id: 'Payment', label: 'Payments' },
          { id: 'Settlement', label: 'Settlement' },
          { id: 'RiskAssessment', label: 'Risk' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn-sm ${selectedEntityType === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setSelectedEntityType(tab.id);
              setCurrentPage(1);
            }}
            style={{ fontSize: 12, borderRadius: 16, padding: '3px 12px' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Audit Log Card Feed */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '16px 0',
                  borderBottom: '1px solid var(--border-secondary)',
                }}
              >
                <div style={{ width: '60%' }}>
                  <Skeleton height={18} style={{ marginBottom: 6 }} />
                  <Skeleton width="40%" height={14} />
                </div>
                <Skeleton width={80} height={24} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
            <AlertTriangle size={32} style={{ marginBottom: 8 }} />
            <p>Failed to load audit logs: {(error as any)?.message || 'Unknown error'}</p>
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              title="No audit entries found"
              description="No audit trail events matching this filter exist in the current trade group."
            />
          </div>
        ) : (
          <div>
            {auditLogs.map((log) => {
              const entityIdStr = typeof log.entityId === 'object' ? (log.entityId as any)?._id : log.entityId;
              const isDebtEntity = log.entityType === 'Debt' || log.entityType === 'debt';

              return (
                <div
                  key={log._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-secondary)',
                    transition: 'background 0.15s ease',
                  }}
                  className="audit-item-hover"
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 'var(--border-radius-sm)',
                        background: 'var(--bg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {getActionIcon(log.action)}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-accent)',
                          }}
                        >
                          {log.entityType}
                        </span>
                      </div>

                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        By <strong>{formatActor(log.actorId)}</strong>
                        {log.meta?.amount && (
                          <span style={{ marginLeft: 8 }}>
                            • Amount: <strong>₹{Number(log.meta.amount).toLocaleString('en-IN')}</strong>
                          </span>
                        )}
                        {log.meta?.reason && (
                          <span style={{ marginLeft: 8, fontStyle: 'italic' }}>
                            • "{log.meta.reason}"
                          </span>
                        )}
                        {log.meta?.status && (
                          <span style={{ marginLeft: 8 }}>
                            • Status: <strong>{log.meta.status}</strong>
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(log.createdAt || Date.now()).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Deep link button if debt entity */}
                  {isDebtEntity && entityIdStr && (
                    <Link
                      to={`/ledger/${entityIdStr}`}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0 }}
                    >
                      View Debt
                      <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer pagination */}
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
            Showing <strong>{auditLogs.length}</strong> events
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
            <span>Page {currentPage}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={auditLogs.length < 15}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
