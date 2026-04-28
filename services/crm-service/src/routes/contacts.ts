import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";
import { authenticate, AuthRequest } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { search } = req.query;
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        ...(search
          ? {
              OR: [
                { businessName: { contains: String(search), mode: "insensitive" } },
                { phone: { contains: String(search) } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId },
      include: { leads: true, deals: true, tasks: true, notes: { orderBy: { createdAt: "desc" } } },
    });
    if (!contact) return res.status(404).json({ error: "Not found" });
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { businessName, phone, address, email } = req.body;
  try {
    const contact = await prisma.contact.create({
      data: { businessName, phone, address, email, organizationId },
    });
    res.status(201).json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { businessName, address, email } = req.body;
  try {
    const contact = await prisma.contact.updateMany({
      where: { id: req.params.id, organizationId },
      data: { businessName, address, email },
    });
    res.json(contact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    await prisma.contact.deleteMany({ where: { id: req.params.id, organizationId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
