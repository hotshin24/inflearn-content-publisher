import { chromium } from 'playwright';
import { config } from '../config.js';

let crawlInProgress = false;

function validateInflearnUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('올바른 인프런 강의 URL이 아닙니다.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.inflearn.com' || !url.pathname.startsWith('/course/')) {
    throw new Error('https://www.inflearn.com/course/... 형식의 URL만 크롤링할 수 있습니다.');
  }
  return url.href;
}

async function extractPage(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];
    const bodyText = clean(document.body.innerText);
    const heading = (pattern) => [...document.querySelectorAll('h1,h2,h3,h4')].find((node) => pattern.test(clean(node.textContent)));
    const areaFor = (pattern) => {
      const title = heading(pattern);
      if (!title) return document;
      let node = title;
      for (let depth = 0; depth < 6 && node; depth += 1, node = node.parentElement) {
        if (clean(node.innerText).length > clean(title.innerText).length + 100) return node;
      }
      return title.parentElement || document;
    };

    const curriculumArea = areaFor(/^커리큘럼$/);
    const sections = [];
    let current = null;
    for (const line of unique(curriculumArea.innerText.split('\n'))) {
      if (/^섹션\s*\d+[.\s]/.test(line)) {
        current = { title: line, lessons: [] };
        sections.push(current);
      } else if (current && (/^\d+[.)]\s/.test(line) || /미리보기$/.test(line))) {
        current.lessons.push(line.replace(/미리보기$/, '').trim());
      }
    }

    const reviewButtons = [...document.querySelectorAll('button')].filter((node) => /\d+%\s*수강 후 작성/.test(clean(node.innerText)));
    const markers = reviewButtons.length
      ? reviewButtons
      : [...document.querySelectorAll('*')].filter((node) => /\d+%\s*수강 후 작성/.test(clean(node.textContent)));
    const cards = markers.map((marker) => {
      if (marker.tagName === 'BUTTON') return marker;
      let card = marker;
      while (card.parentElement && clean(card.innerText).length < 80) card = card.parentElement;
      while (card.parentElement) {
        const text = clean(card.parentElement.innerText);
        const count = (text.match(/\d+%\s*수강 후 작성/g) || []).length;
        if (text.length > 5000 || count > 1) break;
        card = card.parentElement;
      }
      return card;
    });
    const reviews = unique(cards.map((node) => node.innerText)).filter((text) => text.length >= 80 && text.length <= 5000);

    return {
      title: clean(document.querySelector('h1')?.textContent),
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      instructor: '',
      rating: bodyText.match(/\b[0-5]\.\d\b/)?.[0] || '',
      studentCount: bodyText.match(/수강생\s*[\d,]+명/)?.[0] || '',
      curriculum: sections,
      reviews
    };
  });
}

async function clickNextReviews(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const heading = [...document.querySelectorAll('h1,h2,h3,h4')].find((node) => clean(node.textContent) === '수강평');
    let area = heading || document.body;
    while (area.parentElement && clean(area.innerText).length < 200) area = area.parentElement;
    const controls = [...area.querySelectorAll('button,a')].filter((node) => !node.disabled && node.getAttribute('aria-disabled') !== 'true');
    const more = controls.find((node) => /^(수강평\s*)?더보기$/.test(clean(node.textContent)));
    const next = more || controls.find((node) => /^(다음|next)$/i.test(clean(node.textContent)) || /(다음|next)/i.test(node.getAttribute('aria-label') || '') || /(다음|next)/i.test(node.getAttribute('title') || ''));
    if (!next) return false;
    next.click();
    return true;
  });
}

async function openAllReviews(page) {
  const button = page.locator('button', { hasText: '전체 수강평 보기' });
  if (!(await button.count())) return false;
  await button.last().scrollIntoViewIfNeeded().catch(() => {});
  await button.last().click({ noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}

async function loadMoreReviews(page) {
  const clicked = await clickNextReviews(page);
  if (clicked) return true;
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    const root = dialog || document.scrollingElement;
    if (!root) return false;
    const scrollables = dialog
      ? [dialog, ...dialog.querySelectorAll('*')].filter((node) => node.scrollHeight > node.clientHeight + 20)
      : [root];
    const target = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || root;
    const before = target.scrollTop;
    target.scrollTop = target.scrollHeight;
    return target.scrollTop !== before;
  });
}

export async function crawlInflearnCourse(rawUrl) {
  const url = validateInflearnUrl(rawUrl);
  if (crawlInProgress) {
    const error = new Error('다른 크롤링 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
    error.status = 429;
    throw error;
  }
  crawlInProgress = true;
  const launchOptions = { headless: true };
  if (config.crawlerBrowserChannel) launchOptions.channel = config.crawlerBrowserChannel;
  let browser;
  try {
    browser = await chromium.launch(launchOptions).catch((error) => {
      throw new Error(`크롤러 브라우저를 실행하지 못했습니다. Playwright Chromium 설치를 확인하세요: ${error.message}`);
    });
    const context = await browser.newContext({ locale: 'ko-KR' });
    const page = await context.newPage();
    page.setDefaultTimeout(config.crawlerTimeoutMs);
    console.info('[crawl:start]', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.crawlerTimeoutMs });
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '모두 펼치기', exact: true }).click().catch(() => {});
    await page.waitForTimeout(700);
    await openAllReviews(page);

    const allReviews = new Map();
    let snapshot = await extractPage(page);
    for (let pageIndex = 0; pageIndex < 20 && allReviews.size < 50; pageIndex += 1) {
      snapshot.reviews.forEach((content) => allReviews.set(content, { content }));
      if (allReviews.size >= 50 || !(await loadMoreReviews(page))) break;
      await page.waitForTimeout(900);
      const nextSnapshot = await extractPage(page);
      if (nextSnapshot.reviews.join('|') === snapshot.reviews.join('|')) {
        await page.waitForTimeout(700);
        const retrySnapshot = await extractPage(page);
        if (retrySnapshot.reviews.join('|') === snapshot.reviews.join('|')) break;
        snapshot = retrySnapshot;
        continue;
      }
      snapshot = nextSnapshot;
    }

    const course = {
      url,
      ...snapshot,
      reviews: [...allReviews.values()].slice(0, 50),
      collectedAt: new Date().toISOString()
    };
    console.info('[crawl:complete]', { curriculumSections: course.curriculum.length, reviews: course.reviews.length });
    return course;
  } finally {
    crawlInProgress = false;
    await browser?.close();
  }
}
