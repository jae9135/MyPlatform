import * as _Config from '../common/Config.js';
import * as _MenuTree from "../common/MenuTree.js";
import * as _UI from "../util/UI.js";
import * as _Login from "../login/panel/Login.js";
import * as _AlrmBoxList from "../alrm/panel/AlrmBoxList.js";
import * as _LoginCommon from "../login/common/LoginCommon.js";

import * as _Common from '../common/Common.js';
import * as _CvaConfig from "../cva/config/CvaConfig.js";
import * as _ReaConfig from "../rea/config/ReaConfig.js";
import * as _NobConfig from "../nob/config/NobConfig.js";
import * as _UsgConfig from "../usg/config/UsgConfig.js";
import * as _MyiConfig from "../myi/config/MyiConfig.js";
import * as _StatsConfig from "../stats/config/StatsConfig.js";
import * as _OccConfig from "../occ/config/OccConfig.js";
import * as _Main from "../main/panel/Main.js";
import * as _Footer from "../main/panel/Footer.js";

let _containerEl;
let _contentEl;
let _menuTree;

let _sessionTimeoutShown = false;   // 만료 화면 중복 호출 방지

// 세션 팝업 open
let _sessionPopOpen = false; // 세션 팝업 유무
let _updateSessionPopTime = null;
function openSessionPop(time){
    const popEl = document.querySelector("#session-time-out-pop");
    if (!popEl) return;
    _sessionPopOpen = true;

    _UI.load(popEl, "common/SessionTimeOutPop.html").then(() => {
        popEl.style.display = "block";

        const sessionContentEl= document.querySelector("#session-pop-content");
        if(time === 10){
            sessionContentEl.innerHTML =
                `10분 동안 서비스를 이용하지 않아<br>
                잠시 후 자동으로 로그아웃될 예정입니다.<br>
                로그인 시간을 연장하시겠습니까?`;
        } else {
            sessionContentEl.innerHTML =
                `20분 동안 서비스를 이용하지 않아<br>
                잠시 후 자동으로 로그아웃될 예정입니다.<br>
                로그인 시간을 연장하시겠습니까?`;
        }

        const remainTimeEl = document.querySelector("#session-pop-remain-time");
        remainTimeEl.textContent = SessionTimer.formatMMSS(SessionTimer.getRemainSeconds());
        _updateSessionPopTime = (sec) => {
            remainTimeEl.textContent = SessionTimer.formatMMSS(sec);
        };
        _updateSessionPopTime(SessionTimer.getRemainSeconds());

        // 팝업 닫기
        const sessionCloseEl = document.querySelector("#session-pop-close");
        sessionCloseEl.addEventListener('click',function(){
            popEl.style.display="none";
            _sessionPopOpen = false;
            _updateSessionPopTime = null;
        });

        // 로그인 연장
        const sessionRemainEl = document.querySelector("#session-pop-remain");
        sessionRemainEl.addEventListener('click',function(){
            popEl.style.display="none";
            SessionTimer.extend();
        });

        // 로그아웃
        const sessionLogoutEl= document.querySelector("#session-pop-logout");
        sessionLogoutEl.addEventListener('click',function(){
            popEl.style.display="none";
            doLogout();
        });

    });
}

