import * as _UI from '../../util/UI.js';

import * as _O2Main from '../../common/O2Main.js';
import * as _Config from "../../common/Config.js";
import * as _LoginApi from "../api/LoginApi.js";
import * as _LoginCommon from "../common/LoginCommon.js";
import * as _SignUpStep1 from "../../signup/panel/SignUpStep1.js";
import * as _AgmApi from "../../myi/api/AgmApi.js";
import * as _LoginHtmlGenerator from '../common/LoginHtmlGenerator.js';
import {openCertPopup} from "../common/LoginCommon.js";

let _breadCrumbHomeEl, _userIdEl, _userPwEl, _idSaveCheckEl;
let loginBtn, findIdBtn, findPwBtn, joinBtn, pswdShowBtn, certJuminBtn, certCorpBtn;
let nameInput, emailInput, idInput;
let pswdIcon;
let _sysCntHstryId, _userCertHstryId;
let _certUserId = null;
let RSA = new RSAKey();

export const init = function () {
    const _containerEl = document.querySelector("#container");

    _UI.load(_containerEl, "login/Login.html", false).then(async function (loginEl) {
        initEl(loginEl);

        _userIdEl.focus();
        const cookieId = getCookie('key');
        if (o2.util.Common.isNotEmpty(cookieId)) {
            _userIdEl.value = cookieId;
            _idSaveCheckEl.checked = true;
            _userPwEl.focus();
        }

        initEvent();
        await getRsaKey();
    });
}

// RSA 키 발급
const getRsaKey = async () => {
    try {
        const response = await _LoginApi.getRsaKey();

        if (!response.SUCCESS) {
            loginBtn.disabled = true;
            _UI.openAlert({
                title: '로그인',
                text: "로그인 준비 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요."
            });
            return;
        }
        const publicKeyModulus = response.RESULT.PUBLIC_KEY_MODULUS
        const publicKeyExponent = response.RESULT.PUBLIC_KEY_EXPONENT
        RSA.setPublic(publicKeyModulus, publicKeyExponent);
    } catch (error) {
        _UI.openAlert({
            title: '로그인',
            text: "로그인 준비 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요."
        });
    }
}

const initEl = function (loginEl) {
    _breadCrumbHomeEl = loginEl.querySelector('#breadcrumb-home');
    _userIdEl = loginEl.querySelector('#userId');
    _userPwEl = loginEl.querySelector('#pswd');
    _idSaveCheckEl = loginEl.querySelector('#saveId');

    loginBtn = loginEl.querySelector('#userLoginButton');
    findIdBtn = loginEl.querySelector('#findId');
    findPwBtn = loginEl.querySelector('#findPw');
    joinBtn = loginEl.querySelector('#join');
    pswdShowBtn = loginEl.querySelector('#pswd-show-btn');
    pswdIcon = pswdShowBtn.querySelector('i');  // 비밀번호 input 버튼 안 아이콘

    // 공동인증서 로그인
    certJuminBtn = loginEl.querySelector('#cert-jumin-btn');    // 공동인증서(개인,대리인)
    certCorpBtn = loginEl.querySelector('#cert-corp-btn');      // 공동인증서(법인)

    // simpLoginBtn = loginEl.querySelector('#simpLogin');
}

