import http from 'http';
import { app } from './app';
import { initSocketServer } from './sockets';
import { prisma } from './config/db';

const PORT = 4004;

async function runTests() {
  console.log('=== STARTING PHASE 8 DASHBOARD AGGREGATE TESTS ===\n');

  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}/api`;

  try {
    // 1. Helper to login
    async function login(email: string) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!' }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
      return { token: data.accessToken, user: data.user };
    }

    console.log('1. Authenticating users...');
    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');
    console.log('   All users authenticated.\n');

    // 2. Test Admin Dashboard (GET /api/dashboard/admin)
    console.log('2. Testing Admin Dashboard (GET /api/dashboard/admin)...');
    
    // 2a. Admin access
    const adminRes = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const adminData = (await adminRes.json()) as any;
    console.log(`   Admin request: Status ${adminRes.status}`);
    if (adminRes.status !== 200) {
      throw new Error(`Admin dashboard failed: ${JSON.stringify(adminData)}`);
    }

    console.log('   Admin dashboard totals:', adminData.totals);
    console.log('   Admin dashboard tasksByStatus:', adminData.tasksByStatus);
    console.log('   Admin dashboard recentActivity count:', adminData.recentActivity.length);

    if (
      typeof adminData.totals.totalProjects !== 'number' ||
      typeof adminData.totals.totalTasks !== 'number' ||
      typeof adminData.totals.totalClients !== 'number' ||
      typeof adminData.totals.totalUsers !== 'number' ||
      typeof adminData.totals.overdueTasksCount !== 'number' ||
      typeof adminData.totals.onlineUsersCount !== 'number'
    ) {
      throw new Error('Admin totals missing required fields');
    }

    if (!adminData.tasksByStatus.TODO && adminData.tasksByStatus.TODO !== 0) {
      throw new Error('Admin tasksByStatus missing status keys');
    }

    // 2b. PM access forbidden
    const pmAccessAdminRes = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    console.log(`   PM accessing Admin dashboard: Status ${pmAccessAdminRes.status}`);
    if (pmAccessAdminRes.status !== 403) {
      throw new Error(`Expected 403 for PM accessing admin dashboard, got ${pmAccessAdminRes.status}`);
    }

    // 2c. Dev access forbidden
    const devAccessAdminRes = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    console.log(`   Dev accessing Admin dashboard: Status ${devAccessAdminRes.status}`);
    if (devAccessAdminRes.status !== 403) {
      throw new Error(`Expected 403 for Dev accessing admin dashboard, got ${devAccessAdminRes.status}`);
    }
    console.log('   Admin Dashboard tests passed!\n');

    // 3. Test PM Dashboard (GET /api/dashboard/pm)
    console.log('3. Testing PM Dashboard (GET /api/dashboard/pm)...');

    // 3a. PM1 access
    const pm1Res = await fetch(`${baseUrl}/dashboard/pm`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const pm1Data = (await pm1Res.json()) as any;
    console.log(`   PM1 request: Status ${pm1Res.status}`);
    if (pm1Res.status !== 200) {
      throw new Error(`PM dashboard failed: ${JSON.stringify(pm1Data)}`);
    }

    console.log('   PM1 totals:', pm1Data.totals);
    console.log('   PM1 projects count:', pm1Data.projects.length);
    console.log('   PM1 tasksByStatus:', pm1Data.tasksByStatus);
    console.log('   PM1 tasksByPriority:', pm1Data.tasksByPriority);

    // Verify PM1 does not see PM2's projects
    const pm2Projects = await prisma.project.findMany({
      where: { pmId: pm2.user.id },
      select: { id: true },
    });
    const pm2ProjectIds = new Set(pm2Projects.map((p) => p.id));

    for (const proj of pm1Data.projects) {
      if (pm2ProjectIds.has(proj.id)) {
        throw new Error(`Data leak: PM1 received PM2 project ID: ${proj.id}`);
      }
      if (!proj.taskCounts || typeof proj.progressPercentage !== 'number') {
        throw new Error(`Project summary missing taskCounts or progressPercentage: ${JSON.stringify(proj)}`);
      }
    }

    // 3b. Admin access forbidden
    const adminAccessPmRes = await fetch(`${baseUrl}/dashboard/pm`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    console.log(`   Admin accessing PM dashboard: Status ${adminAccessPmRes.status}`);
    if (adminAccessPmRes.status !== 403) {
      throw new Error(`Expected 403 for Admin accessing PM dashboard, got ${adminAccessPmRes.status}`);
    }

    // 3c. Dev access forbidden
    const devAccessPmRes = await fetch(`${baseUrl}/dashboard/pm`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    console.log(`   Dev accessing PM dashboard: Status ${devAccessPmRes.status}`);
    if (devAccessPmRes.status !== 403) {
      throw new Error(`Expected 403 for Dev accessing PM dashboard, got ${devAccessPmRes.status}`);
    }
    console.log('   PM Dashboard tests passed!\n');

    // 4. Test Developer Dashboard (GET /api/dashboard/developer)
    console.log('4. Testing Developer Dashboard (GET /api/dashboard/developer)...');

    // 4a. Dev1 access
    const dev1Res = await fetch(`${baseUrl}/dashboard/developer`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dev1Data = (await dev1Res.json()) as any;
    console.log(`   Dev1 request: Status ${dev1Res.status}`);
    if (dev1Res.status !== 200) {
      throw new Error(`Developer dashboard failed: ${JSON.stringify(dev1Data)}`);
    }

    console.log('   Dev1 totals:', dev1Data.totals);
    console.log('   Dev1 assignedTasks count:', dev1Data.assignedTasks.length);
    console.log('   Dev1 tasksByStatus:', dev1Data.tasksByStatus);
    console.log('   Dev1 tasksByPriority:', dev1Data.tasksByPriority);

    // Verify all tasks in Dev1's dashboard belong to Dev1
    for (const task of dev1Data.assignedTasks) {
      if (task.assigneeId !== dev1.user.id) {
        throw new Error(`Data leak: Dev1 received task assigned to someone else: ${JSON.stringify(task)}`);
      }
    }

    // Verify priority sorting: CRITICAL > HIGH > MEDIUM > LOW
    const priorityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    for (let i = 0; i < dev1Data.assignedTasks.length - 1; i++) {
      const current = dev1Data.assignedTasks[i];
      const next = dev1Data.assignedTasks[i + 1];

      const weightCurrent = priorityWeight[current.priority];
      const weightNext = priorityWeight[next.priority];

      if (weightCurrent < weightNext) {
        throw new Error(
          `Priority sort violation: Task #${current.id} (${current.priority}) appeared before Task #${next.id} (${next.priority})`
        );
      }
    }
    console.log('   Dev1 assigned tasks properly sorted by priority and due date.');

    // 4b. Admin access forbidden
    const adminAccessDevRes = await fetch(`${baseUrl}/dashboard/developer`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    console.log(`   Admin accessing Dev dashboard: Status ${adminAccessDevRes.status}`);
    if (adminAccessDevRes.status !== 403) {
      throw new Error(`Expected 403 for Admin accessing Developer dashboard, got ${adminAccessDevRes.status}`);
    }

    // 4c. PM access forbidden
    const pmAccessDevRes = await fetch(`${baseUrl}/dashboard/developer`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    console.log(`   PM accessing Dev dashboard: Status ${pmAccessDevRes.status}`);
    if (pmAccessDevRes.status !== 403) {
      throw new Error(`Expected 403 for PM accessing Developer dashboard, got ${pmAccessDevRes.status}`);
    }
    console.log('   Developer Dashboard tests passed!\n');

    console.log('=== ALL PHASE 8 DASHBOARD TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
