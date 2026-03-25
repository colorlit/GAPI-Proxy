# GAPI-Proxy

**GAPI-Proxy**는 Google Gemini API (`https://generativelanguage.googleapis.com`)에 대한 보안 강화된 Node.js 리버스 프록시 서버입니다. 토큰 기반 인증 시스템을 제공하며, EU/영국 서버에서만 실행되도록 지리적 제한을 두고 있습니다.

## 주요 기능

- **리버스 프록시**: Google Gemini API에 대한 안전한 프록시 서버
- **Cloudflare Turnstile 인증**: 봇 방지 및 스팸 차단
- **토큰 기반 인증**: 발급된 토큰을 통한 API 접근 제어
- **지리적 제한**: EU/영국 서버에서만 실행 가능

## 시스템 요구사항

- **운영 체제**: Ubuntu, AlmaLinux, Rocky Linux, Oracle Linux
- **Node.js**: 22.x 이상
- **서버 위치**: EU 국가 또는 영국

## Nginx 리버스 프록시 연동

이 포크 버전은 DuckDNS와 같은 무료 DDNS 환경에서도 안전하게 서비스할 수 있도록 **Nginx 리버스 프록시** 구조에 최적화되었습니다.

사용 중인 Nginx 설정 파일(주로 `/etc/nginx/sites-available/default`)을 열고, HTTPS를 처리하는 `server { ... }` 블록 내부에 아래의 `location` 라우팅 설정을 추가해 주세요.

**예시 접속 주소:** `https://your-domain.com/proxy/`

```nginx
location /proxy/ {
    proxy_pass http://localhost:3000/; 
    
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
}
```