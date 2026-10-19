/**
 * api/mock/groups.mock.ts — Mock Implementation for Groups & Tenancy Domain (Slice A)
 *
 * Supports mock data for:
 *   - list groups
 *   - get group details with members
 *   - create group
 *   - join by invite code
 *   - update member role (admin only)
 *   - remove member (admin only or self leave)
 *   - rotate invite code
 */

import type {
  GroupsResponse,
  GroupDetailResponse,
  GroupResponse,
  MembershipResponse,
  InviteResponse,
  CreateGroupRequest,
  JoinGroupRequest,
  InviteGroupRequest,
  Group,
  Membership,
  Role,
} from '../contract';

export interface EnrichedMembership extends Membership {
  merchant?: {
    _id: string;
    name: string;
    email: string;
  };
}

let mockGroups: (Group & { role?: Role })[] = [
  {
    _id: 'grp-1',
    name: 'Crawford Market Traders',
    type: 'market',
    ownerId: 'Wholesale_A',
    inviteCode: 'CRAWFORD2026',
    role: 'owner',
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'grp-2',
    name: 'Maharashtra Agro Supply',
    type: 'supply_chain',
    ownerId: 'Supplier_C',
    inviteCode: 'AGRO9988',
    role: 'admin',
    createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'grp-3',
    name: 'South Mumbai Retail Network',
    type: 'market',
    ownerId: 'Vendor_D',
    inviteCode: 'MUMBAI44',
    role: 'member',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
];

let mockMemberships: EnrichedMembership[] = [
  {
    _id: 'mem-1',
    groupId: 'grp-1',
    merchantId: 'Wholesale_A',
    role: 'owner',
    joinedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Wholesale_A', name: 'Wholesale_A', email: 'wholesale.a@demo.com' },
  },
  {
    _id: 'mem-2',
    groupId: 'grp-1',
    merchantId: 'Retailer_B',
    role: 'member',
    joinedAt: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Retailer_B', name: 'Retailer_B', email: 'retailer.b@demo.com' },
  },
  {
    _id: 'mem-3',
    groupId: 'grp-1',
    merchantId: 'Vendor_D',
    role: 'admin',
    joinedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Vendor_D', name: 'Vendor_D', email: 'vendor.d@demo.com' },
  },
  {
    _id: 'mem-4',
    groupId: 'grp-1',
    merchantId: 'Supplier_C',
    role: 'member',
    joinedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Supplier_C', name: 'Supplier_C', email: 'supplier.c@demo.com' },
  },
  {
    _id: 'mem-5',
    groupId: 'grp-2',
    merchantId: 'Supplier_C',
    role: 'owner',
    joinedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Supplier_C', name: 'Supplier_C', email: 'supplier.c@demo.com' },
  },
  {
    _id: 'mem-6',
    groupId: 'grp-2',
    merchantId: 'Wholesale_A',
    role: 'admin',
    joinedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    merchant: { _id: 'Wholesale_A', name: 'Wholesale_A', email: 'wholesale.a@demo.com' },
  },
];

export const groupsMock = {
  list: async (): Promise<GroupsResponse> => {
    return { success: true, groups: [...mockGroups] };
  },

  get: async (id: string): Promise<GroupDetailResponse> => {
    const group = mockGroups.find((g) => g._id === id) || mockGroups[0];
    return {
      success: true,
      group,
      members: mockMemberships.filter((m) => m.groupId === group._id),
    };
  },

  getMembers: async (groupId: string): Promise<{ success: boolean; members: EnrichedMembership[] }> => {
    return {
      success: true,
      members: mockMemberships.filter((m) => m.groupId === groupId),
    };
  },

  create: async (data: CreateGroupRequest): Promise<GroupResponse> => {
    const newGroup: Group & { role?: Role } = {
      _id: `grp-${Date.now()}`,
      name: data.name,
      type: data.type || 'market',
      ownerId: 'Wholesale_A',
      inviteCode: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      role: 'owner',
      createdAt: new Date().toISOString(),
    };
    mockGroups.unshift(newGroup);

    mockMemberships.push({
      _id: `mem-${Date.now()}`,
      groupId: newGroup._id,
      merchantId: 'Wholesale_A',
      role: 'owner',
      joinedAt: new Date().toISOString(),
      merchant: { _id: 'Wholesale_A', name: 'Wholesale_A', email: 'wholesale.a@demo.com' },
    });

    return { success: true, group: newGroup };
  },

  join: async (idOrCode: string, data?: JoinGroupRequest): Promise<MembershipResponse> => {
    const code = (data?.inviteCode || idOrCode).trim().toUpperCase();
    const group = mockGroups.find((g) => g.inviteCode.toUpperCase() === code || g._id === idOrCode);
    if (!group) {
      throw new Error('Invalid invite code');
    }

    const membership: EnrichedMembership = {
      _id: `mem-${Date.now()}`,
      groupId: group._id,
      merchantId: 'Current_User',
      role: 'member',
      joinedAt: new Date().toISOString(),
      merchant: { _id: 'Current_User', name: 'Current User', email: 'user@creditflow.io' },
    };

    mockMemberships.push(membership);
    return { success: true, membership };
  },

  updateRole: async (
    groupId: string,
    merchantId: string,
    role: Role,
  ): Promise<{ success: boolean; membership: EnrichedMembership }> => {
    const m = mockMemberships.find((mem) => mem.groupId === groupId && mem.merchantId === merchantId);
    if (!m) throw new Error('Member not found');
    m.role = role;
    return { success: true, membership: m };
  },

  removeMember: async (
    groupId: string,
    merchantId: string,
  ): Promise<{ success: boolean; message: string }> => {
    mockMemberships = mockMemberships.filter(
      (m) => !(m.groupId === groupId && m.merchantId === merchantId),
    );
    return { success: true, message: 'Member removed successfully' };
  },

  rotateInviteCode: async (groupId: string): Promise<InviteResponse> => {
    const group = mockGroups.find((g) => g._id === groupId);
    if (!group) throw new Error('Group not found');
    const newCode = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    group.inviteCode = newCode;
    return { success: true, inviteCode: newCode };
  },

  invite: async (id: string, _data: InviteGroupRequest): Promise<InviteResponse> => {
    return groupsMock.rotateInviteCode(id);
  },
};
