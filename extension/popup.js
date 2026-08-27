let course = null;
let generated = null;
const $ = (id) => document.getElementById(id);
const setStatus = (text, isError = false) => {
  $('statusText').textContent = text;
  $('statusText').style.color = isError ? '#ff8d86' : '#8e9188';
  document.querySelector('.status-icon').style.color = isError ? '#ff8d86' : '#b8ed73';
};

function isInflearnCourseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.inflearn.com' && url.pathname.startsWith('/course/');
  } catch {
    return false;
  }
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('인프런 페이지 로딩 시간이 초과됐습니다.'));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }).catch(reject);
  });
}

async function requestCourse(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_COURSE' });
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(error.message)) throw error;
    console.info('[Inflearn Publisher] injecting content script into stale tab');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_COURSE' });
  }
}

async function api(path, options = {}) {
  const base = APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (APP_CONFIG.apiAccessToken) headers.Authorization = `Bearer ${APP_CONFIG.apiAccessToken}`;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = body.auditErrors?.length ? `\n• ${body.auditErrors.join('\n• ')}` : '';
    throw new Error(`${body.error || `API 오류 (${response.status})`}${details}`);
  }
  return body;
}

$('collect').addEventListener('click', async () => {
  let crawlerTabId = null;
  try {
    const courseUrl = $('courseUrl').value.trim();
    if (!isInflearnCourseUrl(courseUrl)) throw new Error('올바른 인프런 강의 URL을 입력하세요.');
    let result;
    if (globalThis.chrome?.tabs?.create && location.protocol === 'chrome-extension:') {
      setStatus('인프런 페이지를 백그라운드에서 여는 중…');
      const tab = await chrome.tabs.create({ url: courseUrl, active: false });
      crawlerTabId = tab.id;
      if (tab.status !== 'complete') await waitForTabComplete(tab.id);
      setStatus('커리큘럼과 수강평을 수집하는 중…');
      result = await requestCourse(tab.id);
    } else {
      setStatus('서버가 인프런 페이지를 열어 수집하는 중…');
      const response = await api('/api/crawl', { method: 'POST', body: JSON.stringify({ url: courseUrl }) });
      result = { ok: true, course: response.course, diagnostics: { serverCrawler: true } };
    }
    if (!result?.ok) throw new Error(result?.error || '수집에 실패했습니다. 페이지를 새로고침해 보세요.');
    course = result.course;
    if (!course.title) throw new Error('강의 제목을 찾지 못했습니다. 인프런 강의 상세 페이지인지 확인하세요.');
    $('generate').disabled = false;
    setStatus(`수집 완료: 커리큘럼 ${course.curriculum.length}개 섹션, 수강평 ${course.reviews.length}개${result.diagnostics?.serverCrawler ? ' · 서버 크롤링' : result.diagnostics?.expanded ? ' · 커리큘럼 펼침' : ''}`);
  } catch (error) { setStatus(error.message, true); }
  finally { if (crawlerTabId) chrome.tabs.remove(crawlerTabId).catch(() => {}); }
});

$('generate').addEventListener('click', async () => {
  try {
    const mainKeyword = $('mainKeyword').value.trim();
    if (!mainKeyword) throw new Error('메인 키워드를 입력하세요.');
    setStatus('OpenAI로 초안을 생성하는 중…');
    generated = await api('/api/generate', { method: 'POST', body: JSON.stringify({ course, mainKeyword, prompt: $('prompt').value }) });
    $('title').value = generated.title;
    $('content').value = generated.content;
    $('focusKeyphrase').textContent = generated.focus_keyphrase;
    $('metaDescription').textContent = generated.meta_description;
    $('wordpressTags').textContent = generated.wordpress_tags.join(', ');
    $('publish').disabled = false;
    setStatus('초안 생성 완료. 내용을 검토한 뒤 전송하세요.');
  } catch (error) { setStatus(error.message, true); }
});

$('publish').addEventListener('click', async () => {
  try {
    const status = $('status').value;
    if (status === 'publish' && !confirm('즉시 공개 발행합니다. 계속할까요?')) return;
    setStatus('워드프레스로 전송하는 중…');
    const post = { ...generated, title: $('title').value, content: $('content').value, status };
    const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ post }) });
    setStatus(`전송 완료: ${result.link || `게시물 #${result.id}`}`);
  } catch (error) { setStatus(error.message, true); }
});
