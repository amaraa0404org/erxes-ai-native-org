import { Router } from 'express';

export const router: Router = Router();

// Phase 1.1: a single liveness probe. Phase 1.2+ adds real Express endpoints
// (e.g. /metrics in Phase 1.3 once prom-client is wired). The shared
// startPlugin() already mounts a default /health — this one is plugin-scoped
// and exposes additional metadata.
router.get('/health', (_req, res) => {
  res.json({ ok: true, plugin: 'ai', version: 'phase-1.1' });
});
