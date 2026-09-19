import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app from '../src/app';
import { initSocketServer } from '../src/sockets';
import { prisma } from '../src/config/db';

async function runNotificationTests() {
  console.log('=== Starting Phase 7 Notifications Verification Suite ===\n');

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  const PORT = 4006;
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
    onNotification?: (data: any) => void
  ): Promise<ClientSocketType> => {
    return new Promise((resolve, reject) => {
      const socket = ClientSocket(serverUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      if (onNotification) {
        socket.on('notification:new', onNotification);
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
    // 1. Authenticate PM1, Dev1, Dev2
    console.log('1. Authenticating test users...');
    const pm1 = await login('pm1@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');
    console.log('   Users authenticated.');

    // 2. Setup test project
    const client = await prisma.client.findFirstOrThrow();
    const project = await prisma.project.create({
      data: {
        name: `Notification Test Project ${Date.now()}`,
        clientId: client.id,
        pmId: pm1.user.id,
      },
    });

    // 3. Connect sockets with notification listeners
    console.log('\n2. Connecting sockets for PM1, Dev1, and Dev2...');
    let dev1Notification: any = null;
    let pm1Notification: any = null;
    let dev2Notification: any = null;

    const dev1Socket = await createClientSocket(dev1.token, (data) => {
      dev1Notification = data;
    });
    allSockets.push(dev1Socket);

    const pm1Socket = await createClientSocket(pm1.token, (data) => {
      pm1Notification = data;
    });
    allSockets.push(pm1Socket);

    const dev2Socket = await createClientSocket(dev2.token, (data) => {
      dev2Notification = data;
    });
    allSockets.push(dev2Socket);

    console.log('   All sockets connected.');
    await new Promise((r) => setTimeout(r, 200));

    // 4. Trigger 1: Task Assignment Notification
    console.log('\n3. Triggering Task Assignment Notification (PM1 creates task assigned to Dev1)...');
    const taskTitle = `Assigned Task ${Date.now()}`;
    const createTaskRes = await request(
      `/api/projects/${project.id}/tasks`,
      'POST',
      {
        title: taskTitle,
        assigneeId: dev1.user.id,
        status: 'TODO',
        priority: 'HIGH',
      },
      pm1.token
    );
    console.log(`   Task created: Status ${createTaskRes.status}, ID: ${createTaskRes.data.task?.id}`);
    if (createTaskRes.status !== 201) throw new Error('Task creation failed');
    const taskId = createTaskRes.data.task.id;

    // Wait for notification event delivery
    await new Promise((r) => setTimeout(r, 500));

    console.log('   Verifying notification:new delivery on assignment:');
    console.log('   - Dev1 received notification:', !!dev1Notification);
    console.log('   - Dev2 (other dev) received notification:', !!dev2Notification);
    if (!dev1Notification) throw new Error('Dev1 did not receive notification on task assignment!');
    if (dev2Notification) throw new Error('Dev2 received Dev1 notification! User room isolation failed.');

    console.log('   Dev1 notification payload:', dev1Notification);
    if (!dev1Notification.message.includes(taskTitle) || dev1Notification.taskId !== taskId) {
      throw new Error('Notification payload mismatch!');
    }
    const dev1NotifId = dev1Notification.id;

    // 5. Trigger 2: Move to IN_REVIEW Notification
    console.log('\n4. Triggering Move to IN_REVIEW Notification (Dev1 moves task to IN_REVIEW)...');
    dev1Notification = null;
    pm1Notification = null;

    const updateStatusRes = await request(
      `/api/tasks/${taskId}/status`,
      'PATCH',
      { status: 'IN_REVIEW' },
      dev1.token
    );
    console.log(`   Status updated: ${updateStatusRes.status}`);
    if (updateStatusRes.status !== 200) throw new Error('Task status update failed');

    // Wait for notification event delivery
    await new Promise((r) => setTimeout(r, 500));

    console.log('   Verifying notification:new delivery on IN_REVIEW:');
    console.log('   - PM1 received notification:', !!pm1Notification);
    console.log('   - Dev1 received PM1 notification:', !!dev1Notification);
    if (!pm1Notification) throw new Error('PM1 did not receive notification on task moved to IN_REVIEW!');
    if (dev1Notification) throw new Error('Dev1 received notification meant for PM1!');

    console.log('   PM1 notification payload:', pm1Notification);
    if (!pm1Notification.message.includes('IN_REVIEW') || pm1Notification.taskId !== taskId) {
      throw new Error('PM1 notification payload mismatch!');
    }

    // 6. REST Endpoints Testing
    console.log('\n5. Testing REST Notification Endpoints...');

    // GET /api/notifications (Dev1)
    const dev1List = await request('/api/notifications', 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/notifications: Status ${dev1List.status}, count: ${dev1List.data.notifications?.length}, unreadCount: ${dev1List.data.unreadCount}`);
    if (dev1List.status !== 200 || dev1List.data.unreadCount < 1) {
      throw new Error('Dev1 list notifications failed or unreadCount is 0');
    }

    // PATCH /api/notifications/:id/read (Dev1 marks own notification read)
    const markReadRes = await request(
      `/api/notifications/${dev1NotifId}/read`,
      'PATCH',
      undefined,
      dev1.token
    );
    console.log(`   Dev1 PATCH /api/notifications/:id/read: Status ${markReadRes.status}, read: ${markReadRes.data.notification?.read}`);
    if (markReadRes.status !== 200 || markReadRes.data.notification?.read !== true) {
      throw new Error('Mark notification as read failed');
    }

    // Dev2 attempts to mark Dev1's notification as read -> 403 FORBIDDEN
    const dev2Tamper = await request(
      `/api/notifications/${dev1NotifId}/read`,
      'PATCH',
      undefined,
      dev2.token
    );
    console.log(`   Dev2 tampering with Dev1 notification: Status ${dev2Tamper.status}, Error:`, dev2Tamper.data.error);
    if (dev2Tamper.status !== 403 || dev2Tamper.data.error.code !== 'FORBIDDEN') {
      throw new Error('Dev2 was able to mark Dev1 notification as read!');
    }

    // PATCH /api/notifications/read-all (PM1 marks all as read)
    const readAllRes = await request('/api/notifications/read-all', 'PATCH', undefined, pm1.token);
    console.log(`   PM1 PATCH /api/notifications/read-all: Status ${readAllRes.status}, Message:`, readAllRes.data.message);
    if (readAllRes.status !== 200) throw new Error('Mark all as read failed');

    // Verify PM1 unreadCount is now 0
    const pm1List = await request('/api/notifications', 'GET', undefined, pm1.token);
    console.log(`   PM1 unreadCount after read-all: ${pm1List.data.unreadCount}`);
    if (pm1List.data.unreadCount !== 0) throw new Error('unreadCount is not 0 after read-all!');

    // Cleanup
    await prisma.notification.deleteMany({ where: { taskId } });
    await prisma.activityLog.deleteMany({ where: { taskId } });
    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });

    console.log('\n=== ALL PHASE 7 NOTIFICATIONS TESTS PASSED SUCCESSFULLY! ===');
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

runNotificationTests();
