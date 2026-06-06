const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Tidak punya akses ke data ini' });
    }

    const readings = await prisma.glucoseReading.findMany({
      where: { userId },
      orderBy: { receivedAt: 'desc' }
    });

    res.json(readings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      sessionId, glucoseValue, glucoseUnit, glucoseStatus, 
      bpm, irAvg, redAvg, deviceStatus, measuredAt, receivedAt 
    } = req.body;
    
    const reading = await prisma.glucoseReading.create({
      data: {
        userId: req.user.id,
        sessionId,
        glucoseValue,
        glucoseUnit: glucoseUnit || 'mg/dL',
        glucoseStatus: glucoseStatus || 'Normal',
        bpm,
        irAvg,
        redAvg,
        deviceStatus: deviceStatus || 'Data terbaca',
        measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
        receivedAt: receivedAt ? new Date(receivedAt) : new Date()
      }
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: 'Hasil Scan Tersimpan',
        message: `Gula darah ${reading.glucoseValue} ${reading.glucoseUnit} - ${reading.glucoseStatus}.`,
        type: 'glucose'
      }
    });

    res.status(201).json(reading);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save reading' });
  }
});

module.exports = router;
