/**
 * GLUKO! Express Backend Server
 */

require('./loadEnv');

const express = require('express');
const cors = require('cors');
const mqttBridge = require('./services/mqttBridge');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '12mb' }));

// ─── Routes ─────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/glucose', require('./routes/glucose'));
app.use('/api/consumption', require('./routes/consumption'));
app.use('/api/consultation', require('./routes/consultation'));
app.use('/api/notifications', require('./routes/notification'));
app.use('/api/articles', require('./routes/article'));
app.use('/api/ai', require('./routes/ai'));

let mqttClient = null;

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const isMqttConnected = mqttClient ? mqttClient.connected : false;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mqtt: { connected: isMqttConnected },
  });
});

// ─── MQTT Status endpoint ───────────────────────────────────
app.get('/api/mqtt/status', (req, res) => {
  const isMqttConnected = mqttClient ? mqttClient.connected : false;
  res.json({ connected: isMqttConnected });
});

// ─── Start Server ───────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀 GLUKO! Backend running on http://localhost:${PORT}`);
  console.log(`📋 API Endpoints:`);
  console.log(`   POST   /api/auth/register`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   GET    /api/auth/me`);
  console.log(`   GET    /api/glucose/:userId`);
  console.log(`   POST   /api/glucose`);
  console.log(`   GET    /api/consumption/:userId`);
  console.log(`   POST   /api/consumption`);
  console.log(`   GET    /api/consultation/doctors`);
  console.log(`   POST   /api/consultation/book`);
  console.log(`   GET    /api/consultation/history/:userId`);
  console.log(`   GET    /api/consultation/patients/:doctorId`);
  console.log(`   GET    /api/notifications/:userId`);
  console.log(`   PUT    /api/notifications/:id/read`);
  console.log(`   POST   /api/ai/chat`);
  console.log(`   POST   /api/ai/analyze-image`);
  console.log(`   GET    /api/health`);
  console.log(`   GET    /api/mqtt/status`);
  console.log('');

  // Start MQTT bridge
  mqttClient = mqttBridge.setupMqttBridge();
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Another backend instance is probably still running.');
    console.error(
      'Stop the existing process or set PORT in your .env before starting a second backend.'
    );
    process.exit(1);
  }

  console.error('Failed to start backend server:', error);
  process.exit(1);
});
