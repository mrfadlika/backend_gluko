const { GoogleGenAI } = require('@google/genai');

const TEXT_MODELS = ['gemini-2.5-flash-lite'];
const VISION_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const TEXT_SYSTEM_INSTRUCTION = `Namamu adalah Daeng Te'ne, asisten edukasi diabetes dan nutrisi yang dibuat oleh Raffi Agent.
Jangan pernah menyebut dirimu sebagai model bahasa atau mengatakan bahwa kamu dilatih oleh Google.
Peran utamamu adalah membantu user mengurangi risiko diabetes dan mengelola gula darah melalui pilihan makanan yang cerdas.
Spesialisasi: resep ramah gula, meal planning, edukasi nutrisi untuk diabetes dan prediabetes.
- Jika user bertanya tentang makanan, resep, atau diet, fokus pada gula tambahan rendah, karbo terkontrol, protein dan serat yang lebih tinggi, dan rasa yang tetap enak.
- Jika user bertanya hal umum, jawab singkat dan ramah lalu arahkan kembali ke bantuan terkait diabetes atau nutrisi bila relevan.
Aturan ketat:
- Jangan memberi dosis obat.
- Jika user minta saran medis personal atau diagnosis, arahkan konsultasi dokter.
- Beri saran yang realistis di Indonesia dengan bahan yang mudah dicari.
Gunakan teks biasa yang rapi, mudah dibaca, ringkas, dan informatif.`;

const VISION_SYSTEM_INSTRUCTION = `Kamu adalah asisten edukasi nutrisi untuk membantu mengurangi risiko diabetes dan mengelola gula darah.
Fokus pada makanan dan minuman, perkiraan gula dan karbo, saran substitusi yang lebih rendah gula, dan ide resep yang tetap enak.
Aturan ketat:
- Jangan mendiagnosis diabetes dari foto.
- Jangan memberi dosis obat atau instruksi medis spesifik.
- Selalu sertakan peringatan bahwa ini estimasi dan bukan pengganti dokter atau ahli gizi.`;

let aiClient = null;
let cachedApiKey = null;

function createVisibleError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getAiClient() {
  const apiKey = getApiKey().trim();

  if (!apiKey) {
    throw createVisibleError('GEMINI_API_KEY belum diisi di environment backend.', 500);
  }

  if (!aiClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    aiClient = new GoogleGenAI({ apiKey });
  }

  return aiClient;
}

function isRateLimitError(error) {
  const message = String(error?.message || error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('quota')
  );
}

function isApiKeyError(error) {
  const message = String(error?.message || error).toLowerCase();
  return (
    message.includes('api key') ||
    message.includes('permission_denied') ||
    message.includes('reported as leaked') ||
    message.includes('api_key') ||
    message.includes('403')
  );
}

