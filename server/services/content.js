import fs from 'node:fs/promises';
import OpenAI from 'openai';
import { config, missingConfig } from '../config.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    main_keyword: { type: 'string' },
    focus_keyphrase: { type: 'string' },
    meta_description: { type: 'string' },
    introduction: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 3,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { heading: { type: 'string' }, content: { type: 'string' } },
        required: ['heading', 'content']
      }
    },
    conclusion: { type: 'string' },
    core_keywords: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } },
    related_keywords: { type: 'array', minItems: 10, maxItems: 10, items: { type: 'string' } },
    wordpress_tags: { type: 'array', minItems: 10, maxItems: 10, items: { type: 'string' } }
  },
  required: ['title', 'main_keyword', 'focus_keyphrase', 'meta_description', 'introduction', 'sections', 'conclusion', 'core_keywords', 'related_keywords', 'wordpress_tags']
};

const metaDescriptionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { meta_description: { type: 'string' } },
  required: ['meta_description']
};

const articleLengthSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    introduction: { type: 'string' },
    sections: schema.properties.sections,
    conclusion: { type: 'string' }
  },
  required: ['introduction', 'sections', 'conclusion']
};

const compactLength = (value) => String(value || '').replace(/\s/g, '').length;
const countOccurrences = (text, keyword) => keyword ? String(text).split(keyword).length - 1 : 0;
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paragraphs = (value) => String(value || '').split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('\n');

export function auditGeneratedContent(data, mainKeyword) {
  const errors = [];
  const body = data.sections?.map((section) => `${section.heading}\n${section.content}`).join('\n') || '';
  const article = `${data.title}\n${data.introduction}\n${body}\n${data.conclusion}`;
  if (!mainKeyword) errors.push('메인 키워드가 비어 있습니다.');
  if (data.main_keyword !== mainKeyword) errors.push('main_keyword가 사용자 입력과 다릅니다.');
  if (data.focus_keyphrase !== mainKeyword) errors.push('focus_keyphrase가 main_keyword와 다릅니다.');
  if (!data.title?.includes(mainKeyword)) errors.push('제목에 메인 키워드가 없습니다.');
  if (!data.introduction?.includes(mainKeyword)) errors.push('서론에 메인 키워드가 없습니다.');
  if (!data.sections?.some((section) => section.heading.includes(mainKeyword))) errors.push('H2 소제목에 메인 키워드가 없습니다.');
  if (!body.includes(mainKeyword)) errors.push('본문에 메인 키워드가 없습니다.');
  if (!data.conclusion?.includes(mainKeyword)) errors.push('결론에 메인 키워드가 없습니다.');
  if (countOccurrences(article, mainKeyword) < 5) errors.push('전체 글의 메인 키워드 사용 횟수가 5회 미만입니다.');
  if (!data.meta_description?.includes(mainKeyword)) errors.push('메타 설명에 메인 키워드가 없습니다.');
  if (compactLength(data.meta_description) !== 110) errors.push(`메타 설명은 공백 제외 ${compactLength(data.meta_description)}자입니다(110자 필요).`);
  if (data.wordpress_tags?.length !== 10) errors.push('WordPress 태그가 정확히 10개가 아닙니다.');
  if (data.wordpress_tags?.some((tag) => tag.includes('#'))) errors.push('WordPress 태그에 # 기호가 있습니다.');
  if (!data.wordpress_tags?.includes(mainKeyword)) errors.push('WordPress 태그에 메인 키워드가 없습니다.');
  if (data.core_keywords?.length !== 5) errors.push('핵심 키워드가 정확히 5개가 아닙니다.');
  if (data.related_keywords?.length !== 10) errors.push('연관 키워드가 정확히 10개가 아닙니다.');
  if (compactLength(data.introduction) < 450 || compactLength(data.introduction) > 550) errors.push('서론이 공백 제외 450~550자가 아닙니다.');
  const bodyLength = data.sections?.reduce((sum, section) => sum + compactLength(section.content), 0) || 0;
  if (bodyLength < 1800 || bodyLength > 2200) errors.push('본론이 공백 제외 1,800~2,200자가 아닙니다.');
  if (compactLength(data.conclusion) < 450 || compactLength(data.conclusion) > 550) errors.push('결론이 공백 제외 450~550자가 아닙니다.');
  return errors;
}

