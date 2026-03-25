const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const sslOptions = require('./sslOptions');
const config = require('./config');
const TARGET = config.PROXY_TARGET;
const HTTP_PORT = config.HTTP_PORT;
const HTTPS_PORT = config.HTTPS_PORT;
const crypto = require('crypto');
const TOKENS_FILE = path.join(__dirname, 'issuedTokens.json');
let issuedTokens = new Set();

function loadTokens() {
    try {
        if (fs.existsSync(TOKENS_FILE)) {
            const data = fs.readFileSync(TOKENS_FILE, 'utf-8');
            const arr = JSON.parse(data);
            issuedTokens = new Set(arr);
        }
    } catch (e) {
        console.error('토큰 파일 로드 실패:', e);
    }
}

function saveTokens() {
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(Array.from(issuedTokens)), 'utf-8');
    } catch (e) {
        console.error('토큰 파일 저장 실패:', e);
    }
}
loadTokens();
function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}
const requestHandler = async (clientReq, clientRes) => {
    if (clientReq.url.startsWith('/') && clientReq.method === 'GET' && clientReq.url.split('?')[0] === '/') {
        const hostHeader = clientReq.headers['host'] || '';
        if (hostHeader !== config.ALLOWED_HOST) {
            clientRes.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            clientRes.end('허용되지 않은 호스트(IP)로의 접근입니다.');
            return;
        }
        if (!config.USE_TURNSTILE) {
            const url = new URL(clientReq.url, `http://${hostHeader}`);
            const password = url.searchParams.get('password');
            if (!password) {
                clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                clientRes.end(`
                    <html><body>
                    <h2>ChatboongProxy 토큰 발급 페이지</h2>
                    <form method="GET" action="/">
                        <input type="password" name="password" placeholder="비밀번호 입력" style="width:200px;" />
                        <button type="submit">토큰 발급</button>
                    </form>
                    </body></html>
                `);
                return;
            }
            if (password === config.PAGE_PASSWORD) {
                const token = generateToken();
                issuedTokens.add(token);
                saveTokens();
                clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                clientRes.end(`
                    <html><body>
                    <h2>ChatboongProxy 토큰 발급 완료</h2>
                    <input type="text" value="${token}" readonly style="width:350px;" onclick="this.select()" />
                    <p>이 토큰을 Chatboongproxyauth 헤더에 사용하세요.</p>
                    <a href="/">돌아가기</a>
                    </body></html>
                `);
                return;
            } else {
                clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                clientRes.end(`
                    <html><body>
                    <h2>ChatboongProxy 토큰 발급 페이지</h2>
                    <form method="GET" action="/">
                        <input type="password" name="password" placeholder="비밀번호 입력" style="width:200px;" />
                        <button type="submit">토큰 발급</button>
                    </form>
                    <p style="color:red;">비밀번호가 올바르지 않습니다.</p>
                    </body></html>
                `);
                return;
            }
        }
        clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        clientRes.end(`
            <html><head>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
            </head><body>
            <h2>ChatboongProxy 토큰 발급</h2>
            <form method="POST" action="/issue-token">
                <div class="cf-turnstile" data-sitekey="${config.TURNSTILE_SITE_KEY}"></div>
                <button type="submit">토큰 발급</button>
            </form>
            </body></html>
        `);
        return;
    }
    if (clientReq.url === '/issue-token' && clientReq.method === 'POST') {
        const referer = clientReq.headers['referer'] || '';
        if (!referer.startsWith(config.ALLOWED_REFERER)) {
            clientRes.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            clientRes.end('CSRF 방지: 올바른 Referer가 아닙니다.');
            return;
        }
        const hostHeader = clientReq.headers['host'] || '';
        if (hostHeader !== config.ALLOWED_HOST) {
            clientRes.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            clientRes.end('허용되지 않은 호스트(IP)로의 접근입니다.');
            return;
        }
        let body = '';
        clientReq.on('data', chunk => { body += chunk; });
        clientReq.on('end', async () => {
            if (config.USE_TURNSTILE) {
                const params = new URLSearchParams(body);
                const cfToken = params.get('cf-turnstile-response');
                if (!cfToken) {
                    clientRes.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                    clientRes.end('Turnstile 인증이 필요합니다.');
                    return;
                }
                const verifyBody = `secret=${config.TURNSTILE_SECRET_KEY}&response=${cfToken}`;
                const verifyReq = https.request(config.TURNSTILE_VERIFY_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(verifyBody)
                    }
                }, (verifyRes) => {
                    let verifyData = '';
                    verifyRes.on('data', chunk => { verifyData += chunk; });
                    verifyRes.on('end', () => {
                        try {
                            const result = JSON.parse(verifyData);
                            if (result.success) {
                                const token = generateToken();
                                issuedTokens.add(token);
                                saveTokens();
                                clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                                clientRes.end(`
                                    <html><body>
                                    <h2>ChatboongProxy 토큰 발급 완료</h2>
                                    <input type="text" value="${token}" readonly style="width:350px;" onclick="this.select()" />
                                    <p>이 토큰을 Chatboongproxyauth 헤더에 사용하세요.</p>
                                    <a href="/">돌아가기</a>
                                    </body></html>
                                `);
                            } else {
                                clientRes.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                                clientRes.end('Turnstile 인증 실패.');
                            }
                        } catch (e) {
                            clientRes.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                            clientRes.end('Turnstile 응답 파싱 오류.');
                        }
                    });
                });
                verifyReq.on('error', () => {
                    clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                    clientRes.end('Turnstile 검증 서버 오류.');
                });
                verifyReq.write(verifyBody);
                verifyReq.end();
            } else {
                const token = generateToken();
                issuedTokens.add(token);
                saveTokens();
                clientRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                clientRes.end(`
                    <html><body>
                    <h2>ChatboongProxy 토큰 발급 완료</h2>
                    <input type="text" value="${token}" readonly style="width:350px;" onclick="this.select()" />
                    <p>이 토큰을 Chatboongproxyauth 헤더에 사용하세요.</p>
                    <a href="/">돌아가기</a>
                    </body></html>
                `);
            }
        });
        return;
    }
    if (!(clientReq.url === '/' && clientReq.method === 'GET') && !(clientReq.url === '/issue-token' && clientReq.method === 'POST')) {
        const authHeader = clientReq.headers['chatboongproxyauth'];
        if (!authHeader || !issuedTokens.has(authHeader)) {
            clientRes.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
            clientRes.end('Unauthorized: Chatboongproxyauth 헤더가 없거나 올바르지 않습니다. / 에서 토큰을 발급받으세요.');
            return;
        }
    }
    const targetUrl = new URL(clientReq.url, TARGET);
    const options = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: targetUrl.pathname + targetUrl.search,
        method: clientReq.method,
        headers: { ...clientReq.headers, host: targetUrl.hostname },
    };
    const proxyReq = https.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
    });
    proxyReq.on('error', (err) => {
        clientRes.writeHead(502);
        clientRes.end('Proxy error: ' + err.message);
    });
    clientReq.pipe(proxyReq, { end: true });
};

if(config.USE_NGINX) {
    http.createServer(requestHandler).listen(HTTP_PORT, () => {
        console.log(`Nginx reverse proxy is listening on internal port ${HTTP_PORT}`);
    }); 
} else {
    http.createServer(requestHandler).listen(HTTP_PORT, () => {
        console.log(`HTTP reverse proxy running on http://${config.ALLOWED_HOST}:${HTTP_PORT}/`);
    });
    https.createServer(sslOptions, requestHandler).listen(HTTPS_PORT, () => {
        console.log(`HTTPS reverse proxy running on https://${config.ALLOWED_HOST}:${HTTPS_PORT}/`);
    });
}