// event
export const initEvent = function () {
    // 브레드크럼 - 홈
    _breadCrumbHomeEl.addEventListener('click', function () {
        _O2Main.initMainContent();
    })
    // 아이디 input
    _userIdEl.addEventListener('keydown', async (e) => {
        if (_idSaveCheckEl.checked) {
            setCookie('key', _userIdEl.value, 7);
        }
        if (e.keyCode === 13) await accountLoginProcess();
    });
    // 비밀번호 input
    _userPwEl.addEventListener('keydown', async (e) => {
        if (e.keyCode === 13) await accountLoginProcess();
    });
    // 비밀번호 토글
    pswdShowBtn.addEventListener('click', function () {
        if (_userPwEl.type === 'password') {
            _userPwEl.type = 'text';
            pswdIcon.classList.remove('ico-pw-visible');
            pswdIcon.classList.add('ico-pw-visible-on');
        } else {
            _userPwEl.type = 'password';
            pswdIcon.classList.remove('ico-pw-visible-on');
            pswdIcon.classList.add('ico-pw-visible');
        }
    })
    // 아이디저장 체크박스
    _idSaveCheckEl.addEventListener('change', (e) => {
        if (e.currentTarget.checked) {
            setCookie('key', _userIdEl.value, 7);
        } else {
            deleteCookie('key');
        }
    });
    // 로그인
    loginBtn.addEventListener('click', async () => {
        await accountLoginProcess();
    });
    // 아이디찾기
    findIdBtn.addEventListener('click', async () => {
        _UI.openDialog(findIdModal());
    });
    // 비밀번호찾기
    findPwBtn.addEventListener('click', async () => {
        _UI.openDialog(findPwModal());
    });
    // 회원가입
    joinBtn.addEventListener('click', async () => {
        _SignUpStep1.open();
    });
    // 공동인증서로그인 - 주민등록번호
    certJuminBtn.addEventListener('click', async () => {
        openCertPopup(2, true);
    })
    // 공동인증서로그인 - 사업자번호
    certCorpBtn.addEventListener('click', async () => {
        openCertPopup(1, true);
    })

    // 간편인증 로그인
    /*simpLoginBtn.addEventListener('click', function () {
        // 기존 소스
        //_SimpleCertified.callSa('login');
        // IMP 사용 소스
        IMP.init("imp82637364");
        doCert("LOGIN", loginCert)
    });*/
}

/*-----------------------------
  로그인
-----------------------------*/
// 아이디, 비밀번호 로그인
const accountLoginProcess = async function (){
    try {
        // 일반 로그인: 입력값 검증 후 아이디 / 비밀번호 사용
        if (!_LoginCommon.isValidLogin(_userIdEl, _userPwEl)) return;

        const res = await loginRequest();

        // HTTP 오류 처리
        if (handleLoginHttpError(res)) return;
        const response = await res.json();

        if (!response.SUCCESS) {
            _UI.openAlert({
                title: '로그인 실패',
                text: response.MESSAGE || '로그인에 실패했습니다.'
            });
            return;
        }
        _sysCntHstryId = response.RESULT.SYS_CNT_HSTRY_ID; // 접속이력 아이디값

        // 로그인 성공 후 모달 띄우기 - 공동인증서(주민번호/사업자번호)
        _UI.openDialog({
            title: '인증서 선택',
            modal: true,
            dialogClass: 'pop-box open-confirm',
            minHeight: 0,
            width: 500,
            resizable: false,
            buttons: [
                {
                    text: `공인인증서(주민등록번호)`,
                    class: 'btn point krds-btn primary',
                    click: function () {
                        openCertPopup(2, false);
                        $(this).dialog("destroy").remove();
                    }
                },
                {
                    text: '공인인증서 (사업자번호)',
                    class: 'btn krds-btn tertiary',
                    click: function () {
                        openCertPopup(1, false);
                        $(this).dialog("destroy").remove();
                    }
                }
            ],
            contentEl: (function () {
                const el = o2.util.Dom.makeEl(`
                    <div class="ui-dialog-content ui-widget-content">
                        <div class="contents-wrap">
                            <p class="p-confirm" style="text-align:center;">
                                인증 방식을 선택하세요.
                            </p>
                        </div>
                    </div>
                `);
                return el;
            })(),
            close: function () {
                _UI.openAlert({
                    title: '공인인증서 로그인 실패',
                    text: '추가 인증이 완료되지 않아 로그인이 취소됩니다'
                });
                $(this).dialog("destroy").remove();
            }
        });
    } catch (err) {
        _UI.openAlert({
            title: '공인인증서 로그인 실패',
            text: '공인인증서 로그인이 실패했습니다'
        });
    }
}

