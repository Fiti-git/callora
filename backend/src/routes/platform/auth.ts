import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import {
  authenticatePlatform,
  PlatformAuthRequest,
  signPlatformToken,
} from "../../middleware/platformAuth.js";
import { writeAudit } from "../../lib/audit.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.platformUser.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signPlatformToken({ id: user.id, email: user.email });

  await writeAudit({
    actorType: "PLATFORM_USER",
    actorId: user.id,
    action: "platform.login",
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
  });
});

router.get("/me", authenticatePlatform, (req: Request, res: Response) => {
  res.json((req as PlatformAuthRequest).platformUser);
});

export default router;
