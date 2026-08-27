# 가비아 클라우드 배포

기존 프로젝트와 분리하여 다음 자원을 사용합니다.

- 앱 경로: `/opt/inflearn-publisher`
- 환경변수: `/etc/inflearn-publisher.env`
- systemd 서비스: `inflearn-publisher`
- 내부 주소: `127.0.0.1:8787`
- 외부 주소: Nginx의 전용 HTTPS 도메인

## 최초 서버 설정

Ubuntu 서버에 Node.js 20 이상, Nginx, Certbot을 설치한 뒤 다음 작업을 수행합니다.

```bash
sudo useradd --system --home /opt/inflearn-publisher --shell /usr/sbin/nologin inflearn-publisher
sudo install -d -o inflearn-publisher -g inflearn-publisher /opt/inflearn-publisher/data
```

프로젝트를 `/opt/inflearn-publisher`에 처음 업로드하고 `.env.example`을 참고해 `/etc/inflearn-publisher.env`를 만듭니다.

```bash
sudo chmod 600 /etc/inflearn-publisher.env
sudo chown root:root /etc/inflearn-publisher.env
```

운영 환경에는 다음 값이 반드시 필요합니다.

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=1
API_ACCESS_TOKEN=<충분히 긴 무작위 토큰>
ALLOWED_EXTENSION_IDS=<Chrome 확장프로그램 ID>
ALLOWED_WEB_ORIGINS=https://api.example.com
```

systemd 서비스를 설치합니다.

```bash
sudo cp /opt/inflearn-publisher/deploy/inflearn-publisher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now inflearn-publisher
```

`deploy/nginx.conf`의 `api.example.com`을 실제 도메인으로 교체한 뒤 설치하고 HTTPS를 발급합니다.

```bash
sudo cp /opt/inflearn-publisher/deploy/nginx.conf /etc/nginx/sites-available/inflearn-publisher
sudo ln -s /etc/nginx/sites-available/inflearn-publisher /etc/nginx/sites-enabled/inflearn-publisher
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.example.com
```

마지막으로 `extension/config.js`의 서버 URL·접근 토큰과 `extension/manifest.json`의 `host_permissions`를 운영 값으로 변경합니다.

## GitHub Actions 비밀값

- `GABIA_HOST`: 서버 공인 IP 또는 SSH 도메인
- `GABIA_USER`: sudo 가능한 배포 계정
- `GABIA_SSH_PRIVATE_KEY`: 해당 계정의 SSH 개인키
- `GABIA_SSH_HOST_KEY`: 직접 확인한 서버의 known_hosts 한 줄

최초 한 번은 계정, 환경변수, systemd, Nginx 설정을 수동 설치해야 합니다. 이후 `main` 푸시마다 자동 배포됩니다.