// 로그인 요청 (일반)
async function loginRequest() {
    const requestBody = new URLSearchParams();
    requestBody.append("USER_ID", _userIdEl.value);
    requestBody.append("PSWD", RSA.encrypt(_userPwEl.value));

    const res = await fetch(CONTEXTPATH + "/login/loginProcess", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: requestBody.toString()
    });
    return res;

}

// 공동인증서 로그인 처리
export const loginProcessCert = async (param) => {
    try {
        // 인증서 로그인 자체 실패
        if (!param?.SUCCESS) {
            _UI.openAlert({
                title: '공인인증서 로그인 실패',
                text: param?.MSG || '공인인증서 로그인에 실패했습니다.'
            });
            return;
        }

        // 인증 결과에서 USER_ID 추출
        _userCertHstryId = param?.USER_CERT_HSTRY_ID;
        const isCertOnlyVal = param?.IS_CERT_ONLY;
        const userId = isCertOnlyVal
            ? param?.RESULT
            : _userIdEl.value;

        if (!userId) {
            console.warn('공인인증서에서 전달받은 유저아이디 값 없음', param);
            return;
        }

        const parameter = {
            IS_CERT_ONLY : isCertOnlyVal,
            SYS_CNT_HSTRY_ID: _sysCntHstryId ?? "",
            USER_CERT_HSTRY_ID: _userCertHstryId ?? ""
        }
        const response = await _LoginApi.postLoginFinal(parameter);

        if (!response.SUCCESS) {
            _UI.openAlert({
                title: '로그인 실패',
                text: response.MESSAGE || '로그인에 실패했습니다.'
            });
            return;
        }

        // 로그인 성공 후 공통 처리
        await handleLoginSuccess(response.RESULT);
    } catch (err) {
        _UI.openAlert({
            title: '로그인 실패',
            text: '로그인에 실패했습니다.'
        });
    }
}

// 로그인 성공 후 전역 설정
async function handleLoginSuccess(result) {
    // 사용자 정보 전역 설정
    o2.common.Config.USER = { USER_ID: result.USER_ID };
    _Config.USER.USER_ID = result.USER_ID;
    _Config.USER.USER_NM = result.USER_NM;
    _Config.USER.USER_TYPE = result.USER_TYPE;
    _Config.USER.USER_AUTHRT = result.USER_AUTHRT;

    _UI.openAlert({
        title: '로그인',
        text: '로그인이 완료되었습니다.'
    });

    // 메인 이동
    _O2Main.initMainContent();
    // 로그인 성공 후 모달 - 대리인 승인 안내, 비밀번호 변경 안내
    await handlePostLogin(result);
}

