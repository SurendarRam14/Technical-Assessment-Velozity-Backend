import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app from '../src/app';
import { initSocketServer, getOnlineUsersCount } from '../src/sockets';
import { prisma } from '../src/config/db';

async function runPresenceTests() {
  console.log('=== Starting Phase 6 Presence Tracking Verification Suite ===\n');

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  const PORT = 4005;
  await new Promise<void>((resolve) => httpServer.listen(PORT, () => resolve()));
  const serverUrl = `http://localhost:${PORT}`;

  const request = async (
    path: string,
    method = 'GET',
    body?: any,
    token?: string
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${serverUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  const login = async (email: string) => {
    const res = await request('/api/auth/login', 'POST', {
      email,
      password: 'Password123!',
    });
    if (res.status !== 200 || !res.data.accessToken) {
      throw new Error(`Login failed for ${email}`);
    }
    return { token: res.data.accessToken as string, user: res.data.user };
  };

  const createClientSocket = (
    token: string,
    onPresenceCount?: (data: { count: number }) => void
  ): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const socket = ClientSocket(serverUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      if (onPresenceCount) {
        socket.on('presence:count', onPresenceCount);
      }

      socket.on('connect', () => {
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  };

  const allSockets: ClientSocketType[] = [];

  try {
    // 1. Authenticate users
    console.log('1. Authenticating Dev1 and Dev2...');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');
    console.log('   Users authenticated.');

    // 2. Initial state
    console.log('\n2. Verifying initial presence state...');
    console.log(`   Initial online count: ${getOnlineUsersCount()}`);
    if (getOnlineUsersCount() !== 0) throw new Error('Initial count must be 0');

    // 3. First user connects (Dev1)
    console.log('\n3. Connecting Dev1 (Socket 1)...');
    let dev1Count: number | null = null;
    const socket1 = await createClientSocket(dev1.token, (data) => {
      dev1Count = data.count;
    });
    allSockets.push(socket1);

    // Wait 200ms for event
    await new Promise((r) => setTimeout(r, 200));
    console.log(`   Dev1 received presence:count: ${dev1Count}`);
    console.log(`   Server getOnlineUsersCount: ${getOnlineUsersCount()}`);
    if (dev1Count !== 1 || getOnlineUsersCount() !== 1) {
      throw new Error(`Expected count 1, received dev1Count=${dev1Count}, server=${getOnlineUsersCount()}`);
    }

    // 4. Second user connects (Dev2)
    console.log('\n4. Connecting Dev2 (Socket 2)...');
    let dev2Count: number | null = null;
    const socket2 = await createClientSocket(dev2.token, (data) => {
      dev2Count = data.count;
    });
    allSockets.push(socket2);

    // Wait 200ms
    await new Promise((r) => setTimeout(r, 200));
    console.log(`   Dev1 presence:count: ${dev1Count}`);
    console.log(`   Dev2 presence:count: ${dev2Count}`);
    console.log(`   Server getOnlineUsersCount: ${getOnlineUsersCount()}`);
    if (dev1Count !== 2 || dev2Count !== 2 || getOnlineUsersCount() !== 2) {
      throw new Error(`Expected count 2 across all clients, received dev1=${dev1Count}, dev2=${dev2Count}`);
    }

    // 5. Dev1 opens second socket (multi-tab scenario)
    console.log('\n5. Connecting Dev1 Tab 2 (Socket 3 with same user ID)...');
    let dev1Tab2Count: number | null = null;
    const socket3 = await createClientSocket(dev1.token, (data) => {
      dev1Tab2Count = data.count;
    });
    allSockets.push(socket3);

    await new Promise((r) => setTimeout(r, 200));
    console.log(`   Dev1 Tab 1 count: ${dev1Count}`);
    console.log(`   Dev1 Tab 2 count: ${dev1Tab2Count}`);
    console.log(`   Server unique online users: ${getOnlineUsersCount()}`);
    // Unique user count should remain 2!
    if (getOnlineUsersCount() !== 2) {
      throw new Error(`Multi-tabbing duplicate counted! Expected 2, got ${getOnlineUsersCount()}`);
    }

    // 6. Dev1 closes Tab 2 (socket3)
    console.log('\n6. Disconnecting Dev1 Tab 2 (Socket 3)...');
    socket3.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    console.log(`   Server unique online users after closing 1 tab: ${getOnlineUsersCount()}`);
    if (getOnlineUsersCount() !== 2) {
      throw new Error(`User was prematurely marked offline! Expected 2, got ${getOnlineUsersCount()}`);
    }

    // 7. Dev2 disconnects completely
    console.log('\n7. Disconnecting Dev2 (Socket 2)...');
    socket2.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    console.log(`   Dev1 received updated presence:count: ${dev1Count}`);
    console.log(`   Server unique online users: ${getOnlineUsersCount()}`);
    if (dev1Count !== 1 || getOnlineUsersCount() !== 1) {
      throw new Error(`Expected count to drop to 1, received dev1=${dev1Count}, server=${getOnlineUsersCount()}`);
    }

    // 8. Explicit presence:join
    console.log('\n8. Testing explicit presence:join event...');
    let joinCount: number | null = null;
    socket1.on('presence:count', (data) => {
      joinCount = data.count;
    });
    socket1.emit('presence:join');
    await new Promise((r) => setTimeout(r, 200));
    console.log(`   presence:join response count: ${joinCount}`);
    if (joinCount !== 1) {
      throw new Error(`presence:join failed! Expected 1, got ${joinCount}`);
    }

    console.log('\n=== ALL PHASE 6 PRESENCE TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\nVerification failed:', err);
    process.exitCode = 1;
  } finally {
    for (const s of allSockets) {
      s.disconnect();
    }
    httpServer.close();
    await prisma.$disconnect();
  }
}

runPresenceTests();
