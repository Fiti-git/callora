import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();
const SECRET = process.env.NEXTAUTH_SECRET || "fallback_secret";

// REGISTER
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name, orgName } = req.body;

  if (!email || !password || !name || !orgName) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "User exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName } });
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          organizationId: org.id,
        },
      });
      return user;
    });

    res.status(201).json({ success: true, userId: result.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organizationId: user.organizationId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ME
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, organizationId: true },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

export default router;
