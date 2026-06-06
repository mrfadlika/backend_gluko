const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();
const VALID_STATUSES = ['scheduled', 'completed', 'cancelled'];

router.get('/doctors', async (req, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'dokter' },
      select: { id: true, name: true, specialty: true, avatarUrl: true }
    });
    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

router.post('/book', authMiddleware, async (req, res) => {
  try {
    const { doctorId, doctorName, doctorSpecialty, date, time, notes } = req.body;
    const patientId = req.user.id;

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: 'dokter' },
      select: { id: true, name: true, specialty: true, notificationEnabled: true }
    });

    if (!doctor) {
      return res.status(400).json({ error: 'Dokter tidak ditemukan' });
    }

    const consultation = await prisma.consultation.create({
      data: {
        patientId,
        patientName: req.user.name || req.body.patientName || 'Pasien',
        doctorId: doctor.id,
        doctorName: doctorName || doctor.name,
        doctorSpecialty: doctorSpecialty || doctor.specialty || 'Dokter Umum',
        date,
        time,
        notes,
        status: 'scheduled'
      }
    });

    const notificationData = [];

    if (doctor.notificationEnabled) {
      notificationData.push({
        userId: doctor.id,
        title: 'Konsultasi Baru',
        message: `${req.user.name || 'Pasien'} menjadwalkan konsultasi pada ${date} pukul ${time}.`,
        type: 'consultation'
      });
    }

    notificationData.push({
      userId: patientId,
      title: 'Konsultasi Terjadwal',
      message: `Konsultasi dengan ${consultation.doctorName} pada ${date} pukul ${time}.`,
      type: 'consultation'
    });

    await prisma.notification.createMany({ data: notificationData });

    res.status(201).json(consultation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to book consultation' });
  }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status konsultasi tidak valid' });
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      return res.status(404).json({ error: 'Konsultasi tidak ditemukan' });
    }

    const isParticipant =
      consultation.doctorId === req.user.id || consultation.patientId === req.user.id;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Tidak punya akses ke konsultasi ini' });
    }

    const updatedConsultation = await prisma.consultation.update({
      where: { id },
      data: { status }
    });

    const recipientId =
      req.user.id === consultation.doctorId ? consultation.patientId : consultation.doctorId;

    await prisma.notification.create({
      data: {
        userId: recipientId,
        title: 'Status Konsultasi Diperbarui',
        message: `Status konsultasi ${consultation.date} pukul ${consultation.time} berubah menjadi ${status}.`,
        type: 'consultation'
      }
    });

    res.json(updatedConsultation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update consultation status' });
  }
});

router.get('/history/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await prisma.consultation.findMany({
      where: { patientId: userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch consultation history' });
  }
});

router.get('/patients/:doctorId', authMiddleware, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const records = await prisma.consultation.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch doctor patients' });
  }
});

module.exports = router;
