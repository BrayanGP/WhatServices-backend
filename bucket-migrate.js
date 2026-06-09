/**
 * Copia TODOS los objetos del bucket de DEV al de PROD (S3-compatible, t3.storageapi.dev).
 * Conserva las mismas "keys", así las URLs /files/<key> siguen sirviendo.
 *
 * Uso:
 *   cd C:\Users\garpe\OneDrive\Documentos\claude\_wsbackend_tmp
 *   node bucket-migrate.js
 *
 * ⚠️ Este archivo contiene credenciales: BÓRRALO después de usarlo.
 */
const {
  S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand,
} = require('@aws-sdk/client-s3');

const ENDPOINT = 'https://t3.storageapi.dev';
const REGION = 'auto';

// --- ORIGEN (dev) ---
const SRC_BUCKET = 'optimized-breadbox-gmkt5y';
const src = new S3Client({
  endpoint: ENDPOINT, region: REGION, forcePathStyle: true,
  credentials: {
    accessKeyId: 'tid_QlUfcZMyTrmVKtenDFUnWjGazHpsi_HXOqmFztnRELAJtaEDuO',
    secretAccessKey: 'tsec_hNQ62NCOUF_+WYC9irIMX5mA3zudqxYImGCqAkR0AFIk4NtpUh06pd0Y7ivGt2EJfWZOfG',
  },
});

// --- DESTINO (prod) ---
const DST_BUCKET = 'enclosed-bin-30n7nc1naoj';
const dst = new S3Client({
  endpoint: ENDPOINT, region: REGION, forcePathStyle: true,
  credentials: {
    accessKeyId: 'tid_hBPooQiDvdNKtcfSaJJxKiJHkvRLEfCGgmfGvEkaYzrDFu_tjB',
    secretAccessKey: 'tsec_q9PdSECQRSXmAOSTZx-EbIIRHPK2CLICRrCpBoj-hMIW_NfIQj0pT6o8thjU6Szq++THZ-',
  },
});

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

(async () => {
  let token;
  let total = 0;
  let failed = 0;
  do {
    const list = await src.send(new ListObjectsV2Command({ Bucket: SRC_BUCKET, ContinuationToken: token }));
    for (const obj of (list.Contents || [])) {
      try {
        const got = await src.send(new GetObjectCommand({ Bucket: SRC_BUCKET, Key: obj.Key }));
        const body = await streamToBuffer(got.Body);
        await dst.send(new PutObjectCommand({
          Bucket: DST_BUCKET, Key: obj.Key, Body: body, ContentType: got.ContentType,
        }));
        total += 1;
        console.log('✓', obj.Key);
      } catch (e) {
        failed += 1;
        console.error('✗', obj.Key, '→', e.message);
      }
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  console.log(`\nLISTO. Copiados: ${total} · Fallidos: ${failed}`);
})().catch((e) => { console.error('ERROR general:', e.message); process.exit(1); });
