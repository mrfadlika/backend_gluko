const express = require('express');
const { analyzeImage, sendMessage } = require('../services/geminiService');
const { scanProductImage } = require('../services/productScanService');

const router = express.Router();

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    const reply = await sendMessage({ message, history });
    res.json({ reply });
  } catch (error) {
    console.error('[AI] Chat request failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.expose ? error.message : 'Layanan AI sedang bermasalah. Coba lagi nanti.',
    });
  }
});

router.post('/analyze-image', async (req, res) => {
  try {
    const { base64Image, mimeType, userNote } = req.body || {};
    const reply = await analyzeImage({ base64Image, mimeType, userNote });
    res.json({ reply });
  } catch (error) {
    console.error('[AI] Vision request failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.expose ? error.message : 'Layanan AI sedang bermasalah. Coba lagi nanti.',
    });
  }
});

router.post('/scan-product', async (req, res) => {
  try {
    const { base64Image, mimeType } = req.body || {};
    const result = await scanProductImage({ base64Image, mimeType });
    res.json(result);
  } catch (error) {
    console.error('[AI] Product scan request failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.expose ? error.message : 'Gagal memproses scan produk. Coba foto ulang ya!',
    });
  }
});

module.exports = router;
