import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { initSocket, emitToGroup, emitToMerchant } from '../src/realtime/socket';

describe('Realtime Socket Multi-Tenant Isolation (BE-08)', () => {
  let server: http.Server;
  let port: number;
  let clientA: ClientSocketType;
  let clientB: ClientSocketType;

  const secret = process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret';
  const merchantAId = '66b0a1111111111111111111';
  const merchantBId = '66b0b2222222222222222222';
  const groupAId = '66b0aaaa1111111111111111';
  const groupBId = '66b0bbbb2222222222222222';

  const tokenA = jwt.sign({ id: merchantAId }, secret, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: merchantBId }, secret, { expiresIn: '1h' });

  beforeAll((done) => {
    server = http.createServer();
    initSocket(server);

    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        port = address.port;
      }
      done();
    });
  });

  afterAll((done) => {
    if (clientA?.connected) clientA.disconnect();
    if (clientB?.connected) clientB.disconnect();
    server.close(done);
  });

  test('client in Group B strictly does not receive events emitted to Group A', (done) => {
    const url = `http://localhost:${port}`;

    const eventsA: Array<{ event: string; data: any }> = [];
    const eventsB: Array<{ event: string; data: any }> = [];

    // Connect Client A in Group A
    clientA = ClientSocket(url, {
      auth: { token: tokenA, groupId: groupAId },
      transports: ['websocket'],
    });

    // Connect Client B in Group B
    clientB = ClientSocket(url, {
      auth: { token: tokenB, groupId: groupBId },
      transports: ['websocket'],
    });

    const recordEvent = (list: Array<any>, event: string, data: any) => {
      list.push({ event, data });
      if (event === 'batch:update' && Array.isArray(data?.events)) {
        for (const item of data.events) {
          list.push({ event: item.event, data: item.payload });
        }
      }
    };

    clientA.on('debt:created', (data: any) => recordEvent(eventsA, 'debt:created', data));
    clientA.on('batch:update', (data: any) => recordEvent(eventsA, 'batch:update', data));
    clientA.on('notification:new', (data: any) => recordEvent(eventsA, 'notification:new', data));

    clientB.on('debt:created', (data: any) => recordEvent(eventsB, 'debt:created', data));
    clientB.on('batch:update', (data: any) => recordEvent(eventsB, 'batch:update', data));
    clientB.on('notification:new', (data: any) => recordEvent(eventsB, 'notification:new', data));

    let connectedCount = 0;
    const onConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        // Both connected. Emit group event exclusively to Group A
        emitToGroup(groupAId, 'debt:created', {
          debtId: 'debt-alpha-99',
          groupId: groupAId,
          amount: 5000,
        });

        // Emit private notification specifically to Merchant A
        emitToMerchant(merchantAId, 'notification:new', {
          id: 'notif-1',
          message: 'Private alert for Merchant A',
          merchantId: merchantAId,
        });

        // Wait to verify arrival on A and absence on B
        setTimeout(() => {
          // Client A should have received the group event or throttled batch
          const hasDebtOnA = eventsA.some(
            (e) => e.event === 'debt:created' || (e.event === 'batch:update' && JSON.stringify(e.data).includes('debt-alpha-99'))
          );
          expect(hasDebtOnA).toBe(true);

          // Client A should have received private notification
          const hasNotifOnA = eventsA.some((e) => e.event === 'notification:new' && e.data?.id === 'notif-1');
          expect(hasNotifOnA).toBe(true);

          // Client B MUST NOT receive anything from Group A or Merchant A
          const hasDebtOnB = eventsB.some(
            (e) => e.event === 'debt:created' || (e.event === 'batch:update' && JSON.stringify(e.data).includes('debt-alpha-99'))
          );
          const hasNotifOnB = eventsB.some((e) => JSON.stringify(e.data).includes('notif-1'));

          expect(hasDebtOnB).toBe(false);
          expect(hasNotifOnB).toBe(false);
          expect(eventsB.length).toBe(0);

          done();
        }, 350);
      }
    };

    clientA.on('connect', onConnected);
    clientB.on('connect', onConnected);
  }, 10000);
});
