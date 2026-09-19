import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app from '../src/app';
import { initSocketServer } from '../src/sockets';
import { prisma } from '../src/config/db';

async function runSocketTests() {
  console.log('=== Starting Phase 5 Socket.io Verification Suite ===\n');

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  const PORT = 4004;
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

  const createClientSocket = (token?: string): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const socket = ClientSocket(serverUrl, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', () => {
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  };

  const openSockets: ClientSocketType[] = [];

  try {
    // 1. Handshake Authentication Tests
    console.log('1. Testing Handshake Authentication...');

    // Without token -> rejected
    let rejectedNoToken = false;
    try {
      await createClientSocket();
    } catch (err: any) {
      rejectedNoToken = true;
      console.log('   Connection rejected without token (expected):', err.message);
    }
    if (!rejectedNoToken) throw new Error('Socket connected without token!');

    // With invalid token -> rejected
    let rejectedInvalidToken = false;
    try {
      await createClientSocket('invalid.jwt.token');
    } catch (err: any) {
      rejectedInvalidToken = true;
      console.log('   Connection rejected with invalid token (expected):', err.message);
    }
    if (!rejectedInvalidToken) throw new Error('Socket connected with invalid token!');

    // 2. Authenticate Users and Connect
    console.log('\n2. Authenticating users via REST and connecting sockets...');
    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');

    // 3. Setup test project and tasks
    const client = await prisma.client.findFirstOrThrow();
    const testProject = await prisma.project.create({
      data: {
        name: `Socket Test Project ${Date.now()}`,
        clientId: client.id,
        pmId: pm1.user.id,
      },
    });

    // Task assigned to Dev1 only
    const task = await prisma.task.create({
      data: {
        title: 'Realtime Socket Test Task',
        projectId: testProject.id,
        assigneeId: dev1.user.id,
        status: 'TODO',
        priority: 'HIGH',
      },
    });

    console.log(`   Created test project: ${testProject.id}`);
    console.log(`   Created task assigned to Dev1: ${task.id}`);

    // Connect valid sockets
    const adminSocket = await createClientSocket(admin.token);
    openSockets.push(adminSocket);
    console.log('   Admin socket connected: OK');

    const pm1Socket = await createClientSocket(pm1.token);
    openSockets.push(pm1Socket);
    console.log('   PM1 socket connected: OK');

    const dev1Socket = await createClientSocket(dev1.token);
    openSockets.push(dev1Socket);
    console.log('   Dev1 socket connected (assigned to task): OK');

    const dev2Socket = await createClientSocket(dev2.token);
    openSockets.push(dev2Socket);
    console.log('   Dev2 socket connected (NOT in this project): OK');

    // Wait 200ms for async room joins to finish on server
    await new Promise((r) => setTimeout(r, 300));

    // 4. Test real-time activity:new event emission
    console.log('\n4. Testing activity:new real-time event emission...');

    let adminReceived: any = null;
    let pm1Received: any = null;
    let dev1Received: any = null;
    let dev2Received: any = null;

    adminSocket.on('activity:new', (data) => {
      adminReceived = data;
    });

    pm1Socket.on('activity:new', (data) => {
      pm1Received = data;
    });

    dev1Socket.on('activity:new', (data) => {
      dev1Received = data;
    });

    dev2Socket.on('activity:new', (data) => {
      dev2Received = data;
    });

    // Trigger status change via REST
    console.log('   Triggering PATCH /api/tasks/:id/status (TODO -> IN_PROGRESS)...');
    const updateRes = await request(
      `/api/tasks/${task.id}/status`,
      'PATCH',
      { status: 'IN_PROGRESS' },
      dev1.token
    );
    console.log(`   PATCH response status: ${updateRes.status}`);
    if (updateRes.status !== 200) throw new Error('Task status update failed');

    // Wait 500ms for event transmission
    await new Promise((r) => setTimeout(r, 500));

    console.log('   Verifying event deliveries:');
    console.log('   - Dev1 received activity:new:', !!dev1Received);
    console.log('   - PM1 received activity:new:', !!pm1Received);
    console.log('   - Admin received activity:new:', !!adminReceived);
    console.log('   - Dev2 (not in project) received event:', !!dev2Received);

    if (!dev1Received) throw new Error('Dev1 did not receive activity:new event!');
    if (!pm1Received) throw new Error('PM1 did not receive activity:new event!');
    if (!adminReceived) throw new Error('Admin did not receive activity:new event!');
    if (dev2Received) throw new Error('Dev2 received event for an unassigned project! Isolation failed.');

    // Validate payload shape
    console.log('   Verifying event payload shape:');
    console.log('   Payload:', dev1Received);
    if (
      dev1Received.taskId !== task.id ||
      dev1Received.projectId !== testProject.id ||
      dev1Received.fromStatus !== 'TODO' ||
      dev1Received.toStatus !== 'IN_PROGRESS' ||
      !dev1Received.userName
    ) {
      throw new Error('activity:new payload shape mismatch!');
    }

    // 5. Missed-event catchup endpoint
    console.log('\n5. Testing missed-event catchup endpoint (GET /api/activity)...');
    const catchupRes = await request(
      `/api/activity?projectId=${testProject.id}&limit=5`,
      'GET',
      undefined,
      dev1.token
    );
    console.log(`   GET /api/activity status: ${catchupRes.status}, logs: ${catchupRes.data.activityLogs?.length}`);
    if (catchupRes.status !== 200 || catchupRes.data.activityLogs.length === 0) {
      throw new Error('Missed-event catchup endpoint failed!');
    }
    console.log(`   Latest activity log: from ${catchupRes.data.activityLogs[0].fromStatus} to ${catchupRes.data.activityLogs[0].toStatus}`);

    // Cleanup
    await prisma.activityLog.deleteMany({ where: { taskId: task.id } });
    await prisma.task.deleteMany({ where: { projectId: testProject.id } });
    await prisma.project.delete({ where: { id: testProject.id } });

    console.log('\n=== ALL PHASE 5 SOCKET.IO TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\nVerification failed:', err);
    process.exitCode = 1;
  } finally {
    for (const s of openSockets) {
      s.disconnect();
    }
    httpServer.close();
    await prisma.$disconnect();
  }
}

runSocketTests();
