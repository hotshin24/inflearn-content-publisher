const ALLOWED_STATUSES = new Set(['draft', 'pending', 'private', 'publish']);

export function validateCourse(input) {
  if (!input || typeof input !== 'object') throw new Error('강의 데이터가 없습니다.');
  if (!/^https:\/\/www\.inflearn\.com\/course\//.test(input.url || '')) {
    throw new Error('올바른 인프런 강의 URL이 아닙니다.');
  }
  if (!String(input.title || '').trim()) throw new Error('강의 제목을 찾지 못했습니다.');

  return {
    url: input.url,
    title: String(input.title).trim().slice(0, 300),
    description: String(input.description || '').trim().slice(0, 5000),
    instructor: String(input.instructor || '').trim().slice(0, 100),
    rating: String(input.rating || '').trim().slice(0, 20),
    studentCount: String(input.studentCount || '').trim().slice(0, 30),
    curriculum: Array.isArray(input.curriculum) ? input.curriculum.slice(0, 250) : [],
    reviews: Array.isArray(input.reviews) ? input.reviews.slice(0, 100) : [],
    collectedAt: input.collectedAt || new Date().toISOString(),
  };
}

export function validatePost(input) {
  if (!input || typeof input !== 'object') throw new Error('게시물 데이터가 없습니다.');
  if (!String(input.title || '').trim() || !String(input.content || '').trim()) {
    throw new Error('게시물 제목과 본문은 필수입니다.');
  }
  const status = input.status || 'draft';
  if (!ALLOWED_STATUSES.has(status)) throw new Error('지원하지 않는 발행 상태입니다.');
  return { ...input, title: String(input.title).trim(), content: String(input.content).trim(), status };
}
