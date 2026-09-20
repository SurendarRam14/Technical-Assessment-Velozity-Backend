import http from 'http';
import app from '../src/app';
import { prisma } from '../src/config/db';

async function runCrudTests() {
  console.log('=== Starting Phase 3 CRUD & Role Scoping Verification Suite ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4002, () => resolve()));
  const baseUrl = 'http://localhost:4002';

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
      throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
    }
    return { token: res.data.accessToken as string, user: res.data.user };
  };

  try {
    // Authenticate test users
    console.log('1. Authenticating test users...');
    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');
    console.log('   All 5 test users authenticated successfully.');

    // 2. Admin operations
    console.log('\n2. Testing Admin access...');
    const usersRes = await request('/api/users', 'GET', undefined, admin.token);
    console.log(`   GET /api/users (Admin): ${usersRes.status}, Count: ${usersRes.data.users?.length}`);
    if (usersRes.status !== 200) throw new Error('Admin GET /api/users failed');

    // Test GET /api/users with role filter (?role=DEVELOPER)
    const devUsersRes = await request('/api/users?role=DEVELOPER', 'GET', undefined, admin.token);
    console.log(`   GET /api/users?role=DEVELOPER: ${devUsersRes.status}, Count: ${devUsersRes.data.users?.length}`);
    if (devUsersRes.status !== 200 || devUsersRes.data.users.some((u: any) => u.role !== 'DEVELOPER')) {
      throw new Error('Role filtering on /api/users failed');
    }

    // Test GET /api/users with search query (?search=Alex)
    const searchUsersRes = await request('/api/users?search=Alex', 'GET', undefined, admin.token);
    console.log(`   GET /api/users?search=Alex: ${searchUsersRes.status}, Found: ${searchUsersRes.data.users?.map((u: any) => u.name).join(', ')}`);
    if (searchUsersRes.status !== 200 || !searchUsersRes.data.users.some((u: any) => u.name.includes('Alex'))) {
      throw new Error('Search filtering on /api/users failed');
    }

    // Test GET /api/users as PM -> should return 403 FORBIDDEN
    const pmUsersRes = await request('/api/users', 'GET', undefined, pm1.token);
    console.log(`   GET /api/users (PM1): ${pmUsersRes.status} (expected 403)`);
    if (pmUsersRes.status !== 403) throw new Error('PM was able to access /api/users!');

    const clientsRes = await request('/api/clients', 'GET', undefined, admin.token);
    console.log(`   GET /api/clients (Admin): ${clientsRes.status}, Count: ${clientsRes.data.clients?.length}`);
    if (clientsRes.status !== 200 || clientsRes.data.clients.length < 4) throw new Error('Admin GET /api/clients failed');

    // Test GET /api/clients as PM -> should succeed (200)
    const pmClientsRes = await request('/api/clients', 'GET', undefined, pm1.token);
    console.log(`   GET /api/clients (PM1): ${pmClientsRes.status}, Count: ${pmClientsRes.data.clients?.length}`);
    if (pmClientsRes.status !== 200) throw new Error('PM GET /api/clients failed');

    // Test GET /api/projects as Admin -> returns ALL projects across PMs with client and PM name
    const adminProjects = await request('/api/projects', 'GET', undefined, admin.token);
    console.log(`   GET /api/projects (Admin): ${adminProjects.status}, Count: ${adminProjects.data.projects?.length}`);
    if (adminProjects.status !== 200 || adminProjects.data.projects.length < 2) {
      throw new Error('Admin GET /api/projects failed');
    }
    const hasClientAndPm = adminProjects.data.projects.every(
      (p: any) => Boolean(p.client?.name) && Boolean(p.pm?.name)
    );
    if (!hasClientAndPm) throw new Error('Admin GET /api/projects missing client or PM name');

    const newClientRes = await request(
      '/api/clients',
      'POST',
      { name: `Client-${Date.now()}` },
      admin.token
    );
    console.log(`   POST /api/clients (Admin): ${newClientRes.status}, ID: ${newClientRes.data.client?.id}`);
    if (newClientRes.status !== 201) throw new Error('Admin POST /api/clients failed');
    const createdClientId = newClientRes.data.client.id;

    // Admin creates project assigned to PM1
    const newProjRes = await request(
      '/api/projects',
      'POST',
      {
        name: `Admin-Created Project ${Date.now()}`,
        clientId: createdClientId,
        pmId: pm1.user.id,
      },
      admin.token
    );
    console.log(`   POST /api/projects (Admin): ${newProjRes.status}, PM: ${newProjRes.data.project?.pm?.email}`);
    if (newProjRes.status !== 201 || newProjRes.data.project.pmId !== pm1.user.id) {
      throw new Error('Admin POST /api/projects failed');
    }

    // 3. PM Role Scoping
    console.log('\n3. Testing PM Role Scoping...');
    const pm1Projects = await request('/api/projects', 'GET', undefined, pm1.token);
    console.log(`   GET /api/projects (PM1): ${pm1Projects.status}, Count: ${pm1Projects.data.projects?.length}`);
    if (pm1Projects.status !== 200) throw new Error('PM1 GET /api/projects failed');
    // Ensure all returned projects belong to PM1
    const pm1Mismatch = pm1Projects.data.projects.some((p: any) => p.pmId !== pm1.user.id);
    if (pm1Mismatch) throw new Error('PM1 received projects belonging to another PM!');

    const pm2Projects = await request('/api/projects', 'GET', undefined, pm2.token);
    const pm2Project = pm2Projects.data.projects[0];
    console.log(`   PM2 Project ID: ${pm2Project.id}, Name: "${pm2Project.name}"`);

    // PM1 tries to access PM2's project by ID -> should return 403
    const pm1AccessPm2Proj = await request(`/api/projects/${pm2Project.id}`, 'GET', undefined, pm1.token);
    console.log(`   PM1 accessing PM2 project: Status ${pm1AccessPm2Proj.status}, Error:`, pm1AccessPm2Proj.data.error);
    if (pm1AccessPm2Proj.status !== 403 || pm1AccessPm2Proj.data.error.code !== 'FORBIDDEN') {
      throw new Error('PM1 was able to access PM2 project by ID!');
    }

    // PM1 tries to create task in PM2's project -> should return 403
    const pm1TaskInPm2Proj = await request(
      `/api/projects/${pm2Project.id}/tasks`,
      'POST',
      { title: 'Unauthorized Task' },
      pm1.token
    );
    console.log(`   PM1 creating task in PM2 project: Status ${pm1TaskInPm2Proj.status}, Error:`, pm1TaskInPm2Proj.data.error);
    if (pm1TaskInPm2Proj.status !== 403 || pm1TaskInPm2Proj.data.error.code !== 'FORBIDDEN') {
      throw new Error('PM1 was able to create task in PM2 project!');
    }

    // PM1 creates task in PM1's own project -> succeeds (201)
    const pm1OwnProj = pm1Projects.data.projects[0];
    const pm1CreateTask = await request(
      `/api/projects/${pm1OwnProj.id}/tasks`,
      'POST',
      {
        title: 'Valid Task Created by PM1',
        description: 'Testing task creation within own project',
        assigneeId: dev1.user.id,
        priority: 'HIGH',
      },
      pm1.token
    );
    console.log(`   PM1 creating task in own project: Status ${pm1CreateTask.status}, Task ID: ${pm1CreateTask.data.task?.id}`);
    if (pm1CreateTask.status !== 201) throw new Error('PM1 failed to create task in own project');
    const createdTaskId = pm1CreateTask.data.task.id;

    // PM1 lists tasks -> all tasks must belong to PM1's projects
    const pm1Tasks = await request('/api/tasks', 'GET', undefined, pm1.token);
    console.log(`   PM1 GET /api/tasks: Status ${pm1Tasks.status}, Count: ${pm1Tasks.data.tasks?.length}`);
    const pm1TaskMismatch = pm1Tasks.data.tasks.some((t: any) => t.project?.pmId !== pm1.user.id);
    if (pm1TaskMismatch) throw new Error('PM1 received tasks belonging to another PM!');

    // 4. Developer Role Scoping (MUST HOLD EVEN IF HIT DIRECTLY)
    console.log('\n4. Testing Developer Role Scoping (strict service-layer isolation)...');

    // Dev1 hits GET /api/clients -> 403
    const devClients = await request('/api/clients', 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/clients: Status ${devClients.status}, Error:`, devClients.data.error);
    if (devClients.status !== 403) throw new Error('Dev1 accessed /api/clients!');

    // Dev1 hits GET /api/projects -> 403
    const devProjects = await request('/api/projects', 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/projects: Status ${devProjects.status}, Error:`, devProjects.data.error);
    if (devProjects.status !== 403) throw new Error('Dev1 accessed GET /api/projects!');

    // Dev1 hits POST /api/projects -> 403
    const devCreateProj = await request(
      '/api/projects',
      'POST',
      { name: 'Illegal Project', clientId: createdClientId },
      dev1.token
    );
    console.log(`   Dev1 POST /api/projects: Status ${devCreateProj.status}, Error:`, devCreateProj.data.error);
    if (devCreateProj.status !== 403) throw new Error('Dev1 was able to create project!');

    // Dev1 hits POST /api/projects/:id/tasks -> 403
    const devCreateTask = await request(
      `/api/projects/${pm1OwnProj.id}/tasks`,
      'POST',
      { title: 'Dev Created Task' },
      dev1.token
    );
    console.log(`   Dev1 POST /api/projects/:id/tasks: Status ${devCreateTask.status}, Error:`, devCreateTask.data.error);
    if (devCreateTask.status !== 403) throw new Error('Dev1 was able to create task!');

    // Dev1 lists tasks: ONLY tasks assigned to Dev1 must be returned
    const dev1Tasks = await request('/api/tasks', 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/tasks: Status ${dev1Tasks.status}, Count: ${dev1Tasks.data.tasks?.length}`);
    if (dev1Tasks.status !== 200 || dev1Tasks.data.tasks.length === 0) throw new Error('Dev1 failed to list tasks');
    const dev1TaskMismatch = dev1Tasks.data.tasks.some((t: any) => t.assigneeId !== dev1.user.id);
    if (dev1TaskMismatch) throw new Error("Dev1 received tasks not assigned to Dev1!");

    // Dev1 fetches their own assigned task by ID -> 200
    const dev1TaskDetail = await request(`/api/tasks/${createdTaskId}`, 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/tasks/:ownTaskId: Status ${dev1TaskDetail.status}, Title: "${dev1TaskDetail.data.task?.title}"`);
    if (dev1TaskDetail.status !== 200) throw new Error('Dev1 failed to fetch own task');

    // Dev2 attempts to fetch Dev1's task by ID -> 403
    const dev2AccessDev1Task = await request(`/api/tasks/${createdTaskId}`, 'GET', undefined, dev2.token);
    console.log(`   Dev2 GET /api/tasks/:dev1TaskId: Status ${dev2AccessDev1Task.status}, Error:`, dev2AccessDev1Task.data.error);
    if (dev2AccessDev1Task.status !== 403 || dev2AccessDev1Task.data.error.code !== 'FORBIDDEN') {
      throw new Error("Dev2 was able to access Dev1's task!");
    }

    // Dev1 accesses project where they have assigned tasks -> 200, and only dev1 tasks are included
    const dev1ProjectDetail = await request(`/api/projects/${pm1OwnProj.id}`, 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/projects/:assignedProjectId: Status ${dev1ProjectDetail.status}, Tasks visible: ${dev1ProjectDetail.data.project?.tasks?.length}`);
    if (dev1ProjectDetail.status !== 200) throw new Error('Dev1 failed to access assigned project');
    const dev1ProjTaskMismatch = dev1ProjectDetail.data.project.tasks.some((t: any) => t.assigneeId !== dev1.user.id);
    if (dev1ProjTaskMismatch) throw new Error('Dev1 saw unassigned/other tasks in project detail!');

    // Create an isolated project owned by PM2 with a task assigned ONLY to Dev2
    const isolatedProj = await request(
      '/api/projects',
      'POST',
      { name: 'PM2 Secret Project', clientId: createdClientId, pmId: pm2.user.id },
      admin.token
    );
    await request(
      `/api/projects/${isolatedProj.data.project.id}/tasks`,
      'POST',
      { title: 'Dev2 Task', assigneeId: dev2.user.id },
      pm2.token
    );

    // Dev1 attempts to access project where they have NO assigned tasks -> 403
    const dev1UnassignedProj = await request(`/api/projects/${isolatedProj.data.project.id}`, 'GET', undefined, dev1.token);
    console.log(`   Dev1 GET /api/projects/:unassignedProjectId: Status ${dev1UnassignedProj.status}, Error:`, dev1UnassignedProj.data.error);
    if (dev1UnassignedProj.status !== 403 || dev1UnassignedProj.data.error.code !== 'FORBIDDEN') {
      throw new Error('Dev1 was able to access a project with no assigned tasks!');
    }

    // Direct Service Layer Invariant Checks (simulating middleware bypass)
    console.log('\n   [Direct Service Layer Invariant Tests]');
    const { ProjectsService } = await import('../src/modules/projects/projects.service');
    const { TasksService } = await import('../src/modules/tasks/tasks.service');
    const { ClientsService } = await import('../src/modules/clients/clients.service');

    let serviceThrew403 = false;
    try {
      await ProjectsService.listProjects({ id: dev1.user.id, role: 'DEVELOPER' as any });
    } catch (e: any) {
      if (e.statusCode === 403 && e.code === 'FORBIDDEN') serviceThrew403 = true;
    }
    if (!serviceThrew403) throw new Error('ProjectsService.listProjects did not throw 403 for Developer!');
    console.log('   - ProjectsService.listProjects directly threw 403 for Developer: OK');

    serviceThrew403 = false;
    try {
      await ClientsService.listClients({ id: dev1.user.id, role: 'DEVELOPER' as any });
    } catch (e: any) {
      if (e.statusCode === 403 && e.code === 'FORBIDDEN') serviceThrew403 = true;
    }
    if (!serviceThrew403) throw new Error('ClientsService.listClients did not throw 403 for Developer!');
    console.log('   - ClientsService.listClients directly threw 403 for Developer: OK');

    serviceThrew403 = false;
    try {
      await TasksService.createTask({ id: dev1.user.id, role: 'DEVELOPER' as any }, pm1OwnProj.id, { title: 'Bypass' });
    } catch (e: any) {
      if (e.statusCode === 403 && e.code === 'FORBIDDEN') serviceThrew403 = true;
    }
    if (!serviceThrew403) throw new Error('TasksService.createTask did not throw 403 for Developer!');
    console.log('   - TasksService.createTask directly threw 403 for Developer: OK');

    // Developer service query isolation: Developer queries all tasks without filter -> only their tasks returned
    const devTasksDirect = await TasksService.listTasks({ id: dev1.user.id, role: 'DEVELOPER' as any }, {});
    const devTasksDirectLeak = devTasksDirect.some((t: any) => t.assigneeId !== dev1.user.id);
    if (devTasksDirectLeak) throw new Error('TasksService.listTasks leaked non-assigned tasks to Developer!');
    console.log(`   - TasksService.listTasks enforced strict isolation (${devTasksDirect.length} tasks returned, 0 non-assigned): OK`);

    // 5. Query Filters test
    console.log('\n5. Testing Task Query Filters (?status=&priority=)...');
    const filteredTasks = await request('/api/tasks?status=IN_PROGRESS&priority=CRITICAL', 'GET', undefined, admin.token);
    console.log(`   Admin filtered tasks (status=IN_PROGRESS, priority=CRITICAL): Status ${filteredTasks.status}, Count: ${filteredTasks.data.tasks?.length}`);
    if (filteredTasks.status !== 200) throw new Error('Filtered tasks query failed');
    const filterMismatch = filteredTasks.data.tasks.some(
      (t: any) => t.status !== 'IN_PROGRESS' || t.priority !== 'CRITICAL'
    );
    if (filterMismatch) throw new Error('Filter query did not respect criteria!');

    console.log('\n=== ALL PHASE 3 CRUD & ROLE SCOPING TESTS PASSED! ===');
  } catch (err) {
    console.error('\nVerification failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runCrudTests();
