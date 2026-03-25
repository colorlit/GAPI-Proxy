// Chatboongproxy 환경설정

const config = {
    USE_TURNSTILE: false, // Turnstile 사용 여부 (true/false)
    USE_NGINX: true, // Nginx 사용 여부 (true/false)
    TURNSTILE_SITE_KEY: 'PUT YOUR TURNSTILE SITE KEY HERE',
    TURNSTILE_SECRET_KEY: 'PUT YOUR TURNSTILE SECRET KEY HERE',
    TURNSTILE_VERIFY_URL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    PROXY_TARGET: 'https://generativelanguage.googleapis.com',
    ALLOWED_HOST: 'localhost',
    ALLOWED_REFERER: 'localhost',
    HTTP_PORT: 80,
    HTTPS_PORT: 443,
    PAGE_PASSWORD: 'your_password_here' // 토큰 발급 비밀번호
};

// using CF Turnstile
if (config.USE_TURNSTILE) {
    config.HTTP_PORT = 80;
    config.HTTPS_PORT = 443;
    config.USE_NGINEX = false;
}

// using local Nginx
else if (config.USE_NGINX) {
    config.HTTP_PORT = 3000; // Nginx HTTP Port
    config.HTTPS_PORT = 3001; // Nginx HTTPS Port Placeholder
}

module.exports = config;
