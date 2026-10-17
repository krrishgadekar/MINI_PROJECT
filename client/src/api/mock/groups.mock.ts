/**
 * api/mock/groups.mock.ts — Mock Implementation for Groups & Tenancy Domain (Slice A)
 *
 * Teammates can extend this file directly.
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
} from '../contract';

const mockGroups: Group[] = [
  {
    _id: 'grp-1',
    name: 'Crawford Market Traders',
    type: 'market',
    ownerId: 'Wholesale_A',
    inviteCode: 'CRAWFORD2026',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'grp-2',
    name: 'Maharashtra Agro Supply',
    type: 'supply_chain',
    ownerId: 'Supplier_C',
    inviteCode: 'AGRO9988',
    createdAt: new Date().toISOString(),
  },
];

const mockMemberships: Membership[] = [
  { _id: 'mem-1', groupId: 'grp-1', merchantId: 'Wholesale_A', role: 'owner' },
  { _id: 'mem-2', groupId: 'grp-1', merchantId: 'Retailer_B', role: 'member' },
  { _id: 'mem-3', groupId: 'grp-1', merchantId: 'Vendor_D', role: 'admin' },
];

export const groupsMock = {
  list: async (): Promise<GroupsResponse> => {
    return { success: true, groups: mockGroups };
  },

  get: async (id: string): Promise<GroupDetailResponse> => {
    const group = mockGroups.find((g) => g._id === id) || mockGroups[0];
    return {
      success: true,
      group,
      members: mockMemberships.filter((m) => m.groupId === group._id),
    };
  },

  create: async (data: CreateGroupRequest): Promise<GroupResponse> => {
    const newGroup: Group = {
      _id: `grp-${Date.now()}`,
      name: data.name,
      type: data.type || 'other',
      ownerId: 'Wholesale_A',
      inviteCode: `INV-${Math.floor(Math.random() * 9000 + 1000)}`,
      createdAt: new Date().toISOString(),
    };
    mockGroups.push(newGroup);
    return { success: true, group: newGroup };
  },

  join: async (id: string, _data: JoinGroupRequest): Promise<MembershipResponse> => {
    const membership: Membership = {
      _id: `mem-${Date.now()}`,
      groupId: id,
      merchantId: 'Current_User',
      role: 'member',
      joinedAt: new Date().toISOString(),
    };
    return { success: true, membership };
  },

  invite: async (_id: string, _data: InviteGroupRequest): Promise<InviteResponse> => {
    return { success: true, inviteCode: `INV-${Date.now()}` };
  },
};