// HTTP 오류 처리
function handleLoginHttpError(res) {
    if (res.ok) return false;

    if (res.status === 401) {
        _UI.openAlert({
            title: '로그인 실패',
            text: `로그인에 실패하였습니다.<br/> 아이디와 비밀번호를 확인해주세요.`
        });
    } else if (res.status === 500) {
        _UI.openAlert({
            title: '서버 오류',
            text: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    } else {
        _UI.openAlert({
            title: '요청 실패',
            text: `요청을 처리할 수 없습니다. (${res.status})`
        });
    }

    return true; // 오류 X
}

// 로그인 성공 후 모달 - 대리인 승인 안내, 비밀번호 변경 안내
async function handlePostLogin(result) {
    // 비밀번호 변경 체크
    const pwRes = await _LoginApi.isPwChangeDt(CONTEXTPATH , result.USER_ID, {});
    if (pwRes.SUCCESS && pwRes.RESULT.POPUP_YN === 'Y') {
        await changePwConfirm(result.USER_ID);
    }

    // 대리인 후처리
    if (result.USER_TYPE === 'UT003') {
        const agmRes = await _LoginApi.getAgmAprvList();
        if (agmRes.SUCCESS && agmRes.RESULT?.length > 0) {
            await openAgentModalsSequentially(agmRes.RESULT);
        }
    }
}

/*-----------------------------
  아이디찾기 & 비밀번호 찾기
-----------------------------*/
// 아이디 찾기 모달
const findIdModal = function () {
    return {
        title: '아이디 찾기',
        html: 'login/LoginFindId.html',
        modal: true,
        width: 430,
        height: 'auto',
        resizable: false,
        buttons: [
            {
                "text": '아이디 찾기',
                "class": "krds-btn medium tertiary",
                "type": "button",
                id: 'btnFindId',
                click: async function (e) {
                    e.preventDefault(); // 기본 submit 막기
                    await findIdSubmitEvt(this);
                }
            }
        ],
        open: function () {
            document.body.style.overflow = 'hidden';
            const dialogEl = this;

            nameInput = dialogEl.querySelector('#userNm');
            emailInput = dialogEl.querySelector('#userEml');

            const textInputs = [nameInput];

            let isComposing = false;

            // 한글 + 영어 + 공백만 허용 (숫자, 특수문자 불가)
            textInputs.forEach(el => {
                if (!el) return;

                el.addEventListener("compositionstart", () => {
                    isComposing = true;
                });

                el.addEventListener("compositionend", (e) => {
                    isComposing = false;
                    e.target.value = e.target.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]/g, "");
                });

                el.addEventListener("input", (e) => {
                    if (!isComposing) {
                        e.target.value = e.target.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]/g, "");
                    }
                });
            });

            [nameInput, emailInput].forEach(input => {
                input.addEventListener('keydown', function (e) {
                    if (e.keyCode === 13) {
                        findIdSubmitEvt(dialogEl);
                    }
                });
            });
        },
        close: function () {
            document.body.style.overflow = '';
        },
    };
};

// 비밀번호 찾기 모달
const findPwModal = function () {
    return {
        title: '비밀번호 찾기',
        html: "login/LoginFindPw.html",
        modal: true,
        width: 430,
        height: 'auto',
        resizable: false,
        buttons: [
            {
                "text": '비밀번호 찾기',
                "class": "krds-btn medium tertiary",
                "type": "button",
                id: 'btnFindPw',
                click: async function (e) {
                    e.preventDefault(); // 기본 submit 막기
                    await findPwSubmitEvt(this);
                }
            }
        ],
        open: function () {
            document.body.style.overflow = 'hidden';
            const dialogEl = this;

            idInput = dialogEl.querySelector('#userId');
            nameInput = dialogEl.querySelector('#userNm');
            emailInput = dialogEl.querySelector('#userEml');

            const textInputs = [nameInput];

            let isComposing = false;

            // 한글 + 영어 + 공백만 허용 (숫자, 특수문자 불가)
            textInputs.forEach(el => {
                if (!el) return;

                el.addEventListener("compositionstart", () => {
                    isComposing = true;
                });

                el.addEventListener("compositionend", (e) => {
                    isComposing = false;
                    e.target.value = e.target.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]/g, "");
                });

                el.addEventListener("input", (e) => {
                    if (!isComposing) {
                        e.target.value = e.target.value.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]/g, "");
                    }
                });
            });

            [idInput, nameInput, emailInput].forEach(input => {
                input.addEventListener('keydown', function (e) {
                    if (e.keyCode === 13) {
                        findPwSubmitEvt(dialogEl);
                    }
                });
            });
        },
        close: function () {
            document.body.style.overflow = '';
        },
    };
};

// 아이디결과모달, 비밀번호결과모달
const findResultModal = function (opt) {
    return {
        title: opt.title,
        html: "login/LoginFindResult.html",
        modal: true,
        width: 430,
        height: 'auto',
        resizable: false,
        buttons: [
            {
                "text": '닫기',
                "class": "krds-btn medium tertiary",
                "type": "button",
                click: async function () {
                    $(this).dialog("destroy").remove();
                    document.body.style.overflow = '';
                }
            }
        ],
        open: function () {
            document.body.style.overflow = 'hidden';
            const dialogEl = this;

            const msgEl = dialogEl.querySelector('#resultMsg');
            const valueEl = dialogEl.querySelector('#resultVal');

            msgEl.textContent = opt.msg;
            valueEl.textContent = opt.value;
        },
        close: function () {
            document.body.style.overflow = '';
        },
    };
};