// ================================
// Session Timer Singleton
// - 1초 카운트다운은 로컬로
// - 실제 세션 연장/활동은 주기 sync로 반영
// - remain-time API는 "세션을 갱신하지 않는 방식"이어야 함(Redis TTL 조회 등)
// ================================
const SessionTimer = (() => {
    let remainSeconds = 0;
    let tickTimer = null;
    let lastTickAt = Date.now(); // 마지막으로 tick이 실행된 절대 시간

    const getTimeEl = () => document.querySelector("#user_info #sessionTime .time");

    const formatMMSS = (sec) => {
        const m = Math.max(0, Math.floor(sec / 60));
        const s = Math.max(0, sec % 60);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const render = () => {
        const now = Date.now();
        const diff = Math.floor((now - lastTickAt) / 1000);

        // 1초 이상 차이가 나면 (PC 절전 모드 등) 경과한 만큼 시간을 뺌
        if (diff > 1) {
            remainSeconds -= diff;
        } else {
            remainSeconds--;
        }

        lastTickAt = now;

        const timeEl = getTimeEl();
        if (timeEl) timeEl.textContent = formatMMSS(remainSeconds);

        if (_sessionPopOpen && typeof _updateSessionPopTime === "function") {
            _updateSessionPopTime(remainSeconds);
        }

        // 팝업 조건 (이미 팝업이 떠있지 않을 때만)
        if (!_sessionPopOpen && !_sessionTimeoutShown) {
            if (remainSeconds <= 600 && remainSeconds > 590) { // 10분 남음 (오차범위 고려)
                openSessionPop(20);
            } else if (remainSeconds <= 1200 && remainSeconds > 1190) { // 20분 남음
                openSessionPop(10);
            }
        }

        // 만료 처리
        if (remainSeconds <= 0) {
            stop();
            onSessionExpired();
        }
    };

    const syncFromServer = async () => {
        if (_sessionTimeoutShown || !_Config?.USER?.USER_ID) return;

        try {
            const res = await o2.util.Http.requestData("/session/remaining-time", {}, { parameterType: "json" });
            const serverRemain = res?.RESULT?.remainingTime ?? res?.data?.remainingTime ?? res?.remainingTime ?? 0;

            remainSeconds = serverRemain;
            lastTickAt = Date.now(); // 동기화 시점 초기화

            if (remainSeconds <= 0) {
                stop();
                onSessionExpired();
            } else {
                render();
            }
        } catch (e) {
            // 401 에러나 세션 만료 에러가 오면 즉시 만료 처리
            stop();
            onSessionExpired();
        }
    };

    const start = () => {
        if (tickTimer) return;
        lastTickAt = Date.now();
        syncFromServer();
        tickTimer = setInterval(render, 1000);

        // [추가] 브라우저 포커스를 얻었을 때(잠금 해제 등) 즉시 서버 확인
        window.removeEventListener("focus", syncFromServer);
        window.addEventListener("focus", syncFromServer);
    };

    const stop = () => {
        clearInterval(tickTimer);
        tickTimer = null;
        window.removeEventListener("focus", syncFromServer);
    };

    const extend = async () => {
        if (_sessionTimeoutShown) return;

        try {
            await o2.util.Http.requestData("/session/extend", {}, { parameterType: "json" });
        } catch (e) {}
        await syncFromServer();
    };

    // UI.load(페이지 전환) 같은 이벤트에서 호출용
    const onActivity = () => {
        if(_sessionPopOpen) return ; // 세션 팝업 안내는 예외

        // “페이지가 바뀌었음 = 뭔가 요청했을 가능성” → 한번 맞춰줌
        syncFromServer();
    };

    const getRemainSeconds = () => remainSeconds;

    return { start, stop, extend, onActivity, getRemainSeconds: () => remainSeconds, formatMMSS };
})();

// 공통(UI.load)에서 호출할 수 있도록 전역에 노출
window.SessionTimer = SessionTimer;

export async function init() {
    // 중복로그인 처리를 위한 인터셉터
    initLibraryInterceptor();

    // 상단 메뉴이벤트
    initTopEvent();

    // 메인 컨텐츠
    initMainContent();
}

// 기능에 따라 메인 컨텐츠 화면 pageName값에따라 분기처리
export const initMainContent = function (pageName) {

    if (!_containerEl) {
        const container = document.querySelector('#container');
        if (!container) {
            return;
        }
        container.insertAdjacentHTML(
            'afterbegin',
            '<div class="content-inner in-between"><div class="content-wrap"><div class="section-wrap"></div></div></div>'
        );
        _containerEl =
            container.querySelector('.content-inner.in-between') ||
            container.querySelector('.content-inner');
    }

    if (sessionStorage.getItem("LOGOUT_SUCCESS") === "Y") {
        sessionStorage.removeItem("LOGOUT_SUCCESS");
        _UI.openAlert({
            title: '로그아웃',
            text: '로그아웃 되었습니다.'
        });
    }

    // 내메뉴, 로그인/로그아웃 영역
    initMyMenu();
    _Main.init();
    _Footer.init();
    initParam();
    _menuTree = _MenuTree.initGNB();
    drawContent();
}


const initMyMenu = function () {
    let welcomeEl = document.querySelector('#user_info');
    let loginOutEl = null;

    // 로그인 상태
    if (_Config.USER.USER_ID != null) {
        loginOutEl = `
            <div class="user-box-wrap">
                <span class="user-box">
                    <button type="button" class="btn-alert" id="btn-alrm">
                        <span class="blind">알림</span>
                        <strong class="num">0</strong>
                    </button>
            
                    <div class="alert-box" id="alrm-box" style="display:none;">
                        <div class="top-sec">
                            <button type="button" class="krds-btn xsmall tertiary" id="alrm-read-all">전체읽음</button>
                        </div>
                        <div class="body-sec">
                            <ul id="alrm-list">
                                <!-- 여기 li들은 JS로 채움 -->
                            </ul>
                        </div>
                    </div>
                </span>
            </div>
            <!-- 사용자 정보 -->
            <div class="krds-drop-wrap my-drop">
                <button type="button" class="btn-user" id="login-user" title="사용자 정보">${_Config.USER.USER_NM}님</button>
                <span class="sr-only">닫기</span>
                <span class="sr-only">열기</span></button>
                <div class="drop-menu" id="sessionTime" style="display: block;">
                    <div class="drop-in">
                        <div class="drop-top-info">
                            <p class="my-name">${_Config.USER.USER_NM}님</p>
                            <dl class="my-time">
                                <dt>로그아웃까지 남은 시간</dt>
                                <dd>
                                    <span class="time">25:42</span>
                                    <button type="button" class="btn btn-sessionExtend">로그인 연장</button>
                                </dd>
                            </dl>
                        </div>
                        <div class="drop-btm-btn">
                            <button type="button" class="btn-logout" title="로그아웃 ">로그아웃</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- //사용자 정보 -->
            <button type="button" class="btn-logout" title="로그아웃" id="logout">로그아웃</button>
        `;

        o2.util.Dom.emptyEl(welcomeEl);
        o2.util.Dom.appendEl(loginOutEl, welcomeEl);

        const loginUserBtnEl = welcomeEl.querySelector("#login-user");
        const sessionMenuEl  = welcomeEl.querySelector("#sessionTime");
        const extendBtnEl    = welcomeEl.querySelector(".btn-sessionExtend");

        // 초기엔 닫아둠(원하는대로)
        sessionMenuEl.style.display = "none";

        const toggleSessionMenu = () => {
            const isVisible = window.getComputedStyle(sessionMenuEl).display !== "none";
            if (isVisible) {
                sessionMenuEl.style.display = "none";
            } else {
                const boxEl = document.getElementById("alrm-box");
                if (boxEl) boxEl.style.display = "none";
                sessionMenuEl.style.display = "block";
            }
        };

        if (loginUserBtnEl && !loginUserBtnEl._sessionBound) {
            loginUserBtnEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSessionMenu();
            });
            loginUserBtnEl._sessionBound = true;
        }

        if (extendBtnEl && !extendBtnEl._extendBound) {
            extendBtnEl.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await SessionTimer.extend();
            });
            extendBtnEl._extendBound = true;
        }

        // 외부 클릭 시 닫기(UI만)
        if (!window.__SESSION_MENU_OUTSIDE_BOUND__) {
            window.addEventListener("click", (e) => {
                const menuEl = document.querySelector("#user_info #sessionTime");
                const wrapEl = document.querySelector("#user_info");
                if (!menuEl || !wrapEl) return;

                if (window.getComputedStyle(menuEl).display === "none") return;
                if (!wrapEl.contains(e.target)) {
                    menuEl.style.display = "none";
                }
            });
            window.__SESSION_MENU_OUTSIDE_BOUND__ = true;
        }

        // 로그아웃 버튼들 (기존 그대로 두되 stop 추가)
        welcomeEl.querySelectorAll(".btn-logout").forEach(function (btnEl) {
            if (btnEl._logoutBound) return;
            btnEl._logoutBound = true;

            btnEl.addEventListener("click", async function () {
                await o2.util.Http.requestData("/login/logout", {}, { parameterType: "json" });

                // 타이머 중지
                SessionTimer.stop();

                o2.common.Config.USER = {};
                _Config.USER.USER_ID = null;
                _Config.USER.USER_NM = null;
                _Config.USER.USER_TYPE = null;
                _Config.USER.USER_AUTHRT = null;

                sessionStorage.setItem("LOGOUT_SUCCESS", "Y");
                location.reload(); // RSA
            });
        });

        _AlrmBoxList.initAlrmBox();

        // ✅ 타이머 시작(로그인 상태에서만)
        SessionTimer.start();
    } else { // 로그인 전
        loginOutEl = `<button type="button" class="btn-login" title="로그인 열기" id="login">로그인</button>`;
        o2.util.Dom.emptyEl(welcomeEl);
        o2.util.Dom.appendEl(loginOutEl, welcomeEl);

        welcomeEl.querySelector("#login").addEventListener('click', function () {

            _Login.init();
        });
    }
}

