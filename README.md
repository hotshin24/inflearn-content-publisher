# Inflearn Content Publisher

인프런 강의 페이지에서 공개 커리큘럼과 수강평을 수집하고, OpenAI Responses API로 한국어 홍보 글을 만든 뒤 WordPress REST API로 전송하는 기본 프로젝트입니다.

> 해당 콘텐츠를 홍보할 권한이 있는지 확인하고 인프런 이용약관, robots 정책, 개인정보·저작권 및 광고 표시 의무를 준수하세요. 수강평 원문을 대량 재게시하지 말고 근거를 요약해 사용하세요.

## 구성

- `extension/`: Chrome Manifest V3 확장프로그램. 현재 열린 인프런 강의 페이지의 렌더링된 공개 DOM을 수집합니다.
- `server/`: API 키를 브라우저에 노출하지 않는 로컬 Node.js 서버입니다.
- `prompts/default.md`: 기본 콘텐츠 생성 프롬프트입니다.
- `data/`: 향후 수집 결과를 저장할 수 있는 로컬 디렉터리입니다(JSON은 Git 제외).

## 1. 서버 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에 아래 값을 넣습니다.

- `OPENAI_API_KEY`: OpenAI API 키
- `OPENAI_MODEL`: 기본값 `gpt-5.6-terra`; 계정에서 사용 가능한 모델로 변경 가능
- `WORDPRESS_URL`: `https://blog.example.com` 형태
- `WORDPRESS_USERNAME`: 워드프레스 사용자명
- `WORDPRESS_APP_PASSWORD`: 사용자 프로필에서 만든 애플리케이션 비밀번호
- `WORDPRESS_DEFAULT_STATUS`: 안전한 기본값 `draft`
- `WORDPRESS_DEFAULT_CATEGORY_IDS`: 쉼표로 구분한 카테고리 ID(선택)
- `WORDPRESS_DEFAULT_CATEGORY_NAME`: ID가 없을 때 연결할 카테고리명(기본값: `인강 리뷰`)

연결 확인:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/api/wordpress/verify
```

## 2. Chrome 확장프로그램 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 눌러 이 저장소의 `extension` 폴더를 선택합니다.
4. 확장 아이콘을 열고 대상 인프런 강의 URL을 입력합니다.
5. **수집 → 초안 생성 → 워드프레스 전송** 순으로 진행합니다.

확장프로그램은 입력한 URL을 백그라운드 탭에서 열고 커리큘럼을 펼친 뒤 수강평 페이지를 순회합니다. 수강평은 중복을 제거해 최대 50개까지 수집하며, 완료 후 백그라운드 탭은 자동으로 닫힙니다. 인프런 DOM 구조가 바뀌면 `extension/content.js`의 추출 규칙을 조정해야 합니다.

## 3. 프롬프트 교체

전달할 프롬프트를 `prompts/default.md`에 넣으세요. 팝업의 **추가 프롬프트**는 한 번의 생성 요청에만 덧붙습니다.

## GitHub 배포 준비

```bash
git init
git add .
git commit -m "chore: bootstrap content publisher"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

`.env`는 `.gitignore`에 포함되어 있습니다. OpenAI 키나 워드프레스 애플리케이션 비밀번호를 저장소, 확장프로그램 코드, GitHub 커밋에 넣지 마세요. 현재 서버는 로컬 실행용입니다. 인터넷에 공개 배포하려면 인증, 요청 제한, HTTPS, 허용 확장 ID 제한을 추가해야 합니다.

### GitHub와 서버 배포의 차이

GitHub 저장소는 소스 코드를 보관하고 배포 이력을 관리합니다. GitHub Pages는 정적 HTML/CSS/JavaScript만 제공하므로 이 프로젝트의 Node.js API 서버, OpenAI 키, WordPress 애플리케이션 비밀번호를 실행·보관하는 용도로 사용할 수 없습니다.

운영 배포 시에는 다음 구조를 사용합니다.

1. 전체 소스 코드를 GitHub 저장소에 푸시합니다.
2. `server/`를 Node.js 또는 서버리스 호스팅에 배포하고 비밀값을 해당 서비스의 환경변수에 등록합니다.
3. `extension/config.js`의 `apiBaseUrl`을 배포된 HTTPS 서버 주소로 변경합니다.
4. `extension/manifest.json`의 `host_permissions`에 같은 서버 도메인을 추가합니다.
5. Chrome 웹 스토어 또는 압축 파일로 확장프로그램을 배포합니다.

서버 주소는 일반 사용자 UI에 표시되지 않습니다. `extension/config.js`는 공개되는 설정이므로 API 키나 WordPress 비밀번호를 넣으면 안 됩니다.

가비아 클라우드 운영 절차는 `deploy/README.md`를 참고하세요. 배포 설정은 기존 프로젝트와 충돌하지 않도록 `/opt/inflearn-publisher`, systemd 서비스 `inflearn-publisher`, 내부 포트 `8787`을 사용합니다.

## API

- `POST /api/generate` — `{ course, prompt? }` → 생성된 글
- `POST /api/publish` — `{ post }` → 워드프레스 게시물
- `POST /api/generate-and-publish` — 서버 자동화용 결합 엔드포인트(기본 draft)
- `GET /api/wordpress/verify` — 워드프레스 자격증명 확인

## 확인

```bash
npm run check
npm test
```
