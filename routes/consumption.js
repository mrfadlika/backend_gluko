const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Tidak punya akses ke data ini' });
    }

    const records = await prisma.consumption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch consumption data' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      type,
      calories,
      carbs,
      protein,
      fat,
      date,
      time,
      imageUri,
      barcode,
      ocrText,
      sugarLabel,
    } = req.body;
    const recordDate = date || new Date().toISOString().split('T')[0];
    const normalizedCalories = parseOptionalNumber(calories);
    const normalizedCarbs = parseOptionalNumber(carbs);
    const normalizedProtein = parseOptionalNumber(protein);
    const normalizedFat = parseOptionalNumber(fat);
    
    const consumption = await prisma.consumption.create({
      data: {
        userId: req.user.id,
        title: String(title || 'Produk').trim() || 'Produk',
        type: String(type || 'product-scan').trim() || 'product-scan',
        calories: normalizedCalories !== null ? Math.round(normalizedCalories) : 0,
        carbs: normalizedCarbs,
        protein: normalizedProtein,
        fat: normalizedFat,
        imageUri: typeof imageUri === 'string' && imageUri.trim() ? imageUri.trim() : null,
        barcode: typeof barcode === 'string' && barcode.trim() ? barcode.trim() : null,
        ocrText: typeof ocrText === 'string' && ocrText.trim() ? ocrText.trim() : null,
        sugarLabel:
          typeof sugarLabel === 'string' && sugarLabel.trim()
            ? sugarLabel.trim()
            : null,
        date: recordDate,
        time: time || new Date().toTimeString().split(' ')[0].substring(0, 5)
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        sugarDailyLimit: true,
        glucoseAlertEnabled: true,
        notificationEnabled: true
      }
    });

    if (user?.notificationEnabled && user?.glucoseAlertEnabled) {
      const todayRecords = await prisma.consumption.findMany({
        where: { userId: req.user.id, date: recordDate },
        select: { carbs: true }
      });

      const totalSugar = todayRecords.reduce(
        (sum, item) => sum + (Number(item.carbs) || 0),
        0
      );

      if (totalSugar > user.sugarDailyLimit) {
        await prisma.notification.create({
          data: {
            userId: req.user.id,
            title: 'Batas Gula Harian Terlewati',
            message: `Total gula hari ini ${Math.round(totalSugar)}g, melewati batas ${Math.round(user.sugarDailyLimit)}g.`,
            type: 'warning'
          }
        });
      }
    }

    res.status(201).json(consumption);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save consumption data' });
  }
});

module.exports = router;
