import cron from 'node-cron';
import { prisma } from '../config/db';

/**
 * Sweeps the database for tasks where dueDate is in the past,
 * isOverdue is currently false, and status is not 'DONE',
 * setting isOverdue to true.
 *
 * Exported so it can be called directly by tests without waiting for cron intervals.
 */
export const checkOverdueTasks = async (): Promise<number> => {
  const result = await prisma.task.updateMany({
    where: {
      dueDate: { lt: new Date() },
      isOverdue: false,
      status: { not: 'DONE' },
    },
    data: {
      isOverdue: true,
    },
  });

  return result.count;
};

/**
 * Starts the recurring overdue tasks cron job running every 5 minutes.
 */
export const startOverdueTasksJob = () => {
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await checkOverdueTasks();
      if (count > 0) {
        console.log(`[Job:OverdueTasks] Marked ${count} tasks as overdue`);
      }
    } catch (error) {
      console.error('[Job:OverdueTasks] Error executing overdue tasks job:', error);
    }
  });
};