// 아이디 찾기 결과 모달
const findIdSubmitEvt = async function (dialogEl) {
    const name = nameInput.value;
    const email = emailInput.value;
    const isValid = _LoginCommon.isValidFindId(nameInput, emailInput);
    if (isValid === false) return;

    const param = {
        USER_NM: name,
        EML: email,
    }

    const response = await _LoginApi.recoveryAuth(param, 'id')

    if (response.SUCCESS) {
        const successOpt = {
            title: '아이디 찾기',
            msg: '회원님의 아이디입니다.',
            value: `${response.RESULT.USER_ID}`
        }
        $(dialogEl).dialog('destroy').remove();
        _UI.openDialog(findResultModal(successOpt));
    } else {
        _UI.openAlert({
            title: '아이디 찾기',
            text: response.MESSAGE
        });
    }
}

// 비밀번호 찾기 결과 모달
const findPwSubmitEvt = async function (dialogEl) {
    const id = idInput.value;
    const name = nameInput.value;
    const email = emailInput.value;
    const isValid = _LoginCommon.isValidFindPw(idInput, nameInput, emailInput);
    if (isValid === false) return;

    if (!id || !name || !email) {
        _UI.openAlert({
            title: '비밀번호 찾기',
            text: '아이디, 이름, 이메일을 모두 입력해주세요.'
        });
        return;
    }
    const param = {
        USER_ID: id,
        USER_NM: name,
        EML: email
    }

    const response = await _LoginApi.recoveryAuth(param, 'password')
    if (response.SUCCESS) {
        const successOpt = {
            title: '비밀번호 찾기',
            msg: '회원님의 비밀번호입니다.',
            value: `${response.RESULT.PSWD}`
        }
        $(dialogEl).dialog('destroy').remove();
        _UI.openDialog(findResultModal(successOpt));
    } else {
        _UI.openAlert({
            title: '비밀번호 찾기',
            text: response.MESSAGE
        });
    }
}

