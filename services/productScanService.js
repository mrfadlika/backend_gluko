const OPENFOODFACTS_FIELDS =
  "product_name,brands,quantity,serving_size,nutriments,nutrition,nutrition_data,nutrition_data_per,nutrient_levels,ingredients_text,product_quantity,product_quantity_unit,image_url,image_front_url,image_front_small_url,image_nutrition_url,image_nutrition_small_url,image_nutrition_thumb_url,misc_tags,nutriscore_data,attribute_groups,sources_fields";
const { extractNutritionLabel } = require("./geminiService");
const OFF_V36_API_URL = "https://world.openfoodfacts.net/api/v3.6";
const OFF_V3_API_URL = "https://world.openfoodfacts.org/api/v3";
const OFF_V2_API_URL = "https://world.openfoodfacts.net/api/v2";

const ROBOFLOW_API_URL = "https://serverless.roboflow.com";
const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";
const DEFAULT_ROBOFLOW_WORKSPACE = "raffis-workspace";
const DEFAULT_ROBOFLOW_WORKFLOW = "text-recognition";

const EXCLUDED_KEYS = new Set([
  "image",
  "images",
  "base64_image",
  "input_image",
  "original_image",
  "visualization",
]);

const TARGET_KEYS = new Set([
  "text",
  "result",
  "value",
  "label",
  "output",
  "prediction",
  "predicted_text",
  "ocr_text",
  "recognized_text",
  "content",
]);

const SUPPORTED_BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

function createVisibleError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
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

function buildDataUri(base64Value, mimeType = "image/jpeg") {
  const normalizedBase64 = String(base64Value || "").trim();
  if (!normalizedBase64) {
    return "";
  }

  if (normalizedBase64.startsWith("data:")) {
    return normalizedBase64;
  }

  return `data:${mimeType};base64,${normalizedBase64}`;
}

function normalizeBase64Image(base64Image) {
  if (typeof base64Image !== "string") {
    return "";
  }

  const trimmed = base64Image.trim();
  const commaIndex = trimmed.indexOf(",");

  if (trimmed.startsWith("data:") && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
}

function isProbablyBinaryString(value) {
  const text = String(value || "").trim();

  if (!text) {
    return false;
  }

  if (text.startsWith("data:image/")) {
    return true;
  }

  if (text.length < 80) {
    return false;
  }

  return /^[A-Za-z0-9+/=\r\n]+$/.test(text);
}

function extractPreferredValues(data, transformValue) {
  const preferredFragments = [];

  function walk(value, preferred = false) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, preferred);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const normalizedKey = String(key).toLowerCase();
        if (EXCLUDED_KEYS.has(normalizedKey)) {
          continue;
        }

        walk(item, preferred || TARGET_KEYS.has(normalizedKey));
      }
      return;
    }

    if (!preferred) {
      return;
    }

    if (typeof value !== "string" && typeof value !== "number") {
      return;
    }

    const normalizedValue = transformValue(value);
    if (normalizedValue) {
      preferredFragments.push(normalizedValue);
    }
  }

  walk(data);
  return preferredFragments;
}

function extractTextFragments(data) {
  return extractPreferredValues(data, (value) => {
    const cleaned = String(value || "").trim();
    if (!cleaned || isProbablyBinaryString(cleaned)) {
      return "";
    }
    return cleaned;
  });
}

function isSupportedBarcodeLength(value) {
  return SUPPORTED_BARCODE_LENGTHS.has(String(value || "").length);
}

