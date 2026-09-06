import cron from 'node-cron';

const task = cron.schedule('* * * * * *', () => {
  // console.log('수신중');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await task.destroy();
    process.exit(0);
  });
}
