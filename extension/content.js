(() => {
if (globalThis.__INFLEARN_PUBLISHER_LOADED__) return;
globalThis.__INFLEARN_PUBLISHER_LOADED__ = true;

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function textOf(selector) {
  return clean(document.querySelector(selector)?.textContent);
}

function pageText() {
  return clean(document.body.innerText);
}

function sectionByHeading(pattern) {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
  const heading = headings.find((node) => pattern.test(clean(node.textContent)));
  if (!heading) return null;
  let node = heading;
  for (let depth = 0; depth < 5 && node; depth += 1, node = node.parentElement) {
    if (clean(node.innerText).length > clean(heading.innerText).length + 100) return node;
  }
  return heading.parentElement;
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function extractCurriculum() {
  const area = sectionByHeading(/^커리큘럼$/) || document;
  const lines = unique(area.innerText.split('\n'));
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (/^섹션\s*\d+[.\s]/.test(line)) {
      current = { title: line, lessons: [] };
      sections.push(current);
    } else if (current && (/^\d+[.)]\s/.test(line) || /미리보기$/.test(line))) {
      current.lessons.push(line.replace(/미리보기$/, '').trim());
    }
  }
  return sections;
}

function extractVisibleReviews() {
  const area = sectionByHeading(/^수강평$/) || document;
  const markerNodes = [...area.querySelectorAll('*')].filter((node) => /\d+%\s*수강 후 작성/.test(clean(node.textContent)));
  const markerCards = markerNodes.map((marker) => {
    let card = marker;
    while (card.parentElement && clean(card.innerText).length < 80) card = card.parentElement;
    while (card.parentElement) {
      const parentText = clean(card.parentElement.innerText);
      const markerCount = (parentText.match(/\d+%\s*수강 후 작성/g) || []).length;
      if (parentText.length > 5000 || markerCount > 1) break;
      card = card.parentElement;
    }
    return card;
  });
  const selectorCards = [...area.querySelectorAll('article, [data-testid*="review"], [class*="review-card"], [class*="ReviewCard"]')];
  return unique([...markerCards, ...selectorCards].map((node) => clean(node.innerText)))
    .filter((text) => text.length >= 80 && text.length <= 5000)
    .map((content) => ({ content }));
}

function findNextReviewControl() {
  const area = sectionByHeading(/^수강평$/) || document;
  const controls = [...area.querySelectorAll('button, a')].filter((node) => !node.disabled && node.getAttribute('aria-disabled') !== 'true');
  const more = controls.find((node) => /^(수강평\s*)?더보기$/.test(clean(node.textContent)));
  if (more) return more;
  const next = controls.find((node) => /^(다음|next)$/i.test(clean(node.textContent)) || /(다음|next)/i.test(node.getAttribute('aria-label') || '') || /(다음|next)/i.test(node.getAttribute('title') || ''));
  if (next) return next;
  const current = controls.find((node) => node.getAttribute('aria-current') === 'page' || /active|selected/i.test(node.className || ''));
  const currentPage = Number(clean(current?.textContent));
  if (Number.isInteger(currentPage)) return controls.find((node) => Number(clean(node.textContent)) === currentPage + 1) || null;
  return null;
}

async function collectReviews(limit = 50) {
  const collected = new Map();
  for (let page = 0; page < 10 && collected.size < limit; page += 1) {
    const visible = extractVisibleReviews();
    visible.forEach((review) => collected.set(review.content, review));
    const next = findNextReviewControl();
    if (!next || collected.size >= limit) break;
    const before = visible.map((review) => review.content).join('|');
    next.click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const after = extractVisibleReviews().map((review) => review.content).join('|');
    if (after === before && !/더보기/.test(clean(next.textContent))) break;
  }
  return [...collected.values()].slice(0, limit);
}

function extractCourse(reviews = extractVisibleReviews()) {
  const raw = pageText();
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => { try { return JSON.parse(node.textContent); } catch { return null; } })
    .flatMap((value) => Array.isArray(value) ? value : [value]).find((value) => value?.['@type'] === 'Course') || {};
  return {
    url: location.href,
    title: clean(jsonLd.name) || textOf('h1'),
    description: clean(jsonLd.description) || textOf('meta[name="description"]') || '',
    instructor: clean(jsonLd.provider?.name),
    rating: raw.match(/\b[0-5]\.\d\b/)?.[0] || '',
    studentCount: raw.match(/수강생\s*[\d,]+명/)?.[0] || '',
    curriculum: extractCurriculum(),
    reviews,
    collectedAt: new Date().toISOString()
  };
}

async function expandCurriculum() {
  const expandButton = [...document.querySelectorAll('button')]
    .find((button) => clean(button.textContent) === '모두 펼치기');
  if (!expandButton) return false;
  expandButton.click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'EXTRACT_COURSE') return;
  (async () => {
    try {
      const expanded = await expandCurriculum();
      const reviews = await collectReviews(50);
      const course = extractCourse(reviews);
      console.info('[Inflearn Publisher] extraction complete', {
        expanded,
        title: course.title,
        curriculumSections: course.curriculum.length,
        reviews: course.reviews.length
      });
      sendResponse({ ok: true, course, diagnostics: { expanded } });
    } catch (error) {
      console.error('[Inflearn Publisher] extraction failed', error);
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
});
})();