function isValidGtin(barcode) {
  if (!/^\d+$/.test(barcode) || !isSupportedBarcodeLength(barcode)) {
    return false;
  }

  const digits = barcode.split("").map(Number);
  const checkDigit = digits.pop();
  const reversedBody = digits.reverse();

  let sum = 0;
  for (let index = 0; index < reversedBody.length; index += 1) {
    sum += reversedBody[index] * (index % 2 === 0 ? 3 : 1);
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

function getBarcodeLengthScore(barcode) {
  switch (barcode.length) {
    case 13:
      return 6;
    case 12:
      return 5;
    case 14:
      return 4;
    case 8:
      return 3;
    default:
      return 0;
  }
}

function buildBarcodeCandidates(textFragments) {
  const candidates = new Map();
  let sequenceIndex = 0;

  const registerCandidate = (barcode, baseScore) => {
    if (!isSupportedBarcodeLength(barcode)) {
      return;
    }

    const validCheckDigit = isValidGtin(barcode);
    const score =
      baseScore + getBarcodeLengthScore(barcode) + (validCheckDigit ? 100 : 0);
    const existing = candidates.get(barcode);

    if (
      !existing ||
      score > existing.score ||
      (score === existing.score && sequenceIndex < existing.index)
    ) {
      candidates.set(barcode, {
        barcode,
        score,
        index: sequenceIndex,
      });
    }

    sequenceIndex += 1;
  };

  for (const fragment of textFragments) {
    const text = String(fragment || "").trim();
    if (!text) {
      continue;
    }

    const boundedMatches = text.match(/(?<!\d)(?:\d[ -]?){7,13}\d(?!\d)/g) || [];
    for (const match of boundedMatches) {
      registerCandidate(digitsOnly(match), 40);
    }

    const cleanedFullFragment = digitsOnly(text);
    if (isSupportedBarcodeLength(cleanedFullFragment)) {
      registerCandidate(cleanedFullFragment, 30);
    }
  }

  for (let start = 0; start < textFragments.length; start += 1) {
    let combined = "";

    for (
      let end = start;
      end < Math.min(start + 4, textFragments.length);
      end += 1
    ) {
      combined += digitsOnly(textFragments[end]);

      if (combined.length > 14) {
        break;
      }

      if (isSupportedBarcodeLength(combined)) {
        registerCandidate(combined, 20 - (end - start));
      }
    }
  }

  return Array.from(candidates.values())
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((candidate) => candidate.barcode);
}

function getWorkflowItem(rawResult) {
  if (Array.isArray(rawResult)) {
    return rawResult[0] && typeof rawResult[0] === "object" ? rawResult[0] : {};
  }

  return rawResult && typeof rawResult === "object" ? rawResult : {};
}

function getWorkflowPredictions(workflowItem) {
  const predictions = workflowItem?.predictions?.predictions;
  return Array.isArray(predictions) ? predictions : [];
}

function getWorkflowPredictionImage(workflowItem) {
  const predictionImage = workflowItem?.predictions?.image;
  return predictionImage && typeof predictionImage === "object"
    ? predictionImage
    : null;
}

function getWorkflowBase64Value(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }

  return "";
}

function getWorkflowAnnotatedImageDataUri(workflowItem) {
  const base64Value = getWorkflowBase64Value(workflowItem?.output_image);
  return buildDataUri(base64Value, "image/jpeg");
}

function getWorkflowDynamicCropBase64Images(workflowItem) {
  const rawDynamicCrop = workflowItem?.dynamic_crop;
  const entries = Array.isArray(rawDynamicCrop)
    ? rawDynamicCrop
    : rawDynamicCrop
      ? [rawDynamicCrop]
      : [];

  return entries.map(getWorkflowBase64Value).filter(Boolean);
}

function getPredictionDigitHint(predictions = []) {
  const digitHints = predictions
    .map((prediction) => digitsOnly(prediction?.class))
    .filter((value) => value && value.length <= 4)
    .join("");

  return digitHints && digitHints.length <= 4 ? digitHints : "";
}

function getRoboflowConfig() {
  const apiKey = String(process.env.ROBOFLOW_API_KEY || "").trim();
  const workspaceName = String(
    process.env.ROBOFLOW_WORKSPACE_NAME || DEFAULT_ROBOFLOW_WORKSPACE
  ).trim();
  const workflowId = String(
    process.env.ROBOFLOW_WORKFLOW_ID || DEFAULT_ROBOFLOW_WORKFLOW
  ).trim();

  if (!apiKey) {
    throw createVisibleError(
      "ROBOFLOW_API_KEY belum diisi di environment backend.",
      500
    );
  }

  if (!workspaceName || !workflowId) {
    throw createVisibleError(
      "ROBOFLOW_WORKSPACE_NAME atau ROBOFLOW_WORKFLOW_ID belum lengkap.",
      500
    );
  }

  return { apiKey, workspaceName, workflowId };
}

async function parseJsonResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function resolveOpenFoodFactsNutritionBasis(inputSet = {}) {
  const per = String(inputSet?.per || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const perUnit = String(inputSet?.per_unit || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const perQuantity = parseNullableNumber(inputSet?.per_quantity);

  if (per === "serving" || per === "portion") {
    return {
      suffix: "_serving",
      nutritionDataPer: "serving",
    };
  }

  if (
    per === "100g" ||
    (perQuantity === 100 && (perUnit === "g" || per === "g"))
  ) {
    return {
      suffix: "_100g",
      nutritionDataPer: "100g",
    };
  }

  if (
    per === "100ml" ||
    (perQuantity === 100 && (perUnit === "ml" || per === "ml"))
  ) {
    return {
      suffix: "_100ml",
      nutritionDataPer: "100ml",
    };
  }

  return {
    suffix: "",
    nutritionDataPer: "",
  };
}

function buildNutrimentsFromOpenFoodFactsInputSet(inputSet = {}) {
  const nutrients = inputSet?.nutrients || {};
  const { suffix, nutritionDataPer } =
    resolveOpenFoodFactsNutritionBasis(inputSet);
  const nutriments = {};

  for (const [nutrientKey, nutrientValue] of Object.entries(nutrients)) {
    const numericValue = parseNullableNumber(
      nutrientValue?.value ?? nutrientValue?.value_string ?? nutrientValue
    );

    if (numericValue === null) {
      continue;
    }

    const targetKey = suffix ? `${nutrientKey}${suffix}` : nutrientKey;
    nutriments[targetKey] = numericValue;

    const unit = String(nutrientValue?.unit || "").trim();
    if (unit) {
      nutriments[`${nutrientKey}_unit`] = unit;
    }
  }

  return {
    nutriments,
    nutritionDataPer,
  };
}

function getOpenFoodFactsNutritionInputSetScore(inputSet = {}) {
  const nutrients = inputSet?.nutrients || {};
  const nutrientCount = Object.values(nutrients).reduce((count, nutrient) => {
    const numericValue = parseNullableNumber(
      nutrient?.value ?? nutrient?.value_string ?? nutrient
    );
    return count + (numericValue !== null ? 1 : 0);
  }, 0);

  const source = String(inputSet?.source || "").toLowerCase();
  const preparation = String(inputSet?.preparation || "").toLowerCase();

  let score = nutrientCount * 10;

  if (source === "packaging") {
    score += 100;
  }

  if (source === "producer") {
    score += 60;
  }

  if (preparation === "as_sold") {
    score += 30;
  }

  if (preparation === "prepared") {
    score += 10;
  }

  return score;
}

function getBestOpenFoodFactsNutritionInputSet(inputSets = []) {
  const candidates = Array.isArray(inputSets) ? inputSets : [];

  return candidates
    .filter((item) => item && typeof item === "object")
    .sort(
      (left, right) =>
        getOpenFoodFactsNutritionInputSetScore(right) -
        getOpenFoodFactsNutritionInputSetScore(left)
    )[0] || null;
}

function normalizeOpenFoodFactsProductNutrition(product = null) {
  if (!product || typeof product !== "object") {
    return product;
  }

  const bestInputSet = getBestOpenFoodFactsNutritionInputSet(
    product?.nutrition?.input_sets
  );

  if (!bestInputSet) {
    return product;
  }

  const { nutriments, nutritionDataPer } =
    buildNutrimentsFromOpenFoodFactsInputSet(bestInputSet);

  if (!Object.keys(nutriments).length) {
    return product;
  }

  const source = String(bestInputSet?.source || "").trim();
  const preparation = String(bestInputSet?.preparation || "").trim();
  const per = String(bestInputSet?.per || "").trim();
  const notes = [
    source ? `source ${source}` : null,
    preparation ? `preparation ${preparation}` : null,
    per ? `basis ${per}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    ...product,
    nutriments: mergeNutriments(product?.nutriments || {}, nutriments),
    nutrition_data: product?.nutrition_data || "on",
    nutrition_data_per: product?.nutrition_data_per || nutritionDataPer || "",
    gluko_nutrition_source:
      product?.gluko_nutrition_source || "openfoodfacts",
    gluko_nutrition_confidence:
      product?.gluko_nutrition_confidence ||
      (source === "packaging" ? "high" : "medium"),
    gluko_nutrition_notes:
      product?.gluko_nutrition_notes ||
      (notes
        ? `World OpenFoodFacts nutrition.input_sets (${notes})`
        : "World OpenFoodFacts nutrition.input_sets"),
  };
}

async function runRoboflowWorkflow(imageData) {
  const { apiKey, workspaceName, workflowId } = getRoboflowConfig();

  const response = await fetch(
    `${ROBOFLOW_API_URL}/${workspaceName}/workflows/${workflowId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        use_cache: true,
        inputs: {
          image: {
            type: "base64",
            value: imageData,
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.inner_error_message ||
      "Workflow CV gagal diproses.";

    throw createVisibleError(message, response.status);
  }

  return Array.isArray(payload?.outputs) ? payload.outputs : [];
}

async function fetchOpenFoodFactsProduct(barcode) {
  if (!barcode) {
    return null;
  }

  const query = new URLSearchParams({ fields: OPENFOODFACTS_FIELDS });
  const requestHeaders = {
    "User-Agent": "gluko-product-scan/1.0 (contact: local-app)",
    Accept: "application/json",
  };

  const normalizeV3Payload = (payload, apiVersion = "v3") => {
    const found =
      !!payload?.product &&
      (!payload?.result?.id || payload?.result?.id === "product_found");
    const normalizedProduct = found
      ? normalizeOpenFoodFactsProductNutrition(payload.product)
      : null;

    return {
      code: payload?.code || barcode,
      status: found ? 1 : 0,
      status_verbose: payload?.status || payload?.result?.name || null,
      product: normalizedProduct,
      off_api_version: apiVersion,
      off_result: payload?.result || null,
      off_errors: Array.isArray(payload?.errors) ? payload.errors : [],
      off_warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
    };
  };

  const normalizeV2Payload = (payload) => ({
    code: payload?.code || barcode,
    status: payload?.status ?? 0,
    status_verbose: payload?.status_verbose || null,
    product: normalizeOpenFoodFactsProductNutrition(payload?.product || null),
    off_api_version: "v2",
  });

  try {
    const v36Response = await fetch(
      `${OFF_V36_API_URL}/product/${barcode}?${query.toString()}`,
      {
        headers: requestHeaders,
        signal: AbortSignal.timeout(30000),
      }
    );

    const v36Payload = await parseJsonResponse(v36Response);

    if (v36Response.ok && v36Payload?.product) {
      return normalizeV3Payload(v36Payload, "v3.6");
    }

    const v3Response = await fetch(
      `${OFF_V3_API_URL}/product/${barcode}?${query.toString()}`,
      {
        headers: requestHeaders,
        signal: AbortSignal.timeout(30000),
      }
    );

    const v3Payload = await parseJsonResponse(v3Response);

    if (v3Response.ok && v3Payload?.product) {
      return normalizeV3Payload(v3Payload, "v3");
    }

    const v2Response = await fetch(
      `${OFF_V2_API_URL}/product/${barcode}?${query.toString()}`,
      {
        headers: requestHeaders,
        signal: AbortSignal.timeout(30000),
      }
    );

    const v2Payload = await parseJsonResponse(v2Response);

    if (!v2Response.ok) {
      return {
        code: barcode,
        status: v2Response.status,
        status_verbose: "openfoodfacts_http_error",
        product: null,
        off_api_version: "v2",
      };
    }

    return normalizeV2Payload(v2Payload);
  } catch (error) {
    if (error?.name === "TimeoutError") {
      return {
        code: barcode,
        status: null,
        status_verbose: "openfoodfacts_timeout",
        product: null,
        off_api_version: null,
      };
    }

    return {
      code: barcode,
      status: null,
      status_verbose: "openfoodfacts_connection_error",
      product: null,
      off_api_version: null,
    };
  }
}

async function runOcrSpace(base64Image, mimeType = "image/jpeg") {
  const apiKey = String(
    process.env.OCR_SPACE_API_KEY || process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY || ""
  ).trim();

  if (!apiKey || !base64Image) {
    return "";
  }

  try {
    const form = new FormData();
    form.append("base64Image", buildDataUri(base64Image, mimeType));
    form.append("language", "eng");
    form.append("isOverlayRequired", "false");

    const response = await fetch(OCR_SPACE_API_URL, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok || !payload || payload.IsErroredOnProcessing) {
      return "";
    }

    const parsedText = Array.isArray(payload?.ParsedResults)
      ? payload.ParsedResults.map((item) => String(item?.ParsedText || "").trim())
          .filter(Boolean)
          .join(" ")
      : "";

    return parsedText.trim();
  } catch (error) {
    return "";
  }
}

async function extractFallbackOcrFragments(workflowItem, mimeType) {
  const dynamicCropImages = getWorkflowDynamicCropBase64Images(workflowItem).slice(0, 3);
  const textFragments = [];

  for (const cropBase64 of dynamicCropImages) {
    const parsedText = await runOcrSpace(cropBase64, mimeType);
    if (parsedText) {
      textFragments.push(parsedText);
    }
  }

  return textFragments;
}

function augmentTextFragmentsWithPredictionHint(textFragments, predictionDigitHint) {
  if (!predictionDigitHint) {
    return textFragments;
  }

  const augmentedFragments = [...textFragments];

  for (const fragment of textFragments) {
    const digits = digitsOnly(fragment);
    if (!digits || digits.length >= 14) {
      continue;
    }

    augmentedFragments.push(`${predictionDigitHint}${digits}`);
    augmentedFragments.push(`${predictionDigitHint} ${fragment}`);
  }

  return augmentedFragments;
}

function resolveNutritionSuffix(basis) {
  if (basis === "100g") {
    return "_100g";
  }

  if (basis === "100ml") {
    return "_100ml";
  }

  if (basis === "serving") {
    return "_serving";
  }

  return "";
}

function buildNutrimentsFromLabel(labelNutrition = {}) {
  const suffix = resolveNutritionSuffix(labelNutrition?.basis);
  const nutriments = {};

  const register = (baseKey, value, unit = "g") => {
    const numericValue = parseNullableNumber(value);
    if (numericValue === null) {
      return;
    }

    const targetKey = suffix ? `${baseKey}${suffix}` : baseKey;
    nutriments[targetKey] = numericValue;
    nutriments[`${baseKey}_unit`] = unit;
  };

  register("energy-kcal", labelNutrition?.energyKcal, "kcal");
  register("proteins", labelNutrition?.proteinG, "g");
  register("fat", labelNutrition?.fatG, "g");
  register("saturated-fat", labelNutrition?.saturatedFatG, "g");
  register("carbohydrates", labelNutrition?.carbohydratesG, "g");
  register("sugars", labelNutrition?.sugarsG, "g");
  register("fiber", labelNutrition?.fiberG, "g");
  register("sodium", labelNutrition?.sodiumG, "g");
  register("salt", labelNutrition?.saltG, "g");

  return nutriments;
}

function mergeNutriments(primary = {}, fallback = {}) {
  const merged = { ...primary };

  for (const [key, value] of Object.entries(fallback)) {
    if (merged[key] === null || merged[key] === undefined || merged[key] === "") {
      merged[key] = value;
    }
  }

  return merged;
}

function countCoreNutriments(nutriments = {}) {
  const coreGroups = [
    ["energy-kcal_100g", "energy-kcal_100ml", "energy-kcal_serving", "energy-kcal"],
    ["proteins_100g", "proteins_100ml", "proteins_serving", "proteins"],
    ["fat_100g", "fat_100ml", "fat_serving", "fat"],
    ["carbohydrates_100g", "carbohydrates_100ml", "carbohydrates_serving", "carbohydrates"],
    ["sugars_100g", "sugars_100ml", "sugars_serving", "sugars", "added-sugars_100g", "added-sugars_100ml", "added-sugars_serving", "added-sugars"],
  ];

  return coreGroups.reduce((count, keys) => {
    const hasValue = keys.some((key) => parseNullableNumber(nutriments?.[key]) !== null);
    return count + (hasValue ? 1 : 0);
  }, 0);
}

function shouldUseNutritionFallback(product = null) {
  const nutriments = product?.nutriments || {};
  return countCoreNutriments(nutriments) < 3;
}

async function fetchRemoteImageAsBase64(imageUrl) {
  const normalizedUrl = String(imageUrl || "").trim();
  if (!normalizedUrl) {
    return null;
  }

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": "gluko-product-scan/1.0 (contact: local-app)",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return null;
    }

    const mimeType =
      String(response.headers.get("content-type") || "").split(";")[0].trim() ||
      "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length) {
      return null;
    }

    return {
      base64Image: buffer.toString("base64"),
      mimeType,
      sourceUrl: normalizedUrl,
    };
  } catch {
    return null;
  }
}

function buildNutritionSource(product = null, usedLabelFallback = false) {
  const hasOffNutrition =
    countCoreNutriments(product?.nutriments || {}) >= 3 &&
    product?.gluko_nutrition_source !== "label_ai" &&
    product?.gluko_nutrition_source !== "off_nutrition_image_ai";

  if (usedLabelFallback && hasOffNutrition) {
    return "openfoodfacts+label_ai";
  }

  if (usedLabelFallback) {
    return "label_ai";
  }

  return "openfoodfacts";
}

function augmentProductWithLabelNutrition(product = {}, labelNutrition = {}) {
  const fallbackNutriments = buildNutrimentsFromLabel(labelNutrition);
  const mergedNutriments = mergeNutriments(product?.nutriments || {}, fallbackNutriments);
  const nutritionDataPer =
    product?.nutrition_data_per ||
    (labelNutrition?.basis === "serving"
      ? "serving"
      : labelNutrition?.basis === "100ml"
        ? "100ml"
        : labelNutrition?.basis === "100g"
          ? "100g"
          : "");

  return {
    ...product,
    quantity: product?.quantity || labelNutrition?.quantity || "",
    serving_size: product?.serving_size || labelNutrition?.servingSize || "",
    nutriments: mergedNutriments,
    nutrition_data: product?.nutrition_data || "estimated_from_label",
    nutrition_data_per: nutritionDataPer,
    gluko_nutrition_source:
      product?.gluko_nutrition_source === "openfoodfacts"
        ? "openfoodfacts+label_ai"
        : "label_ai",
    gluko_nutrition_confidence: labelNutrition?.confidence || "low",
    gluko_nutrition_notes: labelNutrition?.notes || "",
  };
}

function createLabelOnlyProduct({ barcode, labelNutrition, existingProduct = null }) {
  const nutriments = buildNutrimentsFromLabel(labelNutrition);

  return {
    product_name:
      existingProduct?.product_name ||
      existingProduct?.name ||
      `Produk ${barcode || "Hasil Scan"}`,
    brands: existingProduct?.brands || "",
    quantity: existingProduct?.quantity || labelNutrition?.quantity || "",
    serving_size: existingProduct?.serving_size || labelNutrition?.servingSize || "",
    nutriments,
    nutrition_data: "estimated_from_label",
    nutrition_data_per:
      labelNutrition?.basis === "serving"
        ? "serving"
        : labelNutrition?.basis === "100ml"
          ? "100ml"
          : labelNutrition?.basis === "100g"
            ? "100g"
            : "",
    nutrient_levels: existingProduct?.nutrient_levels || {},
    ingredients_text: existingProduct?.ingredients_text || "",
    image_url:
      existingProduct?.image_url ||
      existingProduct?.image_front_url ||
      existingProduct?.image_front_small_url ||
      "",
    image_front_url:
      existingProduct?.image_front_url ||
      existingProduct?.image_url ||
      "",
    image_front_small_url:
      existingProduct?.image_front_small_url ||
      existingProduct?.image_front_url ||
      existingProduct?.image_url ||
      "",
    image_nutrition_url: existingProduct?.image_nutrition_url || "",
    gluko_nutrition_source: "label_ai",
    gluko_nutrition_confidence: labelNutrition?.confidence || "low",
    gluko_nutrition_notes: labelNutrition?.notes || "",
  };
}

async function scanProductImage({ base64Image, mimeType }) {
  const imageData = normalizeBase64Image(base64Image);

  if (!imageData) {
    throw createVisibleError("Gambar belum terisi.", 400);
  }

  let workflowOutputs;

  try {
    workflowOutputs = await runRoboflowWorkflow(imageData);
  } catch (error) {
    if (error.expose) {
      throw error;
    }

    throw createVisibleError("Gagal memproses gambar dengan workflow CV.", 500);
  }

  const workflowItem = getWorkflowItem(workflowOutputs);
  const predictions = getWorkflowPredictions(workflowItem);
  const predictionImage = getWorkflowPredictionImage(workflowItem);
  const annotatedImage = getWorkflowAnnotatedImageDataUri(workflowItem);
  const predictionDigitHint = getPredictionDigitHint(predictions);
  const workflowTextFragments = extractTextFragments(workflowOutputs);
  const fallbackOcrFragments = await extractFallbackOcrFragments(
    workflowItem,
    mimeType || "image/jpeg"
  );
  const rawTextFragments = [...workflowTextFragments, ...fallbackOcrFragments].filter(Boolean);
  const textFragments = augmentTextFragmentsWithPredictionHint(
    rawTextFragments,
    predictionDigitHint
  );
  const barcodeCandidates = buildBarcodeCandidates(textFragments);

  let barcode = barcodeCandidates[0] || "";
  let openfoodfacts = null;

  for (const candidate of barcodeCandidates.slice(0, 5)) {
    const lookup = await fetchOpenFoodFactsProduct(candidate);

    if (!openfoodfacts) {
      openfoodfacts = lookup;
    }

    if (lookup?.status === 1) {
      barcode = candidate;
      openfoodfacts = lookup;
      break;
    }
  }

  const ocrPreview = rawTextFragments.join(" ").replace(/\s+/g, " ").trim();
  const ocrText = barcode || ocrPreview.slice(0, 180) || predictionDigitHint;
  const existingProduct = openfoodfacts?.product || null;

  if (shouldUseNutritionFallback(existingProduct)) {
    try {
      let labelNutrition = null;
      let nutritionSource = "label_ai";
      const offNutritionImage = await fetchRemoteImageAsBase64(
        existingProduct?.image_nutrition_url ||
          existingProduct?.image_nutrition_small_url ||
          existingProduct?.image_nutrition_thumb_url ||
          ""
      );

      if (offNutritionImage?.base64Image) {
        const extractedFromOffImage = await extractNutritionLabel({
          base64Image: offNutritionImage.base64Image,
          mimeType: offNutritionImage.mimeType,
          productName: existingProduct?.product_name || "",
          barcode,
        });

        if (extractedFromOffImage?.found) {
          labelNutrition = extractedFromOffImage;
          nutritionSource = "off_nutrition_image_ai";
        }
      }

      if (!labelNutrition) {
        const extractedFromUserImage = await extractNutritionLabel({
          base64Image: imageData,
          mimeType: mimeType || "image/jpeg",
          productName: existingProduct?.product_name || "",
          barcode,
        });

        if (extractedFromUserImage?.found) {
          labelNutrition = extractedFromUserImage;
        }
      }

      if (labelNutrition?.found) {
        if (existingProduct) {
          openfoodfacts = {
            ...openfoodfacts,
            product: {
              ...augmentProductWithLabelNutrition(existingProduct, labelNutrition),
              gluko_nutrition_source: nutritionSource,
            },
          };
        } else {
          openfoodfacts = {
            code: barcode || null,
            status: 0,
            status_verbose: "label_ai_only",
            product: createLabelOnlyProduct({
              barcode,
              labelNutrition,
              existingProduct,
            }),
          };
        }
      }
    } catch (error) {
      console.warn("[AI] Nutrition label fallback failed:", error?.message || error);
    }
  } else if (openfoodfacts?.product) {
    openfoodfacts = {
      ...openfoodfacts,
      product: {
        ...openfoodfacts.product,
        gluko_nutrition_source:
          openfoodfacts.product.gluko_nutrition_source || "openfoodfacts",
      },
    };
  }

  return {
    result: barcode,
    barcode,
    ocrText,
    predictions,
    predictionImage,
    annotatedImage,
    openfoodfacts,
  };
}

module.exports = {
  scanProductImage,
};