function parseCooldownSeconds(error) {
  const message = String(error?.message || error);
  const match = message.match(/retry\s*(?:in|delay['"]?\s*:?\s*['"]?)\s*(\d+(?:\.\d+)?)\s*s/i);
  if (match) {
    return Math.ceil(Number.parseFloat(match[1]));
  }

  return 60;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeTextPart(part) {
  if (!part || typeof part.text !== 'string') {
    return '';
  }

  return part.text.trim();
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (!entry || (entry.role !== 'user' && entry.role !== 'model')) {
        return null;
      }

      const text = Array.isArray(entry.parts)
        ? entry.parts.map(sanitizeTextPart).filter(Boolean).join('\n\n')
        : '';

      if (!text) {
        return null;
      }

      return {
        role: entry.role,
        parts: [{ text }],
      };
    })
    .filter(Boolean)
    .slice(-20);
}

function normalizeBase64Image(base64Image) {
  if (typeof base64Image !== 'string') {
    return '';
  }

  const trimmed = base64Image.trim();
  const commaIndex = trimmed.indexOf(',');

  if (trimmed.startsWith('data:') && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
}

function extractJsonObject(text) {
  const input = String(text || "").trim();
  if (!input) {
    return null;
  }

  const fencedMatch = input.match(/```json\s*([\s\S]*?)```/i) || input.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : input;
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(firstBraceIndex, lastBraceIndex + 1));
  } catch {
    return null;
  }
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampConfidence(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "low";
}

function normalizeNutritionExtraction(payload = {}) {
  const found = payload?.found === true;
  const basis = (() => {
    const normalized = String(payload?.basis || "").toLowerCase();
    if (normalized === "100g" || normalized === "100ml" || normalized === "serving") {
      return normalized;
    }
    return "unknown";
  })();

  return {
    found,
    basis,
    servingSize: String(payload?.serving_size || "").trim(),
    quantity: String(payload?.quantity || "").trim(),
    energyKcal: parseNullableNumber(payload?.energy_kcal),
    proteinG: parseNullableNumber(payload?.protein_g),
    fatG: parseNullableNumber(payload?.fat_g),
    saturatedFatG: parseNullableNumber(payload?.saturated_fat_g),
    carbohydratesG: parseNullableNumber(payload?.carbohydrates_g),
    sugarsG: parseNullableNumber(payload?.sugars_g),
    fiberG: parseNullableNumber(payload?.fiber_g),
    sodiumG: parseNullableNumber(payload?.sodium_g),
    saltG: parseNullableNumber(payload?.salt_g),
    confidence: clampConfidence(payload?.confidence),
    notes: String(payload?.notes || "").trim(),
  };
}

function mapModelError(error, mode) {
  if (!error) {
    return createVisibleError('Layanan AI sedang bermasalah. Coba lagi sebentar.', 500);
  }

  if (error.expose) {
    return error;
  }

  if (isRateLimitError(error)) {
    const cooldown = parseCooldownSeconds(error);
    if (mode === 'vision') {
      return createVisibleError(
        `Kuota analisis foto habis. Coba lagi dalam ~${cooldown} detik ya!`,
        429
      );
    }

    return createVisibleError(
      `Maaf, kuota Daeng Te'ne habis. Coba lagi dalam ~${cooldown} detik ya!`,
      429
    );
  }

  if (isApiKeyError(error)) {
    return createVisibleError(
      'GEMINI_API_KEY di backend tidak valid, diblokir, atau perlu diganti.',
      500
    );
  }

  if (mode === 'vision') {
    return createVisibleError('Gagal menganalisis gambar. Coba foto ulang ya!', 500);
  }

  return createVisibleError('Waduh, ada gangguan koneksi. Coba kirim ulang pesanmu ya!', 500);
}

async function sendMessage({ message, history = [] }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (!trimmedMessage) {
    throw createVisibleError('Pesan tidak boleh kosong.', 400);
  }

  const contents = [
    { role: 'user', parts: [{ text: TEXT_SYSTEM_INSTRUCTION }] },
    { role: 'model', parts: [{ text: "Siap! Saya Daeng Te'ne, siap membantu ki!" }] },
    ...sanitizeHistory(history),
    { role: 'user', parts: [{ text: trimmedMessage }] },
  ];

  let lastError = null;

  for (const model of TEXT_MODELS) {
    try {
      const response = await getAiClient().models.generateContent({
        model,
        contents,
      });

      const reply = (response.text || '').trim();
      if (!reply) {
        throw new Error('Model tidak menghasilkan output.');
      }

      return reply;
    } catch (error) {
      lastError = error;
      console.warn(`[AI] Text model ${model} failed:`, error?.message || error);

      if (isRateLimitError(error)) {
        await delay(1000);
        continue;
      }

      if (isApiKeyError(error)) {
        break;
      }
    }
  }

  throw mapModelError(lastError, 'text');
}

async function analyzeImage({ base64Image, mimeType, userNote = '' }) {
  const imageData = normalizeBase64Image(base64Image);

  if (!imageData) {
    throw createVisibleError('Gambar belum terisi.', 400);
  }

  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim() : '';
  if (!normalizedMimeType) {
    throw createVisibleError('Format gambar belum terdeteksi.', 400);
  }

  const note = typeof userNote === 'string' ? userNote.trim() : '';
  const prompt = `${VISION_SYSTEM_INSTRUCTION}

Tugas: analisa gambar makanan atau minuman ini untuk edukasi pengurangan risiko diabetes.
Berikan estimasi range gula (gram) dan karbo (gram) yang masuk akal, sertakan alasan.
Jika tidak yakin, buat range lebih lebar dan minta info tambahan.

Catatan user: ${note || '(tidak ada)'}`;

  let lastError = null;

  for (const model of VISION_MODELS) {
    try {
      const response = await getAiClient().models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: imageData, mimeType: normalizedMimeType } },
            ],
          },
        ],
      });

      const reply = (response.text || '').trim();
      if (!reply) {
        throw new Error('Vision model tidak menghasilkan output.');
      }

      return reply;
    } catch (error) {
      lastError = error;
      console.warn(`[AI] Vision model ${model} failed:`, error?.message || error);

      if (isRateLimitError(error)) {
        await delay(1500);
        continue;
      }

      if (isApiKeyError(error)) {
        break;
      }
    }
  }

  throw mapModelError(lastError, 'vision');
}

