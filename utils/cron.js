import cron from 'node-cron';
import { releasePendingEarnings } from '../controllers/order.controller.js';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  //console.log('Running daily pending earnings release...');
  try {
    const result = await releasePendingEarnings();
    //console.log('Pending earnings release completed:', result);
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});

//console.log('Cron job scheduler started...');