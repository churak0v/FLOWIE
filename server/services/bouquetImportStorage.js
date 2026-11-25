'use strict';

const crypto = require('node:crypto');

const IMPORT_PREFIX = 'flowie-import/';
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_READ_BYTES = 25 * 1024 * 1024;
const HARD_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

function configError(name) {
  return Object.assign(new Error(`BOUQUET_IMPORT_STORAGE_CONFIG_${name}`), {
    code: 'BOUQUET_IMPORT_STORAGE_CONFIG',
  });
}

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw configError(name);
  return value;
}

function boundedInteger(env, name, fallback, maximum) {
  if (env[name] === undefined || env[name] === '') return fallback;
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw configError(name);
  return value;
}

function loadBouquetImportStorageConfig(env = process.env) {
  const endpoint = new URL(required(env, 'FLOWIE_IMPORT_S3_ENDPOINT'));
  if (endpoint.protocol !== 'https:') throw configError('FLOWIE_IMPORT_S3_ENDPOINT');
  endpoint.search = '';
  endpoint.hash = '';

  const bucket = required(env, 'FLOWIE_IMPORT_S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw configError('FLOWIE_IMPORT_S3_BUCKET');
  }

  return Object.freeze({
    endpoint: endpoint.toString().replace(/\/$/, ''),
    bucket,
    region: required(env, 'FLOWIE_IMPORT_S3_REGION'),
    accessKeyId: required(env, 'FLOWIE_IMPORT_S3_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'FLOWIE_IMPORT_S3_SECRET_ACCESS_KEY'),
    sessionToken: String(env.FLOWIE_IMPORT_S3_SESSION_TOKEN || '').trim() || null,
    maxUploadBytes: boundedInteger(env, 'FLOWIE_IMPORT_S3_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES, HARD_MAX_BYTES),
    maxReadBytes: boundedInteger(env, 'FLOWIE_IMPORT_S3_MAX_READ_BYTES', DEFAULT_MAX_READ_BYTES, HARD_MAX_BYTES),
    timeoutMs: boundedInteger(env, 'FLOWIE_IMPORT_S3_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 120_000),
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalObjectPath(endpoint, bucket, key) {
  const basePath = new URL(endpoint).pathname.split('/').filter(Boolean).map(encodePathSegment);
  return '/' + [...basePath, bucket, ...key.split('/')].map(encodePathSegment).join('/');
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signedRequest({ config, method, key, body, contentType, metadata, now }) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('BOUQUET_IMPORT_STORAGE_INVALID_DATE');

  const url = new URL(config.endpoint);
  const canonicalPath = canonicalObjectPath(config.endpoint, config.bucket, key);
  url.pathname = canonicalPath;
  const amzDate = formatAmzDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body ? sha256(body) : EMPTY_SHA256;
  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (config.sessionToken) headers['x-amz-security-token'] = config.sessionToken;
  if (body) {
    headers['content-length'] = String(body.length);
    headers['content-type'] = contentType;
  }
  for (const [name, value] of Object.entries(metadata || {})) headers[`x-amz-meta-${name}`] = value;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${String(headers[name]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [method, canonicalPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  delete headers.host;
  return { url: url.toString(), headers };
}

function safeFilename(filename) {
  const leaf = String(filename || 'original.bin').split(/[\\/]/).pop();
  const normalized = leaf.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 100);
  return normalized || 'original.bin';
}

function buildObjectKey(filename, { now = new Date(), randomUUID = crypto.randomUUID } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('BOUQUET_IMPORT_STORAGE_INVALID_DATE');
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${IMPORT_PREFIX}${yyyy}/${mm}/${dd}/${randomUUID()}-${safeFilename(filename)}`;
}

function assertImportKey(key) {
  const segments = typeof key === 'string' ? key.split('/') : [];
  if (
    typeof key !== 'string'
    || key.length > 512
    || segments[0] !== 'flowie-import'
    || segments.length < 3
    || segments.slice(1).some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]{1,128}$/.test(segment))
    || /%2f|%5c/i.test(key)
    || key.includes('\\')
  ) {
    throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_INVALID_KEY'), { code: 'BOUQUET_IMPORT_STORAGE_INVALID_KEY' });
  }
  return key;
}

function normalizeMetadata(metadata) {
  if (metadata === undefined) return {};
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_INVALID_METADATA'), { code: 'BOUQUET_IMPORT_STORAGE_INVALID_METADATA' });
  }
  const normalized = {};
  for (const [rawName, rawValue] of Object.entries(metadata)) {
    const name = rawName.toLowerCase();
    const value = String(rawValue);
    if (!/^[a-z0-9-]{1,40}$/.test(name) || value.length > 256 || /[\r\n]/.test(value)) {
      throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_INVALID_METADATA'), { code: 'BOUQUET_IMPORT_STORAGE_INVALID_METADATA' });
    }
    normalized[name] = value;
  }
  return normalized;
}

function storageError(operation, response) {
  return Object.assign(new Error(`BOUQUET_IMPORT_STORAGE_${operation}_FAILED`), {
    code: `BOUQUET_IMPORT_STORAGE_${operation}_FAILED`,
    status: response?.status,
  });
}

async function cancelBody(body) {
  if (body && typeof body.cancel === 'function') await body.cancel().catch(() => {});
}

async function readBounded(response, maximum) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maximum) {
    await cancelBody(response.body);
    throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_READ_TOO_LARGE'), { code: 'BOUQUET_IMPORT_STORAGE_READ_TOO_LARGE' });
  }

  const chunks = [];
  let bytes = 0;
  const accept = async (value) => {
    const chunk = Buffer.from(value);
    bytes += chunk.length;
    if (bytes > maximum) {
      await cancelBody(response.body);
      throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_READ_TOO_LARGE'), { code: 'BOUQUET_IMPORT_STORAGE_READ_TOO_LARGE' });
    }
    chunks.push(chunk);
  };

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await accept(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else if (response.body?.[Symbol.asyncIterator]) {
    for await (const chunk of response.body) await accept(chunk);
  } else if (typeof response.arrayBuffer === 'function') {
    await accept(await response.arrayBuffer());
  } else {
    throw storageError('READ', response);
  }
  return Buffer.concat(chunks, bytes);
}

function createBouquetImportStorage({ config = loadBouquetImportStorageConfig(), fetchImpl = globalThis.fetch, now = () => new Date(), randomUUID = crypto.randomUUID } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('BOUQUET_IMPORT_STORAGE_FETCH_REQUIRED');

  async function request(operation, key, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    timeout.unref?.();
    try {
      const signed = signedRequest({ config, method: init.method, key, body: init.body, contentType: init.contentType, metadata: init.metadata, now: now() });
      return await fetchImpl(signed.url, {
        method: init.method,
        headers: signed.headers,
        body: init.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.code?.startsWith('BOUQUET_IMPORT_STORAGE_')) throw error;
      throw storageError(operation);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function put({ key, body, contentType = 'application/octet-stream', metadata }) {
      assertImportKey(key);
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_UPLOAD_EMPTY'), { code: 'BOUQUET_IMPORT_STORAGE_UPLOAD_EMPTY' });
      }
      if (body.length > config.maxUploadBytes) {
        throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_UPLOAD_TOO_LARGE'), { code: 'BOUQUET_IMPORT_STORAGE_UPLOAD_TOO_LARGE' });
      }
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
        throw Object.assign(new Error('BOUQUET_IMPORT_STORAGE_INVALID_CONTENT_TYPE'), { code: 'BOUQUET_IMPORT_STORAGE_INVALID_CONTENT_TYPE' });
      }
      const safeMetadata = normalizeMetadata(metadata);
      const response = await request('UPLOAD', key, { method: 'PUT', body, contentType, metadata: safeMetadata });
      if (!response?.ok) throw storageError('UPLOAD', response);
      return Object.freeze({ key, size: body.length, etag: response.headers?.get?.('etag') || null });
  }

  async function get(key) {
      assertImportKey(key);
      const response = await request('READ', key, { method: 'GET' });
      if (!response?.ok) {
        await cancelBody(response?.body);
        throw storageError('READ', response);
      }
      const buffer = await readBounded(response, config.maxReadBytes);
      return Object.freeze({
        key,
        buffer,
        size: buffer.length,
        contentType: response.headers?.get?.('content-type') || 'application/octet-stream',
        etag: response.headers?.get?.('etag') || null,
      });
  }

  return Object.freeze({
    put,
    get,
    readOriginal: get,
    async uploadOriginal({ buffer, filename, contentType = 'application/octet-stream', metadata }) {
      const key = buildObjectKey(filename, { now: now(), randomUUID });
      return put({ key, body: buffer, contentType, metadata });
    },
  });
}

module.exports = {
  IMPORT_PREFIX,
  buildObjectKey,
  createBouquetImportStorage,
  loadBouquetImportStorageConfig,
};
