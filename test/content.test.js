import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGeneratedContent, renderWordPressContent } from '../server/services/content.js';

const keyword = '클로드 코드 강의';
const fill = (prefix, length) => prefix + '가'.repeat(length - prefix.replace(/\s/g, '').length);

function validContent() {
  return {
    title: `${keyword} 커리큘럼 살펴보기`,
    main_keyword: keyword,
    focus_keyphrase: keyword,
    meta_description: fill(`${keyword} `, 110),
    introduction: fill(`${keyword} `, 500),
    sections: [
      { heading: `${keyword} 학습 흐름`, content: fill(`${keyword} `, 650) },
      { heading: '커리큘럼', content: fill(`${keyword} `, 650) },
      { heading: '학습 대상', content: fill('학습 내용 ', 700) },
      { heading: '수강평에서 확인한 반응', content: fill('실제 수강평 요약 ', 500) }
    ],
    conclusion: fill(`${keyword} `, 500),
    core_keywords: [keyword, 'AI 개발', '바이브 코딩', 'MCP', '개발 워크플로우'],
    related_keywords: Array.from({ length: 10 }, (_, index) => `연관 키워드 ${index + 1}`),
    wordpress_tags: [keyword, ...Array.from({ length: 9 }, (_, index) => `태그 ${index + 1}`)]
  };
}

test('accepts generated content that meets deterministic SEO rules', () => {
  assert.deepEqual(auditGeneratedContent(validContent(), keyword), []);
});

test('requires one 450 to 550 character review chapter', () => {
  const missing = validContent();
  missing.sections = missing.sections.filter((section) => !section.heading.includes('수강평'));
  assert.ok(auditGeneratedContent(missing, keyword).includes('수강평을 다루는 H2 챕터가 정확히 1개가 아닙니다.'));

  const short = validContent();
  short.sections.find((section) => section.heading.includes('수강평')).content = '짧은 수강평 요약';
  assert.ok(auditGeneratedContent(short, keyword).includes('수강평 챕터가 공백 제외 450~550자가 아닙니다.'));
});

test('rejects an SEO title longer than 45 characters', () => {
  const data = validContent();
  data.title = `${keyword} ${'긴제목'.repeat(20)}`;
  assert.ok(auditGeneratedContent(data, keyword).some((error) => error.includes('45자 이하')));
});

test('renders structured sections as safe WordPress HTML', () => {
  const data = validContent();
  data.sections[0].heading = '<script>alert(1)</script>';
  const html = renderWordPressContent(data, 'https://www.inflearn.com/course/example');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<h2>결론</h2>'));
});
