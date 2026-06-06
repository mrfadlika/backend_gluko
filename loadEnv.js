const fs = require('fs');
const path = require('path');

const ENV_FILE_PATHS = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../.env'),
];

function normalizeValue(rawValue) {
  const value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1);

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = normalizeValue(rawValue);
  }
}

ENV_FILE_PATHS.forEach(loadEnvFile);
