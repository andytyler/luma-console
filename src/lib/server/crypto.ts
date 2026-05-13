import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appEncryptionKey } from './env';

const LOCAL_SECRET_PATH = join(process.cwd(), '.local', 'app-encryption-key');
const PLACEHOLDER_SECRET = 'make-this-a-long-random-string-at-least-24-chars';

function localDevelopmentSecret() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_ENCRYPTION_KEY must be set in production so encrypted Luma API keys survive deploys.');
  }

  if (existsSync(LOCAL_SECRET_PATH)) {
    return readFileSync(LOCAL_SECRET_PATH, 'utf8').trim();
  }

  const secret = randomBytes(32).toString('base64url');
  mkdirSync(dirname(LOCAL_SECRET_PATH), { recursive: true });
  writeFileSync(LOCAL_SECRET_PATH, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function key() {
  const configured = appEncryptionKey();
  const secret = configured && configured !== PLACEHOLDER_SECRET ? configured : localDevelopmentSecret();
  if (!secret || secret.length < 24) {
    throw new Error('The app encryption key must be a long random secret before storing Luma API keys.');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptSecret(value: string) {
  if (value === 'legacy-env-key') return '';
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(':');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error('Unsupported encrypted secret format.');
  }

  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

export function secretHint(value: string) {
  if (value.length <= 8) return 'configured';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
