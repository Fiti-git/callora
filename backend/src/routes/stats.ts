import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const campaignCount = await prisma.campaign.count({
      where: { organizationId },
    });
    const leadCount = await prisma.lead.count({ where: { organizationId } });
    const qualifiedCount = await prisma.lead.count({
      where: { organizationId, status: "QUALIFIED" },
    });
    const callCount = await prisma.callLog.count({
      where: { lead: { organizationId } },
    });

    res.json({ campaignCount, leadCount, qualifiedCount, callCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /stats/activity — recent activity feed (last 15 events)
router.get("/activity", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const [recentCalls, recentCampaigns, recentContacts] = await Promise.all([
      prisma.callLog.findMany({
        where: { lead: { organizationId } },
        include: { lead: { select: { businessName: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.campaign.findMany({
        where: { organizationId, name: { not: "__DEMO__" } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.contact.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const events: { type: string; title: string; subtitle: string; timestamp: Date; status: string }[] = [];

    for (const call of recentCalls) {
      events.push({
        type: "call",
        title: `Call to ${call.lead.businessName}`,
        subtitle: call.lead.phone ?? "",
        timestamp: call.createdAt,
        status: call.status,
      });
    }

    for (const campaign of recentCampaigns) {
      events.push({
        type: "campaign",
        title: `Campaign: ${campaign.name}`,
        subtitle: campaign.status,
        timestamp: campaign.updatedAt,
        status: campaign.status,
      });
    }

    for (const contact of recentContacts) {
      events.push({
        type: "contact",
        title: `New contact: ${contact.businessName}`,
        subtitle: contact.email ?? contact.phone ?? "",
        timestamp: contact.createdAt,
        status: "NEW",
      });
    }

    // Sort all events by timestamp desc, return top 15
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json(events.slice(0, 15));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