function onSessionExpired(stopTimersFn) {
    if (_sessionTimeoutShown) return;
    _sessionTimeoutShown = true;

    try {
        // 타이머 중지
        if (typeof stopTimersFn === "function") stopTimersFn();
    } catch (e) {}

    // 드롭다운/알림 UI 닫기(선택)
    try {
        const sessionMenuEl = document.querySelector("#user_info #sessionTime");
        if (sessionMenuEl) sessionMenuEl.style.display = "none";
        const alrmBoxEl = document.querySelector(".user_info #alrm-box");
        if (alrmBoxEl) alrmBoxEl.style.display = "none";
    } catch (e) {

    }

    //세션 만료시 로그인정보창 제거
    let logInOutEl = document.querySelector(".user-box-wrap");
    const loginDropEl = document.querySelector(".my-drop");
    const welcomeEl = document.querySelector('#user_info');

    if(logInOutEl != null){
        o2.util.Dom.removeEl(logInOutEl);
        o2.util.Dom.removeEl(loginDropEl);

        logInOutEl = `<button type="button" class="btn-login" title="로그인 열기" id="login">로그인</button>`;
        o2.util.Dom.emptyEl(welcomeEl);
        o2.util.Dom.appendEl(logInOutEl, welcomeEl);

        welcomeEl.querySelector("#login").addEventListener('click', function () {

            _Login.init();
        });
    }

    // 만료 화면 표시
    drawSessionTimeOut();
};