export function renderWordPressContent(data, courseUrl) {
  const sections = data.sections.map((section) => `<h2>${escapeHtml(section.heading)}</h2>\n${paragraphs(section.content)}`).join('\n');
  return `${paragraphs(data.introduction)}\n${sections}\n<h2>결론</h2>\n${paragraphs(data.conclusion)}\n<p><a href="${escapeHtml(courseUrl)}" rel="sponsored nofollow">강의 페이지에서 자세한 커리큘럼 확인하기</a></p>`;
}

function normalizeInvariants(data, mainKeyword) {
  data.main_keyword = mainKeyword;
  data.focus_keyphrase = mainKeyword;
  data.wordpress_tags = data.wordpress_tags.map((tag) => String(tag).replace(/#/g, '').trim());
  if (!data.wordpress_tags.includes(mainKeyword)) data.wordpress_tags[0] = mainKeyword;
  if (!data.title.includes(mainKeyword)) data.title = `${mainKeyword}: ${data.title}`;
  if (!data.introduction.includes(mainKeyword)) data.introduction = `${mainKeyword}를 살펴보는 학습자라면 다음 내용을 먼저 확인할 필요가 있습니다. ${data.introduction}`;
  if (!data.sections.some((section) => section.heading.includes(mainKeyword))) data.sections[0].heading = `${mainKeyword}, 무엇을 배우는가`;
  if (!data.conclusion.includes(mainKeyword)) data.conclusion = `${mainKeyword}를 선택하기 전 자신의 학습 목적과 전체 커리큘럼을 함께 확인해 보세요. ${data.conclusion}`;
  const article = `${data.title}\n${data.introduction}\n${data.sections.map((section) => `${section.heading}\n${section.content}`).join('\n')}\n${data.conclusion}`;
  if (countOccurrences(article, mainKeyword) < 5) data.sections[0].content = `${mainKeyword}의 구체적인 학습 범위는 원문 커리큘럼을 기준으로 확인해야 합니다. ${data.sections[0].content}`;
  return data;
}

async function repairMetaDescription(client, course, mainKeyword, current) {
  let candidate = current;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const length = compactLength(candidate);
    if (length === 110 && candidate.includes(mainKeyword)) return candidate;
    console.warn('[content:meta-audit]', { attempt, length, hasKeyword: candidate.includes(mainKeyword) });
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: '원문에 근거한 자연스러운 한국어 SEO 메타 설명 한 문장만 교정합니다. 새로운 사실, 이모지, 해시태그를 추가하지 마세요.',
      input: [
        `메인 키워드: ${mainKeyword}`,
        `현재 문장(공백 제외 ${length}자): ${candidate}`,
        '메인 키워드를 정확히 포함하고, JavaScript에서 모든 공백을 제거했을 때 정확히 110자가 되도록 다시 작성하세요.',
        `검증 가능한 강의 요약: ${JSON.stringify({ title: course.title, description: course.description, curriculum: course.curriculum.slice(0, 30) })}`
      ].join('\n'),
      text: { format: { type: 'json_schema', name: 'meta_description_repair', strict: true, schema: metaDescriptionSchema }, verbosity: 'low' },
      store: false
    });
    if (!response.output_text) break;
    candidate = JSON.parse(response.output_text).meta_description;
  }
  return candidate;
}

