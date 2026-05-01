// Internal endpoint exposed to the api-gateway (and other internal services)
// to read/increment per-org rate-limit counters. NOT mounted under
// `/api/platform/*` and NOT protected by platform JWT — it is intended to
// live behind the cluster network. Production deployments should restrict
// this path at the LB/network level (e.g. allow only api-gateway).

import express, { Request, Response } from "express";
import {
  getCounter,
  incrementCounter,
  isRateLimitBucket,
} from "../risk/rateLimit.js";

const router = express.Router();

router.get("/:orgId/:bucket", async (req: Request, res: Response) => {
  const { orgId, bucket } = req.params;
  if (!isRateLimitBucket(bucket)) {
    return res.status(400).json({ error: "unknown bucket" });
  }
  try {
    const result = await getCounter(orgId, bucket);
    res.json(result);
  } catch (err) {
    console.error("[rate-limit] get failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:orgId/:bucket/increment", async (req: Request, res: Response) => {
  const { orgId, bucket } = req.params;
  const by = Number(req.body?.by ?? 1);
  if (!isRateLimitBucket(bucket)) {
    return res.status(400).json({ error: "unknown bucket" });
  }
  try {
    const count = await incrementCounter(orgId, bucket, Number.isFinite(by) ? by : 1);
    const after = await getCounter(orgId, bucket);
    res.json({ ...after, count });
  } catch (err) {
    console.error("[rate-limit] increment failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