//로그인 세션 만료
const drawSessionTimeOut = function () {

    const containerEl = document.querySelector("#container");
    if (!containerEl) {
        return;
    }

    // ✅ 1) #container 내부를 싹 비움 (기존 화면 완전 제거)
    o2.util.Dom.emptyEl(containerEl);

    // ✅ 2) 만료 화면 전용 레이아웃만 다시 구성
    containerEl.insertAdjacentHTML(
        "afterbegin",
        '<div class="content-inner in-between">' +
        '<div class="content-wrap">' +
        '<div class="section-wrap" id="session-timeout-wrap"></div>' +
        '</div>' +
        '</div>'
    );

    const sectionWrapEl = containerEl.querySelector("#session-timeout-wrap");
    if (!sectionWrapEl) {
        return;
    }

    // ✅ 3) SessionTimeOut.html만 로드
    _UI.load(sectionWrapEl, "common/SessionTimeOut.html", false).then(async () => {
        const btn = sectionWrapEl.querySelector("#sessionTimeOutLogin");
        if (!btn) {
            return;
        }

        if (btn._bound) return;
        btn._bound = true;

        btn.addEventListener("click", function () {
            // 만료 화면 플래그 해제(다시 정상 화면 가능)
            _sessionTimeoutShown = false;

            // 로그인 화면으로 전환
            initMainContent("login");
        });

        const requestURL = "/login/logout";
        const requestParam = {};

        await o2.util.Http.requestData(requestURL, requestParam, {parameterType: "json"});

        o2.common.Config.USER = {};

        _Config.USER.USER_ID = null;
        _Config.USER.USER_NM = null;
        _Config.USER.USER_TYPE = null;
        _Config.USER.USER_AUTHRT = null;
        sessionStorage.setItem("LOGOUT_SUCCESS", "Y");

        _containerEl = null;
        _contentEl = null;
        _menuTree = null;
        SessionTimer.stop();
    });
};


