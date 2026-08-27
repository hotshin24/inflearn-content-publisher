let course = null;
let generated = null;
const $ = (id) => document.getElementById(id);
const setStatus = (text, isError = false) => {
  $('statusText').textContent = text;
  $('statusText').style.color = isError ? '#ff8d86' : '#8e9188';
  document.querySelector('.status-icon').style.color = isError ? '#ff8d86' : '#b8ed73';
};

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function api(path, options = {}) {
  const base = APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (APP_CONFIG.apiAccessToken) headers.Authorization = `Bearer ${APP_CONFIG.apiAccessToken}`;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `API 오류 (${response.status})`);
  return body;
}

$('collect').addEventListener('click', async () => {
  try {
    setStatus('페이지에서 공개 정보를 수집하는 중…');
    const tab = await activeTab();
    if (!tab.url?.startsWith('https://www.inflearn.com/course/')) throw new Error('인프런 강의 페이지를 열어주세요.');
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_COURSE' });
    if (!result?.ok) throw new Error(result?.error || '수집에 실패했습니다. 페이지를 새로고침해 보세요.');
    course = result.course;
    $('generate').disabled = false;
    setStatus(`수집 완료: 커리큘럼 ${course.curriculum.length}개 섹션, 수강평 ${course.reviews.length}개`);
  } catch (error) { setStatus(error.message, true); }
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
