import express from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();
router.use(authenticate);
// GET API KEYS
router.get("/", async (req, res) => {
    const { organizationId } = req.user;
    const keys = await prisma.apiKey.findUnique({
        where: { organizationId },
    });
    res.json(keys || {});
});
// UPDATE API KEYS
router.post("/", async (req, res) => {
    const { organizationId } = req.user;
    const data = req.body;
    try {
        // Check if exists
        const existing = await prisma.apiKey.findUnique({
            where: { organizationId },
        });
        let keys;
        if (existing) {
            keys = await prisma.apiKey.update({ where: { organizationId }, data });
        }
        else {
            keys = await prisma.apiKey.create({
                data: { ...data, organizationId },
            });
        }
        res.json({ success: true, keys });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
