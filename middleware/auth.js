require('../loadEnv');

const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum diisi. Tambahkan nilainya ke file .env.');
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'User tidak valid.' });
    }

    req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
  }
}

module.exports = { generateToken, authMiddleware, JWT_SECRET };
