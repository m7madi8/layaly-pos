#!/usr/bin/env node
/**
 * Fails `npm run build` when a real Firebase production/staging SPA is missing
 * REACT_APP_EMPLOYEE_PASSWORD / REACT_APP_VAULT_PIN (or still uses known defaults).
 * Keep blocked-value lists in sync with src/config/validateProductionEnv.js.
 *
 * Host/CI environment variables win over dotenv files (same as Create React App).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const BLOCKED_EMPLOYEE_PASSWORDS = new Set(['admin123', 'password', '123456', '']);
const BLOCKED_VAULT_PINS = new Set(['1221', '0000', '1234', '']);
const FIREBASE_ENV_KEYS = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadEnv() {
  const fromFiles = {};
  for (const file of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    Object.assign(fromFiles, parseEnvFile(path.join(root, file)));
  }
  return { ...fromFiles, ...process.env };
}

function envValue(env, key) {
  return String(env[key] || '').trim();
}

const env = loadEnv();
env.NODE_ENV = env.NODE_ENV || 'production';

if (envValue(env, 'REACT_APP_DEMO_MODE').toLowerCase() === 'true') {
  process.exit(0);
}

const firebaseConfigured = FIREBASE_ENV_KEYS.every((key) => envValue(env, key));
if (!firebaseConfigured) {
  process.exit(0);
}

const errors = [];
const employee = envValue(env, 'REACT_APP_EMPLOYEE_PASSWORD');
const vault = envValue(env, 'REACT_APP_VAULT_PIN');

if (!employee || BLOCKED_EMPLOYEE_PASSWORDS.has(employee)) {
  errors.push('REACT_APP_EMPLOYEE_PASSWORD must be set to a strong non-default value for production builds.');
}
if (!vault || BLOCKED_VAULT_PINS.has(vault)) {
  errors.push('REACT_APP_VAULT_PIN must be set to a non-default value for production builds.');
}

if (errors.length) {
  console.error(`[Layali POS security] ${errors.join(' ')}`);
  console.error('Set them in .env.local (local) and Vercel → Settings → Environment Variables, then rebuild.');
  process.exit(1);
}
