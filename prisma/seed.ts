import { PrismaClient, Role, TaskStatus, Priority } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding ---');

  // 1. Clean existing records in reverse dependency order
  console.log('Clearing existing database records...');
  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  // 2. Hash default password
  const defaultPassword = 'Password123!';
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

  // 3. Seed Users: 1 Admin, 2 PMs, 4 Developers
  console.log('Creating users...');
  const admin = await prisma.user.create({
    data: {
      name: 'Alice Admin',
      email: 'admin@projectpulse.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const pm1 = await prisma.user.create({
    data: {
      name: 'Sarah Jenkins (PM)',
      email: 'pm1@projectpulse.com',
      passwordHash,
      role: Role.PM,
    },
  });

  const pm2 = await prisma.user.create({
    data: {
      name: 'David Chen (PM)',
      email: 'pm2@projectpulse.com',
      passwordHash,
      role: Role.PM,
    },
  });

  const dev1 = await prisma.user.create({
    data: {
      name: 'Alex Rivera (Dev)',
      email: 'dev1@projectpulse.com',
      passwordHash,
      role: Role.DEVELOPER,
    },
  });

  const dev2 = await prisma.user.create({
    data: {
      name: 'Emma Watson (Dev)',
      email: 'dev2@projectpulse.com',
      passwordHash,
      role: Role.DEVELOPER,
    },
  });

  const dev3 = await prisma.user.create({
    data: {
      name: 'Liam Patel (Dev)',
      email: 'dev3@projectpulse.com',
      passwordHash,
      role: Role.DEVELOPER,
    },
  });

  const dev4 = await prisma.user.create({
    data: {
      name: 'Sophia Kim (Dev)',
      email: 'dev4@projectpulse.com',
      passwordHash,
      role: Role.DEVELOPER,
    },
  });

  console.log('Seeded 7 users (1 Admin, 2 PMs, 4 Developers)');

  // 4. Seed 4 Clients
  console.log('Creating clients...');
  const clientAcme = await prisma.client.create({
    data: { name: 'Acme Corporation' },
  });
  const clientStarlight = await prisma.client.create({
    data: { name: 'Starlight Media' },
  });
  const clientNexus = await prisma.client.create({
    data: { name: 'Nexus FinTech' },
  });
  const clientHealth = await prisma.client.create({
    data: { name: 'HealthPulse Systems' },
  });

  console.log('Seeded 4 clients');

  // 5. Seed 4 Projects (owned across the 2 PMs)
  console.log('Creating projects...');
  const project1 = await prisma.project.create({
    data: {
      name: 'Enterprise Cloud Portal',
      clientId: clientAcme.id,
      pmId: pm1.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile Streaming Platform',
      clientId: clientStarlight.id,
      pmId: pm1.id,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Payment Gateway Core',
      clientId: clientNexus.id,
      pmId: pm2.id,
    },
  });

  const project4 = await prisma.project.create({
    data: {
      name: 'Healthcare Analytics Suite',
      clientId: clientHealth.id,
      pmId: pm2.id,
    },
  });

  console.log('Seeded 4 projects distributed across PMs');

  // 6. Seed Tasks (5+ tasks per project across TODO, IN_PROGRESS, IN_REVIEW, DONE, with overdue tasks)
  console.log('Creating tasks...');
  const now = new Date();
  const daysOffset = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Project 1 Tasks (6 tasks)
  const p1t1 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Configure OAuth2 SSO Provider',
      description: 'Implement SAML and OIDC authentication flows for corporate identity providers.',
      assigneeId: dev1.id,
      status: TaskStatus.DONE,
      priority: Priority.HIGH,
      dueDate: daysOffset(-7),
      isOverdue: false,
    },
  });

  const p1t2 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Design Responsive Navbar & Dashboard Layout',
      description: 'Create mobile-friendly shell with role-based navigation sidebar.',
      assigneeId: dev2.id,
      status: TaskStatus.DONE,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(-3),
      isOverdue: false,
    },
  });

  const p1t3 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Implement Multi-Tenant Organization Switcher',
      description: 'Allow users belonging to multiple enterprise tenants to switch context seamlessly.',
      assigneeId: dev1.id,
      status: TaskStatus.IN_REVIEW,
      priority: Priority.HIGH,
      dueDate: daysOffset(2),
      isOverdue: false,
    },
  });

  // Overdue Task 1
  const p1t4 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Audit IAM Permissions & Security Policies',
      description: 'Conduct comprehensive least-privilege review on role matrix before compliance sign-off.',
      assigneeId: dev3.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.CRITICAL,
      dueDate: daysOffset(-5),
      isOverdue: true,
    },
  });

  const p1t5 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Write End-to-End Cypress Test Suites',
      description: 'Automate smoke and regression flows covering core dashboard navigation.',
      assigneeId: dev4.id,
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(10),
      isOverdue: false,
    },
  });

  const p1t6 = await prisma.task.create({
    data: {
      projectId: project1.id,
      title: 'Setup Grafana Metrics & Alert Webhooks',
      description: 'Configure Prometheus scrapers and PagerDuty notification channels.',
      assigneeId: null,
      status: TaskStatus.TODO,
      priority: Priority.LOW,
      dueDate: daysOffset(14),
      isOverdue: false,
    },
  });

  // Project 2 Tasks (6 tasks)
  const p2t1 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'HLS Video Streaming Protocol Integration',
      description: 'Implement adaptive bitrate streaming pipeline with fallback chunks.',
      assigneeId: dev2.id,
      status: TaskStatus.DONE,
      priority: Priority.CRITICAL,
      dueDate: daysOffset(-6),
      isOverdue: false,
    },
  });

  // Overdue Task 2
  const p2t2 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'Build Offline Playback DRM Cache',
      description: 'Encrypted local storage indexing for downloaded media files on client devices.',
      assigneeId: dev3.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: daysOffset(-4),
      isOverdue: true,
    },
  });

  const p2t3 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'Player UI Playback Speed Controls',
      description: 'Expose 0.5x, 1x, 1.25x, 1.5x, 2x playback options in custom media controls.',
      assigneeId: dev4.id,
      status: TaskStatus.IN_REVIEW,
      priority: Priority.LOW,
      dueDate: daysOffset(4),
      isOverdue: false,
    },
  });

  const p2t4 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'Personalized Recommendation Carousel',
      description: 'Incorporate collaborative filtering recommendation feed for user home screen.',
      assigneeId: dev1.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(5),
      isOverdue: false,
    },
  });

  const p2t5 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'Fix Audio Desynchronization on Safari',
      description: 'Investigate WebAudio buffer drift occurring during background tab throttling.',
      assigneeId: dev2.id,
      status: TaskStatus.TODO,
      priority: Priority.HIGH,
      dueDate: daysOffset(8),
      isOverdue: false,
    },
  });

  const p2t6 = await prisma.task.create({
    data: {
      projectId: project2.id,
      title: 'Telemetry Logging for Playback Quality',
      description: 'Collect buffering event frequencies and dropped frame rates in client beacons.',
      assigneeId: null,
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(12),
      isOverdue: false,
    },
  });

  // Project 3 Tasks (6 tasks)
  const p3t1 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'PCI-DSS Compliance Hardening',
      description: 'Tokenize payment card details; verify non-retention of CVV and raw PAN data.',
      assigneeId: dev3.id,
      status: TaskStatus.DONE,
      priority: Priority.CRITICAL,
      dueDate: daysOffset(-10),
      isOverdue: false,
    },
  });

  const p3t2 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'Stripe Webhook Event Idempotency Handler',
      description: 'Prevent double-processing of charge.succeeded and invoice.payment_failed events.',
      assigneeId: dev4.id,
      status: TaskStatus.IN_REVIEW,
      priority: Priority.HIGH,
      dueDate: daysOffset(1),
      isOverdue: false,
    },
  });

  const p3t3 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'Instant Payout Integration via ACH',
      description: 'Integrate real-time settlement rails with partner banking APIs.',
      assigneeId: dev1.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: daysOffset(3),
      isOverdue: false,
    },
  });

  const p3t4 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'Recurring Subscription Billing Flow',
      description: 'Support tiered pricing, prorated billing on mid-cycle plan changes, and grace periods.',
      assigneeId: dev2.id,
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(7),
      isOverdue: false,
    },
  });

  const p3t5 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'Chargeback Dispute Notification Engine',
      description: 'Trigger immediate automated alerts and PM notifications when dispute is logged.',
      assigneeId: dev3.id,
      status: TaskStatus.TODO,
      priority: Priority.LOW,
      dueDate: daysOffset(9),
      isOverdue: false,
    },
  });

  const p3t6 = await prisma.task.create({
    data: {
      projectId: project3.id,
      title: 'Automated Reconciliation Report Export',
      description: 'Generate daily balance reconciliation CSVs comparing ledger against processor deposits.',
      assigneeId: null,
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(15),
      isOverdue: false,
    },
  });

  // Project 4 Tasks (6 tasks)
  const p4t1 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'FHIR Patient Record Ingestion Service',
      description: 'Parse incoming HL7/FHIR v4 JSON payloads into normalized patient clinical models.',
      assigneeId: dev4.id,
      status: TaskStatus.DONE,
      priority: Priority.HIGH,
      dueDate: daysOffset(-12),
      isOverdue: false,
    },
  });

  const p4t2 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'Role-based Doctor / Nurse Access Matrix',
      description: 'Enforce granular row-level access control on sensitive patient chart notes.',
      assigneeId: dev1.id,
      status: TaskStatus.DONE,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(-8),
      isOverdue: false,
    },
  });

  const p4t3 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'Realtime Vitals Anomaly Detection Pipeline',
      description: 'Evaluate heart rate and blood pressure streams against critical ICU threshold rules.',
      assigneeId: dev2.id,
      status: TaskStatus.IN_REVIEW,
      priority: Priority.CRITICAL,
      dueDate: daysOffset(2),
      isOverdue: false,
    },
  });

  const p4t4 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'Lab Results PDF Generation Service',
      description: 'Render digital signatures and formatted clinical pathology results with QR verification.',
      assigneeId: dev3.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.MEDIUM,
      dueDate: daysOffset(3),
      isOverdue: false,
    },
  });

  const p4t5 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'Patient Appointment Scheduling Calendar',
      description: 'Interactive calendar widget with provider availability slots and conflict checks.',
      assigneeId: dev4.id,
      status: TaskStatus.TODO,
      priority: Priority.HIGH,
      dueDate: daysOffset(11),
      isOverdue: false,
    },
  });

  const p4t6 = await prisma.task.create({
    data: {
      projectId: project4.id,
      title: 'HIPAA Audit Trail Storage & Retention',
      description: 'Immutable access logging verifying compliance with regulatory retention limits.',
      assigneeId: null,
      status: TaskStatus.TODO,
      priority: Priority.CRITICAL,
      dueDate: daysOffset(16),
      isOverdue: false,
    },
  });

  console.log('Seeded 24 tasks across 4 projects (with 2 overdue tasks)');

  // 7. Seed 13 ActivityLog rows so initial activity feed is active
  console.log('Creating activity logs...');
  const logsData = [
    {
      taskId: p1t1.id,
      projectId: project1.id,
      userId: dev1.id,
      fromStatus: null,
      toStatus: TaskStatus.TODO,
      createdAt: daysOffset(-8),
    },
    {
      taskId: p1t1.id,
      projectId: project1.id,
      userId: dev1.id,
      fromStatus: TaskStatus.TODO,
      toStatus: TaskStatus.IN_PROGRESS,
      createdAt: daysOffset(-7),
    },
    {
      taskId: p1t1.id,
      projectId: project1.id,
      userId: dev1.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.DONE,
      createdAt: daysOffset(-6),
    },
    {
      taskId: p1t2.id,
      projectId: project1.id,
      userId: dev2.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.DONE,
      createdAt: daysOffset(-3),
    },
    {
      taskId: p1t3.id,
      projectId: project1.id,
      userId: dev1.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.IN_REVIEW,
      createdAt: daysOffset(-1),
    },
    {
      taskId: p1t4.id,
      projectId: project1.id,
      userId: dev3.id,
      fromStatus: TaskStatus.TODO,
      toStatus: TaskStatus.IN_PROGRESS,
      createdAt: daysOffset(-5),
    },
    {
      taskId: p2t1.id,
      projectId: project2.id,
      userId: dev2.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.DONE,
      createdAt: daysOffset(-5),
    },
    {
      taskId: p2t2.id,
      projectId: project2.id,
      userId: dev3.id,
      fromStatus: TaskStatus.TODO,
      toStatus: TaskStatus.IN_PROGRESS,
      createdAt: daysOffset(-4),
    },
    {
      taskId: p2t3.id,
      projectId: project2.id,
      userId: dev4.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.IN_REVIEW,
      createdAt: daysOffset(-1),
    },
    {
      taskId: p3t1.id,
      projectId: project3.id,
      userId: dev3.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.DONE,
      createdAt: daysOffset(-9),
    },
    {
      taskId: p3t2.id,
      projectId: project3.id,
      userId: dev4.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.IN_REVIEW,
      createdAt: daysOffset(-1),
    },
    {
      taskId: p4t1.id,
      projectId: project4.id,
      userId: dev4.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.DONE,
      createdAt: daysOffset(-11),
    },
    {
      taskId: p4t3.id,
      projectId: project4.id,
      userId: dev2.id,
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.IN_REVIEW,
      createdAt: daysOffset(-2),
    },
  ];

  for (const log of logsData) {
    await prisma.activityLog.create({
      data: log,
    });
  }

  console.log('Seeded 13 ActivityLog entries');

  // 8. Seed sample notifications
  console.log('Creating initial notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: dev1.id,
        taskId: p1t3.id,
        message: 'Your task "Implement Multi-Tenant Organization Switcher" was moved to IN_REVIEW.',
        read: false,
        createdAt: daysOffset(-1),
      },
      {
        userId: pm1.id,
        taskId: p1t4.id,
        message: 'Task "Audit IAM Permissions & Security Policies" is now overdue.',
        read: false,
        createdAt: daysOffset(-3),
      },
      {
        userId: dev2.id,
        taskId: p4t3.id,
        message: 'You were assigned to "Realtime Vitals Anomaly Detection Pipeline".',
        read: true,
        createdAt: daysOffset(-4),
      },
      {
        userId: pm2.id,
        taskId: p3t2.id,
        message: 'Task "Stripe Webhook Event Idempotency Handler" is awaiting review.',
        read: false,
        createdAt: daysOffset(-1),
      },
    ],
  });

  console.log('Seeded 4 notifications');
  console.log('--- Database Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
