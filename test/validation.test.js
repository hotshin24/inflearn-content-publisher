import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCourse, validatePost } from '../server/validation.js';

test('validates and limits course data', () => {
  const course = validateCourse({ url: 'https://www.inflearn.com/course/example', title: ' 강의 ', curriculum: [], reviews: [] });
  assert.equal(course.title, '강의');
});

test('rejects unrelated URLs', () => {
  assert.throws(() => validateCourse({ url: 'https://example.com', title: 'x' }), /인프런/);
});

test('defaults WordPress posts to draft', () => {
  assert.equal(validatePost({ title: '글', content: '<p>본문</p>' }).status, 'draft');
});
