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

export async function generateContent(course, mainKeyword, customPrompt = '') {
  const missing = missingConfig(['openaiApiKey']);
  if (missing.length) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  if (!String(mainKeyword || '').trim()) throw new Error('메인 키워드는 필수입니다.');
  mainKeyword = String(mainKeyword).trim();
  const basePrompt = await fs.readFile(config.promptFile, 'utf8');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const compactCourse = { ...course, reviews: course.reviews.slice(0, config.maxReviews) };
  let auditFeedback = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: [basePrompt, customPrompt].filter(Boolean).join('\n\n추가 요구사항:\n'),
      input: [`강의 URL: ${course.url}`, `메인 키워드: ${mainKeyword}`, `검증 가능한 공개 강의 데이터:\n${JSON.stringify(compactCourse)}`, auditFeedback].filter(Boolean).join('\n\n'),
      text: { format: { type: 'json_schema', name: 'wordpress_post', strict: true, schema }, verbosity: 'high' },
      store: false
    });
    if (!response.output_text) throw new Error('OpenAI가 콘텐츠를 반환하지 않았습니다.');
    const data = JSON.parse(response.output_text);
    const errors = auditGeneratedContent(data, mainKeyword);
    if (!errors.length) {
      return {
        ...data,
        content: renderWordPressContent(data, course.url),
        excerpt: data.meta_description,
        tags: data.wordpress_tags
      };
    }
    auditFeedback = `이전 결과가 다음 검증에 실패했습니다. 모든 항목을 수정해 전체 결과를 다시 작성하세요:\n- ${errors.join('\n- ')}`;
  }
  throw new Error('생성 결과가 3회 시도 후에도 SEO 및 분량 검증을 통과하지 못했습니다.');
}
