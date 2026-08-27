import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import crypto from 'node:crypto';
import { config } from './config.js';
import { generateContent } from './services/content.js';
import { crawlInflearnCourse } from './services/inflearn.js';
import { publishPost, verifyWordPress } from './services/wordpress.js';
import { validateCourse, validatePost } from './validation.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);
if (config.nodeEnv === 'production' && !config.apiAccessToken) throw new Error('운영 환경에서는 API_ACCESS_TOKEN이 필수입니다.');

const allowedOrigins = new Set([
  ...config.allowedWebOrigins,
  ...config.allowedExtensionIds.map((id) => `chrome-extension://${id}`)
]);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('허용되지 않은 Origin입니다.'));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.get('/preview/config.js', (_req, res) => {
  res.type('application/javascript').send(`globalThis.APP_CONFIG = Object.freeze(${JSON.stringify({
    apiBaseUrl: config.publicBaseUrl,
    apiAccessToken: config.apiAccessToken
  })});`);
});
app.use('/preview', express.static('extension'));
app.get('/', (_req, res) => res.redirect('/preview/popup.html'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  skip: () => config.nodeEnv !== 'production',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.' }
}));
app.use('/api', (req, res, next) => {
  if (!config.apiAccessToken) return next();
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const expectedBuffer = Buffer.from(config.apiAccessToken);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return res.status(401).json({ error: 'API 인증에 실패했습니다.' });
  }
  return next();
});
app.get('/api/wordpress/verify', async (_req, res, next) => {
  try { res.json(await verifyWordPress()); } catch (error) { next(error); }
});
app.post('/api/crawl', async (req, res, next) => {
  try { res.json({ course: await crawlInflearnCourse(req.body.url) }); } catch (error) { next(error); }
});
app.post('/api/generate', async (req, res, next) => {
  try { res.json(await generateContent(validateCourse(req.body.course), req.body.mainKeyword, req.body.prompt)); } catch (error) { next(error); }
});
app.post('/api/publish', async (req, res, next) => {
  try { res.status(201).json(await publishPost(validatePost(req.body.post))); } catch (error) { next(error); }
});
app.post('/api/generate-and-publish', async (req, res, next) => {
  try {
    const generated = await generateContent(validateCourse(req.body.course), req.body.mainKeyword, req.body.prompt);
    const published = await publishPost(validatePost({ ...generated, status: req.body.status || config.wordpressDefaultStatus }));
    res.status(201).json({ generated, published });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 400).json({
    error: error.message || '요청 처리 중 오류가 발생했습니다.',
    code: error.code,
    auditErrors: error.auditErrors
  });
});

const server = app.listen(config.port, config.host, () => console.log(`API server: http://${config.host}:${config.port}`));
server.on('error', (error) => console.error('API server error:', error));