/*-----------------------------
  로그인 성공 후 모달 - 대리인 승인 안내, 비밀번호 변경 안내
-----------------------------*/
// 대리인 로그인 사용 시 모달 - 대리인 승인 안내
const openAgentModalsSequentially = function (items) {
    let idx = 0; // 현재 인덱스

    const openNext = () => {
        if (idx >= items.length) return; // 모든 항목 처리 완료
        const item = items[idx];
        let settled = false; // 중복 실행 방지

        _UI.openDialog({
            title: "대리인 승인 안내",
            html: "login/LoginAgent.html",
            modal: true,
            width: 540,
            height: "auto",
            resizable: false,
            open: async function () {
                document.body.style.overflow = "hidden";
                const dialogEl = this;

                // 파일 다운로드 리스트 추가
                const _responseFile = await _AgmApi.getFileList(item.AGT_LINK_ID);
                const fileListEl = dialogEl.querySelector('#file-list');
                if (fileListEl) fileListEl.innerHTML = '';

                if (_responseFile.SUCCESS) {
                    const fileList = _responseFile.RESULT;
                    if (fileList.length > 0) {
                        fileList.forEach(file => {
                            const {ATCH_FILE_ID, ATCH_FILE_NM} = file;
                            const html = _LoginHtmlGenerator.createExistingFileDiv(ATCH_FILE_ID, ATCH_FILE_NM);
                            _UI.appendHtml(html, fileListEl);

                            const dd = fileListEl.querySelector(`#file-${ATCH_FILE_ID}`);
                            const btn = dd?.querySelector(`.btn-download[data-file-id="${ATCH_FILE_ID}"]`);

                            btn?.addEventListener('click', async () => {
                                const blob = await _AgmApi.downloadFile(ATCH_FILE_ID);
                                await download(blob, ATCH_FILE_NM);
                            });
                        })
                    } else {
                        const html = `<span>첨부서류가 없습니다.</span>`
                        _UI.appendHtml(html, fileListEl);
                    }
                }

                const msgEl = dialogEl.querySelector('#resultMsg');
                if (msgEl) {
                    const conmNm = item.CONM_NM ? `(${item.CONM_NM})` : '';
                    msgEl.innerHTML = `<h3>[${item.AGT_DLGTR_NM}]${conmNm} 님이 당신을</h3>`;
                }

                // 다음 모달로 넘어가는 공통 함수
                const settleAndNext = () => {
                    if (settled) return;
                    settled = true;
                    $(dialogEl).dialog("destroy").remove();
                    document.body.style.overflow = "";
                    idx += 1;
                    openNext(); // 다음 데이터로 이동
                };

                // 승인 버튼
                dialogEl.querySelector("#approval_btn")?.addEventListener("click", async (e) => {
                    e.preventDefault();
                    try {
                        const param = {AGT_LINK_ID: item.AGT_LINK_ID, APRV_YN: "Y"};
                        const response = await _LoginApi.updateAgmAprv(param);
                        if (!response?.SUCCESS) {
                            _UI.openAlert({
                                title: '대리인 승인',
                                text: '승인에 실패하였습니다.'
                            });
                        }
                    } catch (err) {
                        _UI.openAlert({
                            title: '대리인 승인',
                            text: '승인 처리 중 오류가 발생했습니다.'
                        });
                    } finally {
                        settleAndNext();
                    }
                });

                // 거부 버튼
                dialogEl.querySelector("#refusal_btn")?.addEventListener("click", async (e) => {
                    e.preventDefault();
                    try {
                        const param = {AGT_LINK_ID: item.AGT_LINK_ID, APRV_YN: "N"};
                        const response = await _LoginApi.updateAgmAprv(param);
                        if (!response?.SUCCESS) {
                            _UI.openAlert({
                                title: '대리인 승인',
                                text: '거부에 실패하였습니다.'
                            });
                        }
                    } catch (err) {
                        _UI.openAlert({
                            title: '대리인 승인',
                            text: '거부 처리 중 오류가 발생했습니다.'
                        });
                    } finally {
                        settleAndNext();
                    }
                });

                // 닫기 버튼(X) 또는 ESC 등으로 닫힐 때
                dialogEl.closest(".ui-dialog")
                    ?.querySelector(".ui-dialog-titlebar-close")
                    ?.addEventListener("click", () => settleAndNext());
            },

            close: function () {
                document.body.style.overflow = "";
                // 이미 settleAndNext()가 실행되지 않았다면 여기서 한 번만 실행
                if (!settled) {
                    settled = true;
                    $(this).closest('.ui-dialog-content').dialog('destroy').remove();
                    idx += 1;
                    openNext();
                }
            },
        });
    };

    openNext(); // 첫 모달 오픈
};

// 비밀번호 변경 알림 모달
const changePwConfirm = (id) => {
    return new Promise((resolve) => {
        _UI.openDialog({
            title: "비밀번호 변경 안내",
            html: "login/LoginChangePw.html",
            modal: true,
            width: 540,
            height: "auto",
            resizable: false,
            buttons: [
                {
                    "text": '변경하러가기',
                    "class": "krds-btn medium tertiary",
                    "type": "button",
                    click: async function (e) {
                        e.preventDefault(); // 기본 submit 막기
                        await changePw();
                        resolve(); // 버튼 누르면 resolve
                        $(this).dialog("close");
                    }
                },
                {
                    "text": '1개월 뒤 변경하기',
                    "class": "krds-btn medium tertiary",
                    "type": "button",
                    click: async function (e) {
                        e.preventDefault(); // 기본 submit 막기
                        const ok = await changeNext(id);
                        if (ok) resolve();
                        $(this).dialog("close");
                    }
                },
            ],
            open: function () {
                document.body.style.overflow = 'hidden';
                const dialogEl = this;
            },
            close: function () {
                document.body.style.overflow = '';
            },
        })
    })
}

