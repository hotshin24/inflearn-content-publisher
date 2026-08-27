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
      { heading: '학습 대상', content: fill('학습 내용 ', 700) }
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

test('renders structured sections as safe WordPress HTML', () => {
  const data = validContent();
  data.sections[0].heading = '<script>alert(1)</script>';
  const html = renderWordPressContent(data, 'https://www.inflearn.com/course/example');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<h2>결론</h2>'));
});
