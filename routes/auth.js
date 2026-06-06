const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  specialty: true,
  avatarUrl: true,
  sugarDailyLimit: true,
  notificationEnabled: true,
  glucoseAlertEnabled: true,
  darkModeEnabled: true
};

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, specialty } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const userRole = role || 'pasien';

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password,
        role: userRole,
        specialty: userRole === 'dokter' ? specialty || 'Umum' : null
      }
    });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    const createdUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: userSelect
    });

    res.status(201).json({ user: createdUser, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        password: password
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        avatarUrl: user.avatarUrl,
        sugarDailyLimit: user.sugarDailyLimit,
        notificationEnabled: user.notificationEnabled,
        glucoseAlertEnabled: user.glucoseAlertEnabled,
        darkModeEnabled: user.darkModeEnabled
      },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: userSelect
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

router.put('/me', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      email,
      specialty,
      avatarUrl,
      sugarDailyLimit,
      notificationEnabled,
      glucoseAlertEnabled,
      darkModeEnabled
    } = req.body;

    const data = {};

    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      }
      data.name = trimmedName;
    }

    if (typeof email === 'string') {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email tidak boleh kosong' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: 'Email sudah digunakan akun lain' });
      }

      data.email = normalizedEmail;
    }

    if (typeof specialty === 'string') {
      data.specialty = specialty.trim() || null;
    }

    if (typeof avatarUrl === 'string') {
      data.avatarUrl = avatarUrl.trim() || null;
    }

    if (sugarDailyLimit !== undefined) {
      const parsedLimit = Number(sugarDailyLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: 'Batas gula harian tidak valid' });
      }
      data.sugarDailyLimit = parsedLimit;
    }

    if (typeof notificationEnabled === 'boolean') {
      data.notificationEnabled = notificationEnabled;
    }

    if (typeof glucoseAlertEnabled === 'boolean') {
      data.glucoseAlertEnabled = glucoseAlertEnabled;
    }

    if (typeof darkModeEnabled === 'boolean') {
      data.darkModeEnabled = darkModeEnabled;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: userSelect
    });

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email wajib diisi' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (user) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: 'Permintaan Reset Password',
          message: 'Permintaan reset password diterima. Hubungi admin GLUKO untuk bantuan perubahan password.',
          type: 'info'
        }
      });
    }

    res.json({
      success: true,
      message: 'Jika email terdaftar, permintaan reset password sudah diterima.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to request password reset' });
  }
});

router.get('/export', authMiddleware, async (req, res) => {
  try {
    const [
      user,
      glucoseReadings,
      consumptions,
      consultations,
      notifications,
      articleBookmarks
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: userSelect
      }),
      prisma.glucoseReading.findMany({
        where: { userId: req.user.id },
        orderBy: { receivedAt: 'desc' }
      }),
      prisma.consumption.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.consultation.findMany({
        where: {
          OR: [
            { patientId: req.user.id },
            { doctorId: req.user.id }
          ]
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.articleBookmark.findMany({
        where: { userId: req.user.id },
        include: { article: true },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      user,
      glucoseReadings,
      consumptions,
      consultations,
      notifications,
      articleBookmarks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

router.delete('/history', authMiddleware, async (req, res) => {
  try {
    const [glucoseResult, consumptionResult] = await prisma.$transaction([
      prisma.glucoseReading.deleteMany({ where: { userId: req.user.id } }),
      prisma.consumption.deleteMany({ where: { userId: req.user.id } })
    ]);

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: 'Riwayat Dihapus',
        message: 'Riwayat konsumsi dan scan gula darah berhasil dihapus.',
        type: 'info'
      }
    });

    res.json({
      success: true,
      deleted: {
        glucoseReadings: glucoseResult.count,
        consumptions: consumptionResult.count
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

module.exports = router;
