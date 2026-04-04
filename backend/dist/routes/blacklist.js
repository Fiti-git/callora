import express from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();
router.use(authenticate);
// GET /blacklist
router.get("/", async (req, res) => {
    const { organizationId } = req.user;
    try {
        const list = await prisma.blacklist.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
        });
        res.json(list);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /blacklist
router.post("/", async (req, res) => {
    const { organizationId } = req.user;
    const { phoneNumber, reason } = req.body;
    if (!phoneNumber)
        return res.status(400).json({ error: "phoneNumber is required" });
    try {
        const existing = await prisma.blacklist.findFirst({
            where: { organizationId, phoneNumber },
        });
        if (existing)
            return res.status(400).json({ error: "Number already blacklisted" });
        const entry = await prisma.blacklist.create({
            data: { phoneNumber, reason: reason || null, organizationId },
        });
        res.status(201).json(entry);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /blacklist/:id
router.delete("/:id", async (req, res) => {
    const { organizationId } = req.user;
    try {
        const entry = await prisma.blacklist.findUnique({ where: { id: req.params.id } });
        if (!entry || entry.organizationId !== organizationId)
            return res.status(404).json({ error: "Not found" });
        await prisma.blacklist.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
