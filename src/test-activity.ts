import http from 'http';
import app from '../src/app';
import { prisma } from '../src/config/db';

async function runActivityTests() {
  console.log('=== Starting Phase 4 Task Status & ActivityLog Verification Suite ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4003, () => resolve()));
  const baseUrl = 'http://localhost:4003';

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

    const res = await fetch(`${baseUrl}${path}`, {
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

  try {
    // 1. Authenticate users
    console.log('1. Authenticating test users...');
    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');
    console.log('   All test users authenticated.');

    // 2. Setup a fresh test project and task
    console.log('\n2. Setting up test project and task...');
    const client = await prisma.client.findFirstOrThrow();
    const testProject = await prisma.project.create({
      data: {
        name: `Phase 4 Test Project ${Date.now()}`,
        clientId: client.id,
        pmId: pm1.user.id,
      },
    });

    const dev1Task = await prisma.task.create({
      data: {
        title: 'Status Transition Test Task',
        projectId: testProject.id,
        assigneeId: dev1.user.id,
        status: 'TODO',
        priority: 'HIGH',
      },
    });

    const unassignedTask = await prisma.task.create({
      data: {
        title: 'Unassigned Test Task',
        projectId: testProject.id,
        assigneeId: null,
        status: 'TODO',
        priority: 'LOW',
      },
    });
    console.log(`   Created test project: ${testProject.id}`);
    console.log(`   Created Dev1 task: ${dev1Task.id} (Status: TODO)`);
    console.log(`   Created Unassigned task: ${unassignedTask.id} (Status: TODO)`);

    // 3. Dev1 updates assigned task: TODO -> IN_PROGRESS
    console.log('\n3. Testing Assigned Dev status update (TODO -> IN_PROGRESS)...');
    const dev1Update = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'IN_PROGRESS' },
      dev1.token
    );
    console.log(`   Dev1 PATCH status: ${dev1Update.status}`);
    console.log(`   Updated Task Status: ${dev1Update.data.task?.status}`);
    console.log(`   ActivityLog fromStatus: ${dev1Update.data.activityLog?.fromStatus}, toStatus: ${dev1Update.data.activityLog?.toStatus}, user: ${dev1Update.data.activityLog?.userId}`);
    if (
      dev1Update.status !== 200 ||
      dev1Update.data.task?.status !== 'IN_PROGRESS' ||
      dev1Update.data.activityLog?.fromStatus !== 'TODO' ||
      dev1Update.data.activityLog?.toStatus !== 'IN_PROGRESS' ||
      dev1Update.data.activityLog?.userId !== dev1.user.id
    ) {
      throw new Error('Dev1 status update failed');
    }

    // 4. Owning PM updates task: IN_PROGRESS -> IN_REVIEW
    console.log('\n4. Testing Owning PM status update (IN_PROGRESS -> IN_REVIEW)...');
    const pm1Update = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'IN_REVIEW' },
      pm1.token
    );
    console.log(`   PM1 PATCH status: ${pm1Update.status}`);
    console.log(`   Updated Task Status: ${pm1Update.data.task?.status}`);
    console.log(`   ActivityLog fromStatus: ${pm1Update.data.activityLog?.fromStatus}, toStatus: ${pm1Update.data.activityLog?.toStatus}, user: ${pm1Update.data.activityLog?.userId}`);
    if (
      pm1Update.status !== 200 ||
      pm1Update.data.task?.status !== 'IN_REVIEW' ||
      pm1Update.data.activityLog?.fromStatus !== 'IN_PROGRESS' ||
      pm1Update.data.activityLog?.toStatus !== 'IN_REVIEW' ||
      pm1Update.data.activityLog?.userId !== pm1.user.id
    ) {
      throw new Error('PM1 status update failed');
    }

    // 5. Admin updates task: IN_REVIEW -> DONE
    console.log('\n5. Testing Admin status update (IN_REVIEW -> DONE)...');
    const adminUpdate = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'DONE' },
      admin.token
    );
    console.log(`   Admin PATCH status: ${adminUpdate.status}`);
    console.log(`   Updated Task Status: ${adminUpdate.data.task?.status}`);
    console.log(`   ActivityLog fromStatus: ${adminUpdate.data.activityLog?.fromStatus}, toStatus: ${adminUpdate.data.activityLog?.toStatus}, user: ${adminUpdate.data.activityLog?.userId}`);
    if (
      adminUpdate.status !== 200 ||
      adminUpdate.data.task?.status !== 'DONE' ||
      adminUpdate.data.activityLog?.fromStatus !== 'IN_REVIEW' ||
      adminUpdate.data.activityLog?.toStatus !== 'DONE' ||
      adminUpdate.data.activityLog?.userId !== admin.user.id
    ) {
      throw new Error('Admin status update failed');
    }

    // 6. Ownership & Role Restrictions (403 Forbidden)
    console.log('\n6. Testing Ownership Restrictions (403 FORBIDDEN)...');

    // Dev2 attempts to update Dev1's task
    const dev2Attempt = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'IN_PROGRESS' },
      dev2.token
    );
    console.log(`   Dev2 attempting to update Dev1 task: Status ${dev2Attempt.status}, Error:`, dev2Attempt.data.error);
    if (dev2Attempt.status !== 403 || dev2Attempt.data.error.code !== 'FORBIDDEN') {
      throw new Error('Dev2 was able to update Dev1 task!');
    }

    // PM2 attempts to update task in PM1's project
    const pm2Attempt = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'IN_PROGRESS' },
      pm2.token
    );
    console.log(`   PM2 attempting to update PM1 project task: Status ${pm2Attempt.status}, Error:`, pm2Attempt.data.error);
    if (pm2Attempt.status !== 403 || pm2Attempt.data.error.code !== 'FORBIDDEN') {
      throw new Error("PM2 was able to update task in PM1's project!");
    }

    // Dev1 attempts to update unassigned task in PM1's project
    const dev1UnassignedAttempt = await request(
      `/api/tasks/${unassignedTask.id}/status`,
      'PATCH',
      { status: 'IN_PROGRESS' },
      dev1.token
    );
    console.log(`   Dev1 attempting to update unassigned task: Status ${dev1UnassignedAttempt.status}, Error:`, dev1UnassignedAttempt.data.error);
    if (dev1UnassignedAttempt.status !== 403 || dev1UnassignedAttempt.data.error.code !== 'FORBIDDEN') {
      throw new Error('Dev1 was able to update an unassigned task!');
    }

    // 7. Activity Log Retrieval (GET /api/tasks/:id/activity)
    console.log('\n7. Testing GET /api/tasks/:id/activity...');

    // Dev1 queries activity of own task -> 200 OK
    const dev1Activity = await request(
      `/api/tasks/${dev1Task.id}/activity`,
      'GET',
      undefined,
      dev1.token
    );
    console.log(`   Dev1 GET activity: Status ${dev1Activity.status}, Rows: ${dev1Activity.data.activityLogs?.length}`);
    if (dev1Activity.status !== 200 || dev1Activity.data.activityLogs.length < 3) {
      throw new Error('Dev1 failed to get activity logs');
    }

    // Dev2 queries activity of Dev1's task -> 403 FORBIDDEN
    const dev2Activity = await request(
      `/api/tasks/${dev1Task.id}/activity`,
      'GET',
      undefined,
      dev2.token
    );
    console.log(`   Dev2 GET activity for Dev1 task: Status ${dev2Activity.status}, Error:`, dev2Activity.data.error);
    if (dev2Activity.status !== 403 || dev2Activity.data.error.code !== 'FORBIDDEN') {
      throw new Error("Dev2 was able to read activity of Dev1's task!");
    }

    // 8. Validation Error Check
    console.log('\n8. Testing Validation on invalid status...');
    const invalidStatus = await request(
      `/api/tasks/${dev1Task.id}/status`,
      'PATCH',
      { status: 'COMPLETED_INVALID' },
      dev1.token
    );
    console.log(`   Invalid status response: Status ${invalidStatus.status}, Error:`, invalidStatus.data.error);
    if (invalidStatus.status !== 400 || invalidStatus.data.error.code !== 'VALIDATION_ERROR') {
      throw new Error('Validation error check failed');
    }

    // Cleanup
    await prisma.activityLog.deleteMany({ where: { taskId: dev1Task.id } });
    await prisma.task.deleteMany({ where: { projectId: testProject.id } });
    await prisma.project.delete({ where: { id: testProject.id } });

    console.log('\n=== ALL PHASE 4 TASK STATUS & ACTIVITY TESTS PASSED! ===');
  } catch (error) {
    console.error('\nVerification failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runActivityTests();
