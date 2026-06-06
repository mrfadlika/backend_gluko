const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { read: true }
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/read-all/mine', authMiddleware, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true }
    });

    res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

module.exports = router;