const drawContent = function () {
    if (_sessionTimeoutShown) return; // 만료 화면이면 컨텐츠 로딩 금지

    _UI.load(_containerEl, "common/Content.html", false).then(async function (contentEl) {
        _contentEl = contentEl;

    });
}

export const drawMainContent = function (ulId, liClass) {
    const leftMenuList = _MenuTree.leftMenuSet(_menuTree, ulId);
    const disabledSet = _MenuTree.disabledSet(_menuTree, ulId);
    switch (ulId) {
        case 'cva': // 민원신청
            _Common.drawLeftEl(_CvaConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'rea': // 주민수용성
            _Common.drawLeftEl(_ReaConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'nob': // 알림마당
            _Common.drawLeftEl(_NobConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'usg': // 이용안내
            _Common.drawLeftEl(_UsgConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'myi': // 내정보관리
            _Common.drawLeftEl(_MyiConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'stats': // 통계분석
            _Common.drawLeftEl(_StatsConfig, liClass, leftMenuList, disabledSet);
            break;
        case 'occ': // 운영센터
            _Common.drawLeftEl(_OccConfig, liClass, leftMenuList, disabledSet);
            break;
        default :
            return;
    }
};

const initTopEvent = function () {

    const gnb = document.querySelector(".gnb-list");

    gnb.addEventListener("click", e => {
        const link = e.target.closest(".gnb-main-trigger");
        if (!link) return; // 메뉴 링크가 아니면 무시

        e.preventDefault();
        const parent = link.parentElement;

        // 다른 메뉴 닫기
        gnb.querySelectorAll(".gnb-dropdown.active").forEach(item => {
            if (item !== parent) item.classList.remove("active");
        });

        // 현재 메뉴 토글
        parent.classList.toggle("active");
    });

    // GNB 외부 클릭 시 닫기
    window.addEventListener("click", e => {
        if (!gnb.contains(e.target)) {
            gnb.querySelectorAll(".gnb-dropdown.active").forEach(item => {
                item.classList.remove("active");
            });
        }
    });

    // 상단 하위메뉴 선택 > gnb를 동적으로 그리면 클릭오류 발생 > 이벤트 위임으로 처리
    const gnbListEl = document.querySelector('.gnb-list');
    if (gnbListEl) {
        gnbListEl.addEventListener('click', (e) => {
            const linkEl = e.target.closest('.gnb-sub li a');
            if (!linkEl || !gnbListEl.contains(linkEl)) return;

            e.preventDefault();

            const submenuListEl = linkEl.closest('ul');
            const groupUlId = submenuListEl ? submenuListEl.id : null;
            const routeClass = linkEl.className;

            if (!groupUlId || !routeClass) return;
            // 비로그인 시 권한 차단
            if (!requireLogin(groupUlId, e)) return;
            // 로그인 시 권한 차단 (ATH001)
            if (_MenuTree.isDisabled(_menuTree, groupUlId, routeClass)) {
                e.preventDefault();
                e.stopPropagation();
                _UI.openAlert({
                    title: '접근 불가',
                    text: '접근 권한이 없습니다.'
                });
                return;
            }

            drawMainContent(groupUlId, routeClass);

            const dropdownEl = linkEl.closest('.gnb-dropdown');

            if (dropdownEl) dropdownEl.classList.remove('active');
        });
    }

    // 상단 로고 버튼 클릭 시 메인화면 전환
    document.querySelector("#main-logo-tag").addEventListener("click", e => {
        initMainContent();
    });

}

const BLOCKED_GUEST = new Set(['cva', 'rea', 'myi']);

const requireLogin = (ulId, e) => {
    const isGuest = !_Config.USER?.USER_ID;
    if (isGuest && BLOCKED_GUEST.has(ulId)) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        _UI.openAlert({
            title: '로그인 필요',
            text: '로그인 후 이용가능합니다.'
        });
        _Login.init();
        return false;
    }
    return true;
}

// 클릭 이벤트를 거치지 않고 바로 해당페이지 open
export function openGnbMenu(groupUlId, routeClass) {
    const gnbListEl = document.querySelector('.gnb-list');
    if (!groupUlId || !routeClass) return;

    if (!requireLogin(groupUlId)) return;

    // 로그인 시 권한 차단 (ATH001)
    if (_MenuTree.isDisabled(_menuTree, groupUlId, routeClass)) {
        _UI.openAlert({
            title: '접근 불가',
            text: '접근 권한이 없습니다.'
        });
        return;
    }

    // 페이지 이동 실행
    drawMainContent(groupUlId, routeClass);

    // 드롭다운 닫기 (선택적으로)
    const activeDropdown = gnbListEl?.querySelector('.gnb-dropdown.active');
    if (activeDropdown) activeDropdown.classList.remove('active');
}


//Detail 로 바로 이동가능
export function openDetail(groupUlId, routeClass, move) {
    const gnbListEl = document.querySelector('.gnb-list');
    if (!groupUlId || !routeClass) return;

    if (!requireLogin(groupUlId)) return;

    // 로그인 시 권한 차단 (ATH001)
    if (_MenuTree.isDisabled(_menuTree, groupUlId, routeClass)) {
        _UI.openAlert({
            title: '접근 불가',
            text: '접근 권한이 없습니다.'
        });
        return;
    }

    // 페이지 이동 실행
    if (typeof move === 'function') {
        const leftMenuList = _MenuTree.leftMenuSet(_menuTree, groupUlId);
        const disabledSet = _MenuTree.disabledSet(_menuTree, groupUlId);

        switch (groupUlId) {
            case 'cva': // 민원신청
                _Common.drawLeftElDetail(_CvaConfig, routeClass, leftMenuList, disabledSet, move);
                break;
            case 'nob': // 알림마당
                _Common.drawLeftElDetail(_NobConfig, routeClass, leftMenuList, disabledSet, move);
                break;
            case 'usg': // 이용안내
                _Common.drawLeftElDetail(_UsgConfig, routeClass, leftMenuList, disabledSet, move);
                break;
            default :
                return;
        }
    }
    // 드롭다운 닫기
    const activeDropdown = gnbListEl?.querySelector('.gnb-dropdown.active');
    if (activeDropdown) activeDropdown.classList.remove('active');
}

const initParam = function () {
    window.$.cva = {};
}

// 중복로그인 처리를 위한 o2라이브러리 인터셉터
const initLibraryInterceptor = function() {
    if (!window.o2?.util?.Http) return;

    const originalRequestData = o2.util.Http.requestData;

    o2.util.Http.requestData = async function(...args) {
        try {
            return await originalRequestData.apply(this, args);
        } catch (error) {
            // 1. 에러 본문 파싱 (문자열 -> 객체)
            let errObj = {};

            // 파싱
            if (typeof error === "string") {
                try {
                    errObj = JSON.parse(error);
                } catch (e) {
                    // 파싱 실패하면 일반 에러로 간주
                    throw error;
                }
            } else {
                errObj = error;
            }

            // 2. RESULT 코드로 중복로그인 판단(DUPLICATE_LOGIN 확인)
            if (errObj && errObj.RESULT === "DUPLICATE_LOGIN") {

                // 세션 변수 초기화
                if (_Config && _Config.USER) {
                    _Config.USER.USER_ID = null;
                    _Config.USER.USER_NM = null;
                }

                // 알림창 닫힌 뒤 로그아웃 URL로 이동 (+ 백엔드 메시지 그대로 사용)
                _LoginCommon.openAlert({
                    title: '로그아웃',
                    text: errObj.MESSAGE
                }).then(() => {
                    // 로그아웃 페이지 이동
                    window.location.href = '/' + (_Config.HOST.APP_CONTEXT_PATH || 'ipms.online') + '/login/logout';
                });

                return;
            }else if(errObj && errObj.RESULT === null){
                onSessionExpired(() => stop()); // 아래 onSessionExpired 사용
            }

            // 3. 그 외 에러(500, 일반 오류 등)는 기존 로직대로 던짐
            throw error;
        }
    };
};

async function doLogout() {
    await o2.util.Http.requestData("/login/logout", {}, { parameterType: "json" });

    // 타이머 중지
    SessionTimer.stop();

    o2.common.Config.USER = {};
    _Config.USER.USER_ID = null;
    _Config.USER.USER_NM = null;
    _Config.USER.USER_TYPE = null;
    _Config.USER.USER_AUTHRT = null;

    sessionStorage.setItem("LOGOUT_SUCCESS", "Y");
    location.reload(); // RSA
}