async function extractNutritionLabel({ base64Image, mimeType, productName = '', barcode = '' }) {
  const imageData = normalizeBase64Image(base64Image);

  if (!imageData) {
    throw createVisibleError('Gambar belum terisi.', 400);
  }

  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim() : '';
  if (!normalizedMimeType) {
    throw createVisibleError('Format gambar belum terdeteksi.', 400);
  }

  const prompt = `Kamu mengekstrak tabel nutrisi dari foto kemasan makanan/minuman.
Balas HANYA JSON valid tanpa penjelasan tambahan.

Gunakan skema ini persis:
{
  "found": boolean,
  "basis": "100g" | "100ml" | "serving" | "unknown",
  "serving_size": string,
  "quantity": string,
  "energy_kcal": number | null,
  "protein_g": number | null,
  "fat_g": number | null,
  "saturated_fat_g": number | null,
  "carbohydrates_g": number | null,
  "sugars_g": number | null,
  "fiber_g": number | null,
  "sodium_g": number | null,
  "salt_g": number | null,
  "confidence": "low" | "medium" | "high",
  "notes": string
}

Aturan:
- Ambil nilai hanya jika benar-benar terlihat di label nutrisi pada gambar.
- Jika label nutrisi tidak terlihat atau tidak terbaca, set "found": false dan semua angka null.
- Jangan mengisi angka dari pengetahuan umum produk.
- Jika sodium/salt tertulis mg, ubah ke gram.
- Jika hanya ada kJ tanpa kcal dan kamu yakin, konversi ke kcal.
- Jika basis tidak jelas, pakai "unknown".

Konteks produk:
- Nama produk: ${String(productName || '').trim() || '(tidak diketahui)'}
- Barcode: ${String(barcode || '').trim() || '(tidak diketahui)'}`;

  let lastError = null;

  for (const model of VISION_MODELS) {
    try {
      const response = await getAiClient().models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: imageData, mimeType: normalizedMimeType } },
            ],
          },
        ],
      });

      const parsed = extractJsonObject(response.text || '');
      if (!parsed) {
        throw new Error('Nutrition vision model tidak menghasilkan JSON valid.');
      }

      return normalizeNutritionExtraction(parsed);
    } catch (error) {
      lastError = error;
      console.warn(`[AI] Nutrition extraction model ${model} failed:`, error?.message || error);

      if (isRateLimitError(error)) {
        await delay(1500);
        continue;
      }

      if (isApiKeyError(error)) {
        break;
      }
    }
  }

  throw mapModelError(lastError, 'vision');
}

module.exports = {
  analyzeImage,
  extractNutritionLabel,
  sendMessage,
};
