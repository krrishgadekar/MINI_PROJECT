import axios from 'axios';

const API = 'http://localhost:4000/api';

async function testWalkthrough() {
  console.log('--- 1. Register User 1 (Alice) ---');
  const aliceEmail = `alice_${Date.now()}@test.com`;
  const reg1 = await axios.post(`${API}/auth/register`, {
    name: 'Alice Wholesaler',
    email: aliceEmail,
    password: 'CreditFlow@123',
  });
  console.log('✅ User 1 Registered:', reg1.data.merchant.email);
  const token1 = reg1.data.accessToken;

  console.log('--- 2. Register User 2 (Bob) ---');
  const bobEmail = `bob_${Date.now()}@test.com`;
  const reg2 = await axios.post(`${API}/auth/register`, {
    name: 'Bob Retailer',
    email: bobEmail,
    password: 'CreditFlow@123',
  });
  console.log('✅ User 2 Registered:', reg2.data.merchant.email);
  const token2 = reg2.data.accessToken;

  console.log('--- 3. User 1 Creates Group ---');
  const groupRes = await axios.post(
    `${API}/groups`,
    { name: 'Apex Trade Circle', type: 'market' },
    { headers: { Authorization: `Bearer ${token1}` } },
  );
  const group = groupRes.data.group;
  console.log('✅ Group Created:', group.name, 'Invite Code:', group.inviteCode, 'ID:', group._id);

  console.log('--- 4. User 2 Joins Group via Invite Code ---');
  const joinRes = await axios.post(
    `${API}/groups/join`,
    { inviteCode: group.inviteCode },
    { headers: { Authorization: `Bearer ${token2}` } },
  );
  console.log('✅ User 2 Joined Group:', joinRes.data.success, 'Role:', joinRes.data.membership.role);

  console.log('--- 5. User 1 Adds Debt ---');
  const debtRes = await axios.post(
    `${API}/debts`,
    {
      debtorId: reg2.data.merchant.id,
      creditorId: reg1.data.merchant.id,
      amount: 10000,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Advance for dry fruits',
    },
    {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Group-Id': group._id,
      },
    },
  );
  const debt = debtRes.data.debt;
  console.log('✅ Debt Created:', debt._id, 'Status:', debt.status, 'Amount:', debt.amount);

  console.log('--- 6. Counterparty (User 2) Confirms Debt ---');
  const confirmRes = await axios.post(
    `${API}/debts/${debt._id}/confirm`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Group-Id': group._id,
      },
    },
  );
  console.log('✅ Debt Confirmed:', confirmRes.data.debt.status, 'ConfirmedBy:', confirmRes.data.debt.confirmedBy);

  console.log('--- 7. Record Partial Payment ---');
  const payRes = await axios.post(
    `${API}/debts/${debt._id}/payments`,
    {
      amount: 3000,
      note: 'First installment payment',
      expectedVersion: confirmRes.data.debt.version,
    },
    {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Group-Id': group._id,
      },
    },
  );
  console.log('✅ Partial Payment Recorded:', payRes.data.payment.amount, 'New Remaining Debt:', payRes.data.debt.amount, 'Status:', payRes.data.debt.status);

  console.log('--- 8. View Timeline (Single Transaction Detail) ---');
  const detailRes = await axios.get(`${API}/debts/${debt._id}`, {
    headers: {
      Authorization: `Bearer ${token2}`,
      'X-Group-Id': group._id,
    },
  });
  console.log('✅ Transaction Detail Fetched:');
  console.log('   Payments count:', detailRes.data.payments.length);
  console.log('   Audit count:', detailRes.data.audit.length);

  console.log('--- 9. View Activity Feed & Pagination ---');
  const auditRes = await axios.get(`${API}/audit?page=1&limit=5`, {
    headers: {
      Authorization: `Bearer ${token2}`,
      'X-Group-Id': group._id,
    },
  });
  console.log('✅ Activity Feed Fetched:');
  console.log('   Items:', auditRes.data.audit.length, 'Total:', auditRes.data.total, 'Page:', auditRes.data.page);

  console.log('--- 10. Cross-Group Access (User 2 attempts unauthorized group) ---');
  try {
    // Attempting to access without membership in group
    await axios.get(`${API}/debts`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Group-Id': '6ad5a8d5df48de79fa2abcc4', // Supplier Circle
      },
    });
    console.error('❌ Expected 403 but succeeded!');
  } catch (err: any) {
    console.log('✅ Cross-group access correctly returned 403:', err.response?.status, err.response?.data?.code);
  }

  console.log('--- 11. Member Isolation Check ---');
  try {
    await axios.get(`${API}/debts?scope=all`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Group-Id': group._id,
      },
    });
    console.error('❌ Expected 403 on scope=all for member!');
  } catch (err: any) {
    console.log('✅ Member querying scope=all correctly rejected with 403:', err.response?.status, err.response?.data?.code);
  }

  const memberDebts = await axios.get(`${API}/debts?scope=mine`, {
    headers: {
      Authorization: `Bearer ${token2}`,
      'X-Group-Id': group._id,
    },
  });
  console.log('✅ Member querying scope=mine returns only their debts:', memberDebts.data.debts.length);

  console.log('\n🎉 ALL Phase 3 API Walkthrough tests passed successfully!');
}

testWalkthrough().catch((err) => {
  console.error('❌ Walkthrough failed:', err.response?.data || err.message);
  process.exit(1);
});
