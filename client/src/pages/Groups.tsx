/**
 * pages/Groups.tsx — Groups & Tenancy Management (Slice A / Chetan)
 *
 * Implements FE-03 & FE-04:
 *   - Lists user's groups with role badges (owner, admin, member)
 *   - Allows switching active group (persisted in localStorage and synced to GroupProvider)
 *   - Create Group modal (market, supply_chain, friends, other)
 *   - Join Group modal (by invite code)
 *   - Members table with role change and member removal (admin/owner only)
 *   - Copy invite code to clipboard and rotate invite code
 *   - Zero-groups empty state guidance
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  LogIn,
  Copy,
  Check,
  RefreshCw,
  Crown,
  Shield,
  User,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import type { EnrichedMembership } from '../api/mock/groups.mock';
import type { Group, Role, GroupType } from '../types';
import { useGroup } from '../state/GroupProvider';
import { useAuth } from '../state/AuthProvider';
import { Badge, Modal, useToast } from '../components/ui';
import type { BadgeVariant } from '../components/ui';

export default function Groups() {
  const { activeGroupId, setActiveGroup } = useGroup();
  const { reload: reloadAuth } = useAuth();
  const toast = useToast();

  const [groups, setGroups] = useState<(Group & { role?: Role })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedGroup, setSelectedGroup] = useState<(Group & { role?: Role }) | null>(null);

  // Members state
  const [members, setMembers] = useState<EnrichedMembership[]>([]);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form states
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('market');
  const [creating, setCreating] = useState<boolean>(false);

  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [joining, setJoining] = useState<boolean>(false);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [updatingMid, setUpdatingMid] = useState<string | null>(null);
  const [removingMid, setRemovingMid] = useState<string | null>(null);

  // Fetch all groups
  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.groups.list();
      setGroups(res.groups);
      if (res.groups.length > 0) {
        // Select active group or first group
        const current = res.groups.find((g) => g._id === activeGroupId) || res.groups[0];
        setSelectedGroup(current);
      } else {
        setSelectedGroup(null);
      }
    } catch (err: any) {
      toast.error('Failed to load groups: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [activeGroupId, toast]);

  // Load members for selected group
  const loadMembers = useCallback(
    async (groupId: string) => {
      try {
        setMembersLoading(true);
        const res = await api.groups.getMembers(groupId);
        setMembers(res.members);
      } catch (err: any) {
        toast.error('Failed to load members: ' + err.message);
      } finally {
        setMembersLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (selectedGroup?._id) {
      loadMembers(selectedGroup._id);
    } else {
      setMembers([]);
    }
  }, [selectedGroup?._id, loadMembers]);

  // Copy invite code
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Invite code ${code} copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Rotate invite code
  const handleRotateCode = async (group: Group) => {
    try {
      setRotatingId(group._id);
      const res = await api.groups.rotateInviteCode(group._id);
      toast.success(`New invite code generated: ${res.inviteCode}`);
      await loadGroups();
      if (selectedGroup?._id === group._id) {
        setSelectedGroup((prev) => (prev ? { ...prev, inviteCode: res.inviteCode } : null));
      }
    } catch (err: any) {
      toast.error('Failed to rotate invite code: ' + err.message);
    } finally {
      setRotatingId(null);
    }
  };

  // Create Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (!newGroupName.trim()) {
      toast.warning('Group name is required');
      return;
    }

    try {
      setCreating(true);
      const res = await api.groups.create({
        name: newGroupName.trim(),
        type: newGroupType,
      });
      toast.success(`Group "${res.group.name}" created successfully!`);
      setShowCreateModal(false);
      setNewGroupName('');
      setActiveGroup(res.group._id);
      reloadAuth();
      await loadGroups();
    } catch (err: any) {
      toast.error('Failed to create group: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Join Group
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;
    if (!inviteCodeInput.trim()) {
      toast.warning('Invite code is required');
      return;
    }

    try {
      setJoining(true);
      const res = await api.groups.join(inviteCodeInput.trim(), { inviteCode: inviteCodeInput.trim() });
      toast.success('Successfully joined group!');
      setShowJoinModal(false);
      setInviteCodeInput('');
      const targetGroupId = (res.membership as any).groupId || (res.membership as any)._id;
      setActiveGroup(targetGroupId);
      reloadAuth();
      await loadGroups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to join group. Check the invite code.');
    } finally {
      setJoining(false);
    }
  };

  // Update Member Role
  const handleUpdateRole = async (member: EnrichedMembership, newRole: Role) => {
    if (!selectedGroup || updatingMid) return;
    try {
      setUpdatingMid(member.merchantId);
      await api.groups.updateRole(selectedGroup._id, member.merchantId, newRole);
      toast.success(`Role for ${member.merchant?.name || member.merchantId} updated to ${newRole}`);
      await loadMembers(selectedGroup._id);
    } catch (err: any) {
      toast.error('Failed to update role: ' + err.message);
    } finally {
      setUpdatingMid(null);
    }
  };

  // Remove Member
  const handleRemoveMember = async (member: EnrichedMembership) => {
    if (!selectedGroup || removingMid) return;
    const confirm = window.confirm(
      `Are you sure you want to remove ${member.merchant?.name || member.merchantId} from ${selectedGroup.name}?`,
    );
    if (!confirm) return;

    try {
      setRemovingMid(member.merchantId);
      await api.groups.removeMember(selectedGroup._id, member.merchantId);
      toast.info(`Removed member from group`);
      await loadMembers(selectedGroup._id);
    } catch (err: any) {
      toast.error('Failed to remove member: ' + err.message);
    } finally {
      setRemovingMid(null);
    }
  };

  const isUserAdminOrOwner =
    selectedGroup?.role === 'owner' || selectedGroup?.role === 'admin';

  const getRoleBadgeVariant = (role?: Role): BadgeVariant => {
    switch (role) {
      case 'owner':
        return 'primary';
      case 'admin':
        return 'warning';
      default:
        return 'muted';
    }
  };

  const getRoleIcon = (role?: Role) => {
    switch (role) {
      case 'owner':
        return <Crown size={12} style={{ marginRight: 4 }} />;
      case 'admin':
        return <Shield size={12} style={{ marginRight: 4 }} />;
      default:
        return <User size={12} style={{ marginRight: 4 }} />;
    }
  };

  return (
    <div className="page-container" style={{ padding: 'var(--content-padding)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>Tenant Groups</h1>
            <Badge variant="primary">Multi-Tenancy</Badge>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Isolated credit coalitions, membership roles, and invite-based tenant onboarding.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowJoinModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <LogIn size={16} />
            <span>Join by Code</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={16} />
            <span>Create Group</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ color: 'var(--text-muted)' }}>Loading tenant groups...</div>
        </div>
      ) : groups.length === 0 ? (
        /* Empty State */
        <div
          className="card"
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            maxWidth: 600,
            margin: '40px auto',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--accent-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Users size={32} color="var(--accent-light)" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
            No Groups Joined Yet
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.5 }}>
            CreditFlow operates within isolated merchant tenant groups. Create a new market circle or
            join an existing one using an invite code from your partner.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Plus size={16} />
              <span>Create Your First Group</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowJoinModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <LogIn size={16} />
              <span>Join via Code</span>
            </button>
          </div>
        </div>
      ) : (
        /* Main Groups Workspace */
        <div>
          {/* Group Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
              marginBottom: 36,
            }}
          >
            {groups.map((group) => {
              const isActive = group._id === activeGroupId;
              const isSelected = selectedGroup?._id === group._id;

              return (
                <div
                  key={group._id}
                  className="card"
                  style={{
                    padding: 22,
                    position: 'relative',
                    cursor: 'pointer',
                    borderColor: isSelected
                      ? 'var(--accent-primary, #7c3aed)'
                      : isActive
                      ? 'rgba(124, 58, 237, 0.4)'
                      : undefined,
                    boxShadow: isSelected
                      ? '0 0 20px rgba(124, 58, 237, 0.25)'
                      : undefined,
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => setSelectedGroup(group)}
                >
                  {/* Top row: Name & Active Indicator */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{group.name}</h3>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge variant={getRoleBadgeVariant(group.role)}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            {getRoleIcon(group.role)}
                            {group.role?.toUpperCase()}
                          </span>
                        </Badge>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          {group.type}
                        </span>
                      </div>
                    </div>

                    {isActive ? (
                      <span
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        ACTIVE
                      </span>
                    ) : (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveGroup(group._id);
                          toast.info(`Switched active group to "${group.name}"`);
                        }}
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      >
                        Set Active
                      </button>
                    )}
                  </div>

                  {/* Invite Code Bar */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      margin: '16px 0',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Invite Code
                      </div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          letterSpacing: '0.08em',
                          color: 'var(--accent-light, #c4b5fd)',
                        }}
                      >
                        {group.inviteCode}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleCopyCode(group.inviteCode)}
                        title="Copy code"
                        style={{ padding: 6 }}
                      >
                        {copiedCode === group.inviteCode ? (
                          <Check size={16} color="#10b981" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>

                      {(group.role === 'owner' || group.role === 'admin') && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleRotateCode(group)}
                          disabled={rotatingId === group._id}
                          title="Rotate invite code"
                          style={{ padding: 6 }}
                        >
                          <RefreshCw
                            size={16}
                            style={{
                              animation: rotatingId === group._id ? 'spin 1s linear infinite' : 'none',
                            }}
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bottom selection indicator */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: isSelected ? 'var(--accent-light)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    <span>{isSelected ? '● Viewing Members' : 'Click to inspect members'}</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Members Table Section for Selected Group */}
          {selectedGroup && (
            <div className="card" style={{ padding: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>
                    {selectedGroup.name} — Members ({members.length})
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {isUserAdminOrOwner
                      ? 'You have admin permissions to manage roles and remove members from this group.'
                      : 'View merchants collaborating in this debt netting circle.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleCopyCode(selectedGroup.inviteCode)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Copy size={14} />
                    <span>Copy Invite Code ({selectedGroup.inviteCode})</span>
                  </button>
                </div>
              </div>

              {membersLoading ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading members...
                </div>
              ) : members.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No members found in this group.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th style={{ padding: '12px 14px' }}>Merchant</th>
                        <th style={{ padding: '12px 14px' }}>Email</th>
                        <th style={{ padding: '12px 14px' }}>Role</th>
                        <th style={{ padding: '12px 14px' }}>Joined Date</th>
                        {isUserAdminOrOwner && (
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const mName = member.merchant?.name || member.merchantId;
                        const mEmail = member.merchant?.email || `${member.merchantId.toLowerCase()}@demo.com`;
                        const isOwner = member.role === 'owner';

                        return (
                          <tr
                            key={member._id}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              fontSize: '0.88rem',
                            }}
                          >
                            <td style={{ padding: '14px', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    background: 'var(--accent-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: 'var(--accent-light)',
                                  }}
                                >
                                  {mName.slice(0, 2).toUpperCase()}
                                </div>
                                <span>{mName}</span>
                              </div>
                            </td>
                            <td style={{ padding: '14px', color: 'var(--text-muted)' }}>{mEmail}</td>
                            <td style={{ padding: '14px' }}>
                              {isUserAdminOrOwner && !isOwner ? (
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    handleUpdateRole(member, e.target.value as Role)
                                  }
                                  style={{
                                    background: 'var(--bg-card, #1e293b)',
                                    color: 'var(--text-primary, #fff)',
                                    border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="member">Member</option>
                                </select>
                              ) : (
                                <Badge variant={getRoleBadgeVariant(member.role)}>
                                  <span style={{ display: 'flex', alignItems: 'center' }}>
                                    {getRoleIcon(member.role)}
                                    {member.role.toUpperCase()}
                                  </span>
                                </Badge>
                              )}
                            </td>
                            <td style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'N/A'}
                            </td>
                            {isUserAdminOrOwner && (
                              <td style={{ padding: '14px', textAlign: 'right' }}>
                                {!isOwner && (
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => handleRemoveMember(member)}
                                    title="Remove from group"
                                    style={{ color: 'var(--risk-critical, #ef4444)', padding: 6 }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Group */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Tenant Group"
      >
        <form onSubmit={handleCreateGroup}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Group / Market Name
            </label>
            <input
              type="text"
              placeholder="e.g. Crawford Market Traders Circle"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="input"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                color: 'white',
                outline: 'none',
              }}
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Market Coalition Type
            </label>
            <select
              value={newGroupType}
              onChange={(e) => setNewGroupType(e.target.value as GroupType)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                color: 'white',
                outline: 'none',
              }}
            >
              <option value="market">Market / Wholesale Bazaar</option>
              <option value="supply_chain">B2B Supply Chain</option>
              <option value="friends">Merchant Coalition</option>
              <option value="other">General / Other</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating Group...' : 'Create Group'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Join Group */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join Group via Invite Code"
      >
        <form onSubmit={handleJoinGroup}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 18 }}>
            Enter the 8-character invite code provided by the group owner or administrator.
          </p>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Invite Code
            </label>
            <input
              type="text"
              placeholder="e.g. CRAWFORD2026 or INV-9988"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value)}
              className="input"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                color: 'var(--accent-light, #c4b5fd)',
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                outline: 'none',
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowJoinModal(false)}
              disabled={joining}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={joining}>
              {joining ? 'Joining Group...' : 'Join Group'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
