import 'dotenv/config';
import path from 'node:path';

function listOfNumbers(value = '') {
  return value.split(',').map((item) => Number(item.trim())).filter(Number.isInteger);
}

function listOfStrings(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: process.env.TRUST_PROXY === '1',
  apiAccessToken: process.env.API_ACCESS_TOKEN || '',
  allowedExtensionIds: listOfStrings(process.env.ALLOWED_EXTENSION_IDS),
  allowedWebOrigins: listOfStrings(process.env.ALLOWED_WEB_ORIGINS || 'http://localhost:8787'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, ''),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
  crawlerBrowserChannel: process.env.CRAWLER_BROWSER_CHANNEL || '',
  crawlerTimeoutMs: Number(process.env.CRAWLER_TIMEOUT_MS || 45000),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
  wordpressUrl: (process.env.WORDPRESS_URL || '').replace(/\/$/, ''),
  wordpressUsername: process.env.WORDPRESS_USERNAME || '',
  wordpressAppPassword: process.env.WORDPRESS_APP_PASSWORD || '',
  wordpressDefaultStatus: process.env.WORDPRESS_DEFAULT_STATUS || 'draft',
  wordpressDefaultCategoryIds: listOfNumbers(process.env.WORDPRESS_DEFAULT_CATEGORY_IDS),
  wordpressMetaDescriptionField: process.env.WORDPRESS_META_DESCRIPTION_FIELD || '',
  wordpressFocusKeyphraseField: process.env.WORDPRESS_FOCUS_KEYPHRASE_FIELD || '',
  wordpressCoreKeywordsField: process.env.WORDPRESS_CORE_KEYWORDS_FIELD || '',
  wordpressRelatedKeywordsField: process.env.WORDPRESS_RELATED_KEYWORDS_FIELD || '',
  promptFile: path.resolve(process.cwd(), process.env.PROMPT_FILE || 'prompts/default.md'),
  maxReviews: Math.max(1, Number(process.env.MAX_REVIEWS || 50)),
};

export function missingConfig(keys) {
  return keys.filter((key) => !config[key]);
}
