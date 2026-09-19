import { Priority, TaskStatus } from '@prisma/client';
import { prisma } from './config/db';
import { checkOverdueTasks, startOverdueTasksJob } from './jobs/overdueTasks.job';

async function runTests() {
  console.log('=== STARTING PHASE 9 OVERDUE TASKS JOB TESTS ===\n');

  // 1. Find a project to attach test tasks to
  const project = await prisma.project.findFirst();
  if (!project) {
    throw new Error('No project found in database to attach test tasks');
  }

  const now = new Date();
  const pastDueDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const futureDueDate = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours in future

  console.log('1. Creating test tasks for overdue sweep...');
  
  // Task 1: Past due, TODO, isOverdue: false (SHOULD become overdue)
  const taskPastTodo = await prisma.task.create({
    data: {
      projectId: project.id,
      title: `Test Task Past TODO ${Date.now()}`,
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: pastDueDate,
      isOverdue: false,
    },
  });

  // Task 2: Past due, DONE, isOverdue: false (SHOULD NOT become overdue because it is DONE)
  const taskPastDone = await prisma.task.create({
    data: {
      projectId: project.id,
      title: `Test Task Past DONE ${Date.now()}`,
      status: TaskStatus.DONE,
      priority: Priority.LOW,
      dueDate: pastDueDate,
      isOverdue: false,
    },
  });

  // Task 3: Future due, TODO, isOverdue: false (SHOULD NOT become overdue)
  const taskFutureTodo = await prisma.task.create({
    data: {
      projectId: project.id,
      title: `Test Task Future TODO ${Date.now()}`,
      status: TaskStatus.TODO,
      priority: Priority.HIGH,
      dueDate: futureDueDate,
      isOverdue: false,
    },
  });

  console.log(`   Created test tasks:`);
  console.log(`   - Past TODO: ${taskPastTodo.id}`);
  console.log(`   - Past DONE: ${taskPastDone.id}`);
  console.log(`   - Future TODO: ${taskFutureTodo.id}\n`);

  try {
    // 2. Execute sweep
    console.log('2. Executing checkOverdueTasks()...');
    const updatedCount = await checkOverdueTasks();
    console.log(`   Updated count returned: ${updatedCount}`);

    if (updatedCount < 1) {
      throw new Error(`Expected at least 1 task to be updated, got ${updatedCount}`);
    }

    // 3. Verify task states
    console.log('3. Verifying updated task states...');
    const [refreshedPastTodo, refreshedPastDone, refreshedFutureTodo] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskPastTodo.id } }),
      prisma.task.findUnique({ where: { id: taskPastDone.id } }),
      prisma.task.findUnique({ where: { id: taskFutureTodo.id } }),
    ]);

    if (!refreshedPastTodo?.isOverdue) {
      throw new Error(`Task ${taskPastTodo.id} (Past TODO) should be isOverdue: true, but was false`);
    }
    console.log('   - Past TODO task correctly marked as isOverdue: true');

    if (refreshedPastDone?.isOverdue) {
      throw new Error(`Task ${taskPastDone.id} (Past DONE) should remain isOverdue: false, but was true`);
    }
    console.log('   - Past DONE task correctly remained isOverdue: false');

    if (refreshedFutureTodo?.isOverdue) {
      throw new Error(`Task ${taskFutureTodo.id} (Future TODO) should remain isOverdue: false, but was true`);
    }
    console.log('   - Future TODO task correctly remained isOverdue: false\n');

    // 4. Test cron schedule initialization
    console.log('4. Testing cron schedule initialization...');
    const scheduledTask = startOverdueTasksJob();
    if (!scheduledTask || typeof scheduledTask.stop !== 'function') {
      throw new Error('startOverdueTasksJob did not return a valid ScheduledTask instance');
    }
    scheduledTask.stop();
    console.log('   - Cron job initialized and stopped successfully.\n');

    console.log('=== ALL PHASE 9 OVERDUE TASKS JOB TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    // Clean up test tasks
    console.log('5. Cleaning up test tasks...');
    await prisma.task.deleteMany({
      where: {
        id: { in: [taskPastTodo.id, taskPastDone.id, taskFutureTodo.id] },
      },
    });
    console.log('   Test tasks cleaned up.');
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
