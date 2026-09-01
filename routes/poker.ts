import { Router } from 'express';

const router = Router();

/** GET /api/poker/tournaments — return upcoming scheduled tournaments */
router.get('/tournaments', async (_req, res) => {
  // In-memory tournament list — tournaments stored in pokerService
  // For now return empty array (tournaments module not yet integrated)
  res.json({ tournaments: [] });
});

export default router;
