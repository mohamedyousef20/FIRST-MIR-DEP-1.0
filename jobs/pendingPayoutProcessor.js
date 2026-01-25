import User from '../models/user.model.js';

const DEFAULT_INTERVAL_MINUTES = 60 * 12; // 12 hours

const processPendingTransactions = async () => {
  try {
    const now = new Date();

    const users = await User.find({
      'wallet.pendingTransactions': {
        $elemMatch: {
          status: 'pending',
          releaseDate: { $lte: now }
        }
      }
    });

    for (const user of users) {
      if (!user.wallet) {
        continue;
      }

      let updated = false;
      const pendingBefore = user.wallet.pendingBalance || 0;
      const availableBefore = user.wallet.balance || 0;

      user.wallet.pendingTransactions = user.wallet.pendingTransactions || [];

      user.wallet.pendingTransactions.forEach((transaction) => {
        if (transaction.status === 'pending' && transaction.releaseDate <= now) {
          const amount = transaction.amount || 0;
          user.wallet.pendingBalance = Math.max(0, (user.wallet.pendingBalance || 0) - amount);
          user.wallet.balance = (user.wallet.balance || 0) + amount;
          user.wallet.availableBalance = user.wallet.balance;
          transaction.status = 'released';
          transaction.releasedAt = now;
          updated = true;
        }
      });

      if (updated) {
        await user.save();
        //console.log(`Released pending earnings for seller ${user._id}. Pending ${pendingBefore} -> ${user.wallet.pendingBalance}. Available ${availableBefore} -> ${user.wallet.balance}`);
      }
    }
  } catch (error) {
    console.error('Failed to process pending payouts:', error);
  }
};

export const startPendingPayoutProcessor = () => {
  const intervalMinutes = parseInt(process.env.WALLET_RELEASE_INTERVAL_MINUTES || `${DEFAULT_INTERVAL_MINUTES}`, 10);
  const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000;

  // Run once on startup
  processPendingTransactions();

  // Schedule repeated runs
  setInterval(processPendingTransactions, intervalMs);
};