// 비밀번호 변경 - 바로 변경 - 회원정보수정으로 넘어가게 만들기
const changePw = async () => {
    await _O2Main.openGnbMenu('myi', 'mbm');
}

// 비밀번호 변경 - 1개월 뒤 변경
const changeNext = async (id) => {
    try {
        const response = await _LoginApi.nextChagnePw(id, {});
        if (!response?.SUCCESS) {
            _UI.openAlert({
                title: '비밀번호 변경',
                text: '비밀번호 변경 알림 연기 요청에 실패했습니다. 잠시 후 다시 시도해주세요.'
            });
            return false;
        }
        _UI.openAlert({
            title: '비밀번호 변경',
            text: '비밀번호 변경을 1개월 뒤로 연기했습니다. 1개월 후 다시 변경 안내가 제공됩니다.'
        });
        return true;
    } catch (err) {
        _UI.openAlert({
            title: '비밀번호 변경',
            text: '비밀번호 변경 알림 연기 요청에 실패했습니다. 잠시 후 다시 시도해주세요.'
        });
        return false;
    }
}

// 전역 등록: 순환 의존 없이 Login.js에서 접근할 수 있도록 함
if (typeof window !== 'undefined') {
    window.Login_processCert = loginProcessCert;
}

// cookie
export const setCookie = function (cookieName, value, exdays) {
    const exdate = new Date();
    exdate.setDate(exdate.getDate() + exdays);
    const cookieValue = escape(value)
        + ((exdays == null) ? "" : "; expires="
            + exdate.toGMTString());
    document.cookie = cookieName + "=" + cookieValue;
}

export const deleteCookie = function (cookieName) {
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() - 1);
    document.cookie = cookieName + "= " + "; expires="
        + expireDate.toGMTString();
}

export const getCookie = function (cookieName) {
    cookieName = cookieName + '=';
    const cookieData = document.cookie;
    let start = cookieData.indexOf(cookieName);
    let cookieValue = '';
    if (start != -1) {
        start += cookieName.length;
        let end = cookieData.indexOf(';', start);
        if (end == -1)
            end = cookieData.length;
        cookieValue = cookieData.substring(start, end);
    }
    return unescape(cookieValue);
}

window.simpleLogin = function (USR_IDE) {
    moveUrl(USR_IDE);
}

window.failLogin = function () {
    _UI.openDialog(failLoginModal())
}

const failLoginModal = function () {
    _UI.openAlert({
        title: '로그인 실패',
        text: `회원 정보가 존재하지 않습니다.<br>회원가입 진행 후 다시 시도해주세요.`
    });
}

// 본인 인증 PASS
/*export async function doCert(action, FN) {
    IMP.certification({
        // 채널이 확실히 이니시스 통합인증 + 해당 MID라면 아래처럼 지정 (추천)
        pg: "inicis_unified.MlliasTest",                // 계약/가맹 세팅에 맞게
        merchant_uid: "cert_" + Date.now(),             // 고유값
        m_redirect_url: "https://your.app/auth/cert/result" // 모바일 리다이렉트 주소(공개URL)
    }, async function (rsp) {
        FN(action, rsp)
    });
}*/

/*async function loginCert(action, rsp) {
    if (rsp.success) {
        const param = {
            impUid: rsp.imp_uid,
            merchantUid: rsp.merchant_uid,
            // USER_TYPE: _userTypeEl.value,
        }
        const response = await _LoginApi.csrfFetch(param);
        if (response.SUCCESS) {
            o2.common.Config.USER = {
                USER_ID: response.RESULT.USER_ID
            };
            _Config.USER.USER_ID = response.RESULT.USER_ID;
            _Config.USER.USER_NM = response.RESULT.USER_NM;
            _Config.USER.USER_TYPE = response.RESULT.USER_TYPE;

            _O2Main.initMainContent();
        } else {
            _UI.openAlert({
                title: '로그인 실패',
                text: response.MESSAGE
            });
        }
    }
}*/