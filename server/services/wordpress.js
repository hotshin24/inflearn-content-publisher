import { config, missingConfig } from '../config.js';

function authHeader() {
  const token = Buffer.from(`${config.wordpressUsername}:${config.wordpressAppPassword}`).toString('base64');
  return `Basic ${token}`;
}

async function wpRequest(path, options = {}) {
  const missing = missingConfig(['wordpressUrl', 'wordpressUsername', 'wordpressAppPassword']);
  if (missing.length) throw new Error(`워드프레스 설정이 필요합니다: ${missing.join(', ')}`);
  const response = await fetch(`${config.wordpressUrl}/wp-json/wp/v2${path}`, {
    ...options,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `WordPress 요청 실패 (${response.status})`);
  return body;
}

async function resolveTagIds(names = []) {
  const ids = [];
  for (const rawName of names.slice(0, 8)) {
    const name = String(rawName).trim();
    if (!name) continue;
    const found = await wpRequest(`/tags?search=${encodeURIComponent(name)}&per_page=20`);
    const exact = found.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    const tag = exact || await wpRequest('/tags', { method: 'POST', body: JSON.stringify({ name }) });
    ids.push(tag.id);
  }
  return ids;
}

export async function publishPost(post) {
  const tags = await resolveTagIds(post.tags);
  const seoMeta = {};
  if (config.wordpressMetaDescriptionField && post.meta_description) seoMeta[config.wordpressMetaDescriptionField] = post.meta_description;
  if (config.wordpressFocusKeyphraseField && post.focus_keyphrase) seoMeta[config.wordpressFocusKeyphraseField] = post.focus_keyphrase;
  if (config.wordpressCoreKeywordsField && post.core_keywords) seoMeta[config.wordpressCoreKeywordsField] = post.core_keywords;
  if (config.wordpressRelatedKeywordsField && post.related_keywords) seoMeta[config.wordpressRelatedKeywordsField] = post.related_keywords;
  return wpRequest('/posts', {
    method: 'POST',
    body: JSON.stringify({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      slug: post.slug || undefined,
      status: post.status || config.wordpressDefaultStatus,
      categories: post.categoryIds?.length ? post.categoryIds : config.wordpressDefaultCategoryIds,
      tags,
      meta: { ...(post.meta || {}), ...seoMeta }
    })
  });
}

export async function verifyWordPress() {
  const user = await wpRequest('/users/me?context=edit');
  return { id: user.id, name: user.name, url: config.wordpressUrl };
}
