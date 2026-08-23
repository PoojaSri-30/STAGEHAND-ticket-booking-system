const { releaseExpiredHolds } = require('../services/seatService');
const { expireStaleOffers } = require('../services/waitlistService');
require('dotenv').config();

const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS) || 15000;

function startScheduler(broadcastFn) {
  const tick = () => {
    try {
      const releasedCount = releaseExpiredHolds();
      const { expiredCount, cascaded } = expireStaleOffers();
      if (releasedCount > 0 || expiredCount > 0) {
        console.log(
          `[scheduler] released ${releasedCount} expired hold(s), expired ${expiredCount} waitlist offer(s), cascaded ${cascaded} new offer(s)`
        );
        if (typeof broadcastFn === 'function') broadcastFn();
      }
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    }
  };

  const handle = setInterval(tick, INTERVAL_MS);
  // Run once immediately on boot too.
  tick();
  return handle;
}

module.exports = { startScheduler };
