import express from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();
router.use(authenticate);
router.get("/", async (req, res) => {
    const { organizationId } = req.user;
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