async function repairArticleLengths(client, course, mainKeyword, data) {
  let candidate = data;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const bodyLength = candidate.sections.reduce((sum, section) => sum + compactLength(section.content), 0);
    const lengths = {
      introduction: compactLength(candidate.introduction),
      body: bodyLength,
      conclusion: compactLength(candidate.conclusion)
    };
    if (lengths.introduction >= 450 && lengths.introduction <= 550
      && lengths.body >= 1800 && lengths.body <= 2200
      && lengths.conclusion >= 450 && lengths.conclusion <= 550) return candidate;
    console.warn('[content:length-audit]', { attempt, ...lengths });
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: [
        '온라인 강의 소개 글의 분량만 교정합니다.',
        '제공된 원문 강의 데이터에서 확인되지 않는 사실을 추가하지 마세요.',
        '기존 H2 제목과 의미, 메인 키워드의 자연스러운 배치를 유지하세요.',
        '공백 제외 기준으로 서론 480~520자, 본론 content 합계 1,900~2,100자, 결론 480~520자로 작성하세요.'
      ].join('\n'),
      input: [
        `메인 키워드: ${mainKeyword}`,
        `현재 길이: ${JSON.stringify(lengths)}`,
        `교정할 글: ${JSON.stringify({ introduction: candidate.introduction, sections: candidate.sections, conclusion: candidate.conclusion })}`,
        `검증 가능한 강의 데이터: ${JSON.stringify({ title: course.title, description: course.description, curriculum: course.curriculum, reviews: course.reviews.slice(0, 20) })}`
      ].join('\n\n'),
      text: { format: { type: 'json_schema', name: 'article_length_repair', strict: true, schema: articleLengthSchema }, verbosity: 'high' },
      store: false
    });
    if (!response.output_text) break;
    const repaired = JSON.parse(response.output_text);
    candidate = normalizeInvariants({ ...candidate, ...repaired }, mainKeyword);
  }
  return candidate;
}

export async function generateContent(course, mainKeyword, customPrompt = '') {
  const missing = missingConfig(['openaiApiKey']);
  if (missing.length) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  if (!String(mainKeyword || '').trim()) throw new Error('메인 키워드는 필수입니다.');
  mainKeyword = String(mainKeyword).trim();
  const basePrompt = await fs.readFile(config.promptFile, 'utf8');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const compactCourse = { ...course, reviews: course.reviews.slice(0, config.maxReviews) };
  let auditFeedback = '';
  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: [basePrompt, customPrompt].filter(Boolean).join('\n\n추가 요구사항:\n'),
      input: [`강의 URL: ${course.url}`, `메인 키워드: ${mainKeyword}`, `검증 가능한 공개 강의 데이터:\n${JSON.stringify(compactCourse)}`, auditFeedback].filter(Boolean).join('\n\n'),
      text: { format: { type: 'json_schema', name: 'wordpress_post', strict: true, schema }, verbosity: 'high' },
      store: false
    });
    if (!response.output_text) throw new Error('OpenAI가 콘텐츠를 반환하지 않았습니다.');
    let data = normalizeInvariants(JSON.parse(response.output_text), mainKeyword);
    data.meta_description = await repairMetaDescription(client, compactCourse, mainKeyword, data.meta_description);
    data = await repairArticleLengths(client, compactCourse, mainKeyword, data);
    const errors = auditGeneratedContent(data, mainKeyword);
    if (!errors.length) {
      return {
        ...data,
        content: renderWordPressContent(data, course.url),
        excerpt: data.meta_description,
        tags: data.wordpress_tags
      };
    }
    lastErrors = errors;
    console.warn('[content:audit-failed]', { attempt, errors });
    auditFeedback = `이전 결과가 다음 검증에 실패했습니다. 모든 항목을 수정해 전체 결과를 다시 작성하세요:\n- ${errors.join('\n- ')}`;
  }
  const error = new Error('SEO 및 분량 검증 실패');
  error.code = 'CONTENT_AUDIT_FAILED';
  error.auditErrors = lastErrors;
  throw error;
}
