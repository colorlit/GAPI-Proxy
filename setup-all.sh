

#!/bin/bash

# --- 서버 IP 국가 확인 (EU/영국 여부) ---
EU_COUNTRIES=(AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE)
UK_COUNTRY=GB

# 외부 서비스로 서버 퍼블릭 IP 및 국가코드 조회 (ipinfo.io)
SERVER_IP=$(curl -s https://ipinfo.io/ip)
SERVER_COUNTRY=$(curl -s https://ipinfo.io/country | tr -d '\n')

IS_EU=0
for code in "${EU_COUNTRIES[@]}"; do
    if [ "$SERVER_COUNTRY" = "$code" ]; then
        IS_EU=1
        break
    fi
done
if [ "$SERVER_COUNTRY" = "$UK_COUNTRY" ]; then
    IS_EU=2
fi


if [ $IS_EU -eq 1 ]; then
    echo "서버 위치: $SERVER_COUNTRY (EU 국가)."
elif [ $IS_EU -eq 2 ]; then
    echo "서버 위치: $SERVER_COUNTRY (영국)."
else
    echo "[차단] 서버 위치: $SERVER_COUNTRY (EU/영국 아님). 이 스크립트는 EU/영국 서버에서만 실행됩니다."
    exit 0
fi

UA_BROWSER="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

function WebTest_Gemini() {
    local tmpresult=$(curl -sL "https://gemini.google.com" --user-agent "${UA_BROWSER}")
    if [[ "$tmpresult" = "curl"* ]]; then
        echo -e "\r Google Gemini:\t\t\t\t\tFailed (Network Connection)"
        return 2
    fi
    result=$(echo "$tmpresult" | grep -q '45631641,null,true' && echo "Yes" || echo "")
    countrycode=$(echo "$tmpresult" | grep -o ',2,1,200,"[A-Z]\{3\}"' | sed 's/,2,1,200,"//;s/"//' || echo "")
    if [ -n "$result" ] && [ -n "$countrycode" ]; then
        echo -e "\r Google Gemini:\t\t\t\t\tYes (Region: $countrycode)"
        return 1
    elif [ -n "$result" ]; then
        echo -e "\r Google Gemini:\t\t\t\t\tYes"
        return 1
    else
        echo -e "\r Google Gemini:\t\t\t\t\tNo"
        return 0
    fi
}

# ---- Gemini 테스트 후 No일 때만 아래 설치 스크립트 실행 ----
WebTest_Gemini
gemini_status=$?
if [ $gemini_status -ne 0 ]; then
    echo "Google Gemini 로깅이 차단되어 있지 않으므로 설치를 중단합니다."
    exit 0
fi

# ==================================================================================
# Node.js, PM2 및 GAPI-Proxy 자동 설정 스크립트 (Ubuntu, AlmaLinux, Rocky, Oracle Linux 지원)
# ==================================================================================

set -e

echo "전체 자동 설정을 시작합니다..."
echo "========================================="

# --- 0. 패키지 매니저 감지 ---
if command -v apt-get &> /dev/null; then
    PKG_UPDATE="sudo apt-get update"
    PKG_INSTALL="sudo apt-get install -y"
elif command -v dnf &> /dev/null; then
    PKG_UPDATE="sudo dnf makecache"
    PKG_INSTALL="sudo dnf install -y"
elif command -v yum &> /dev/null; then
    PKG_UPDATE="sudo yum makecache"
    PKG_INSTALL="sudo yum install -y"
else
    echo "지원하지 않는 리눅스 배포판입니다. (apt, dnf, yum 중 하나가 필요합니다)"
    exit 1
fi

# --- 1. 필수 패키지 설치 (curl, git) ---
echo "[1/6] 필수 패키지(curl, git)를 확인하고 설치합니다..."
eval $PKG_UPDATE
if ! command -v curl &> /dev/null; then
    echo "'curl'이 설치되어 있지 않습니다. 지금 설치합니다..."
    eval $PKG_INSTALL curl
else
    echo "'curl'이 이미 설치되어 있습니다."
fi
if ! command -v git &> /dev/null; then
    echo "'git'이 설치되어 있지 않습니다. 지금 설치합니다..."
    eval $PKG_INSTALL git
else
    echo "'git'이 이미 설치되어 있습니다."
fi

# --- 2. Node.js 및 npm 설치 ---
echo "[2/6] Node.js 22.x를 설치합니다..."
if command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
    sudo -E bash nodesource_setup.sh
    rm nodesource_setup.sh
    eval $PKG_INSTALL nodejs
elif command -v dnf &> /dev/null || command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    eval $PKG_INSTALL nodejs
fi
echo "Node.js와 npm이 성공적으로 설치되었습니다."
node -v
npm -v

# --- 3. PM2 설치 ---
echo "[3/6] Node.js 프로세스 관리자인 PM2를 전역으로 설치합니다..."
sudo npm install pm2 -g
echo "PM2가 성공적으로 설치되었습니다."

# --- 4. GitHub 리포지토리 복제 ---
REPO_DIR="GAPI-Proxy"
if [ -d "$REPO_DIR" ]; then
    echo "[4/6] '$REPO_DIR' 디렉토리가 이미 존재합니다. 복제를 건너뜁니다."
else
    echo "[4/6] 'GAPI-Proxy' 리포지토리를 복제합니다..."
    git clone https://github.com/colorlit/GAPI-Proxy
fi

# --- 5. 리포지토리 디렉토리로 이동 ---
echo "[5/6] '$REPO_DIR' 디렉토리로 이동합니다..."
cd $REPO_DIR

# --- 6. 인증서 생성 스크립트 실행 ---
CERT_SCRIPT="generate-cert.sh"
if [ -f "$CERT_SCRIPT" ]; then
    echo "[6/6] '$CERT_SCRIPT' 스크립트를 실행합니다..."
    chmod +x $CERT_SCRIPT
    sudo ./$CERT_SCRIPT
else
    echo "[6/6] 오류: '$CERT_SCRIPT' 스크립트를 찾을 수 없습니다!"
    exit 1
fi

# --- config.js 사용자 입력 기반 수정 ---
CONFIG_FILE="config.js"
if [ -f "$CONFIG_FILE" ]; then
    echo "[설정] config.js 파일의 주요 값을 직접 입력해 주세요."
    echo -n "ALLOWED_HOST 값을 입력하세요 (예: example.com): "
    read USER_ALLOWED_HOST < /dev/tty
    echo -n "PAGE_PASSWORD 값을 입력하세요 (토큰 발급용 비밀번호): "
    read USER_PAGE_PASSWORD < /dev/tty

    echo -n "> Cloudflare Turnstile(캡차)을 사용하시겠습니까? (y/n): "
    read TURNSTILE_ANS < /dev/tty
    if [[ "$TURNSTILE_ANS" =~ ^[Yy]$ ]]; then
        USER_USE_TURNSTILE="true"
        echo -n "  >> TURNSTILE_SITE_KEY를 입력하세요: "
        read USER_SITE_KEY < /dev/tty
        echo -n "  >> TURNSTILE_SECRET_KEY를 입력하세요: "
        read USER_SECRET_KEY < /dev/tty
    else
        USER_USE_TURNSTILE="false"
        USER_SITE_KEY="PUT_YOUR_SITE_KEY_HERE"
        USER_SECRET_KEY="PUT_YOUR_SECRET_KEY_HERE"
    fi

    echo -n "> Nginx 리버스 프록시 모드(HTTP 3000 포트)를 사용하시겠습니까? (y/n): "
    read NGINX_ANS < /dev/tty
    if [[ "$NGINX_ANS" =~ ^[Yy]$ ]]; then
        USER_USE_NGINX="true"
    else
        USER_USE_NGINX="false"
    fi

    USER_ALLOWED_REFERER="https://$USER_ALLOWED_HOST"

    sed -i "s|ALLOWED_HOST: '.*'|ALLOWED_HOST: '$USER_ALLOWED_HOST'|g" $CONFIG_FILE
    sed -i "s|ALLOWED_REFERER: '.*'|ALLOWED_REFERER: '$USER_ALLOWED_REFERER'|g" $CONFIG_FILE
    sed -i "s|PAGE_PASSWORD: '.*'|PAGE_PASSWORD: '$USER_PAGE_PASSWORD'|g" $CONFIG_FILE
    sed -i "s|TURNSTILE_SITE_KEY: '.*'|TURNSTILE_SITE_KEY: '$USER_SITE_KEY'|g" $CONFIG_FILE
    sed -i "s|TURNSTILE_SECRET_KEY: '.*'|TURNSTILE_SECRET_KEY: '$USER_SECRET_KEY'|g" $CONFIG_FILE
    sed -i "s|USE_TURNSTILE: .*,|USE_TURNSTILE: $USER_USE_TURNSTILE,|g" $CONFIG_FILE
    sed -i "s|USE_NGINX: .*,|USE_NGINX: $USER_USE_NGINX,|g" $CONFIG_FILE
    echo "config.js 주요 값이 성공적으로 변경되었습니다."
else
    echo "[설정] config.js 파일을 찾을 수 없습니다. 수동으로 수정해 주세요."
fi

# --- 7. PM2로 프록시 서버 시작 ---
echo "[7/7] PM2로 프록시 서버를 시작합니다..."
if [ -f "proxy.js" ]; then
    pm2 start proxy.js
    echo "proxy.js가 PM2로 시작되었습니다."
else
    echo "proxy.js 파일을 찾을 수 없습니다."
fi

# --- 8. PM2 startup 설정 ---
echo "[8/8] PM2 startup 설정을 진행합니다..."
pm2 startup
pm2 save
echo "PM2 startup 설정이 완료되었습니다."

echo "========================================="
echo "모든 설정 과정이 성공적으로 완료되었습니다."
echo "Nginx 리버스 프록시 모드를 선택한 경우, Nginx 설정을 추가로 진행해야 합니다."
echo "/etc/nginx/sites-available/default 파일의 HTTP(S) 서버 블록에 proxy_pass http://localhost:3000/;에 대한 location을 추가해 주세요."
echo "현재 위치: $(pwd)"