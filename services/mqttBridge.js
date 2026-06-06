const mqtt = require('mqtt');
// Import Prisma if you ever decide to save the raw MQTT payload directly from the bridge
// const prisma = require('../prismaClient'); 

const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const MQTT_TOPICS = ['gluko/health/data', 'gluko/health/hasil'];

function setupMqttBridge() {
  console.log(`[MQTT Bridge] Connecting to ${MQTT_BROKER}...`);

  const client = mqtt.connect(MQTT_BROKER, {
    clientId: `gluko-backend-${Math.random().toString(16).substr(2, 8)}`,
    clean: true,
  });

  client.on('connect', () => {
    console.log('[MQTT Bridge] ✅ Connected to broker');
    client.subscribe(MQTT_TOPICS, (err) => {
      if (!err) {
        console.log(`[MQTT Bridge] 📡 Subscribed to: ${MQTT_TOPICS.join(", ")}`);
      }
    });
  });

  client.on('message', async (topic, message) => {
    if (MQTT_TOPICS.includes(topic)) {
      try {
        const data = JSON.parse(message.toString());
        const isResult = topic === 'gluko/health/hasil';

        if (isResult) {
          console.log('[MQTT Bridge] 🏆 FINAL RESULT received:', {
            glucose: data.gula_darah,
            bpm: data.bpm,
            finger: data.finger_detected,
            status: data.status_gula_darah
          });
        } else {
          // Hanya menyimpan/memantau diam-diam agar terminal tidak banjir log
        }

        // The mobile app handles saving the glucose reading directly via the POST /api/glucose API
        // because it knows the current user's ID.
        // We just log it here for monitoring.
      } catch (err) {
        console.error('[MQTT Bridge] ❌ Parse error:', err.message);
      }
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT Bridge] ❌ Connection error:', err.message);
  });

  return client;
}

module.exports = { setupMqttBridge };
