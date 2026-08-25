import * as _UI from "../../../js/util/UI.js";
import * as _LoginConfig from "../config/LoginConfig.js";
import {PWD_REGEX} from "../config/LoginConfig.js";
import * as _Config from "../../common/Config.js";

export const isValidLogin = (_userIdEl, _userPwEl) => {
    return validateFields([
        { el: _userIdEl, label: '아이디', required: true },
        { el: _userPwEl, label: '비밀번호', required: true },
    ]);
}

export const isValidFindId = (nameInput, emailInput) => {
    return validateFields([
        { el: nameInput, label: '이름', required: true },
        { el: emailInput, label: '이메일', required: true, type: 'email' }
    ]);
};

export const isValidFindPw = (idInput, nameInput, emailInput) => {
    return validateFields([
        { el: idInput, label: '아이디', required: true },
        { el: nameInput, label: '이름', required: true },
        { el: emailInput, label: '이메일', required: true, type: 'email' }
    ]);
};


/**
 * 공통 입력값 검사
 */
export const validateFields = function (fields) {
    for (const field of fields) {
        const value = field.el.value.trim();

        if (field.required && value === '') {
            openAlert({
                title: `${field.label} 확인`,
                text: `${field.label}을(를) 입력해주세요.`
            }).then(() => {
                field.el.focus();
            });

            return false;
        }

        if (field.type === 'email' && !_LoginConfig.EML_REGEX.test(value)) {
            openAlert({
                title: `${field.label} 확인`,
                text: '이메일 형식이 올바르지 않습니다.'
            }).then(() => {
                field.el.focus();
            });
            return false;
        }

    }
    return true;
};


/*  finalUrl에 들어갈 파라미터
    > sysCode : 시스템구분(발전사업 인허가 통합관리시스템 구분코드)
    > userSsnType : 1: 사업자등록번호 or 2: 주민등록번호
    > rtnPage : 리턴URL
*/
// 실제 공동인증서 팝업
export const openCertPopup = (userSsnType, isCertOnlyVal) => {
    const isProd = _Config.ENV.IS_PROD;

    const contextPath = window.location.pathname.split('/')[1];
    const base = 'https://kcert.energy.or.kr/keaDev/Login/CertLoginHTML5.do';
    // 콜백 URL
    const rtnPage = new URL(
        `/${contextPath}/cert/login?ssnType=${userSsnType}&isCertOnly=${isCertOnlyVal}`,
        window.location.origin
    ).href;

    const popup = window.open('', 'login', 'width=1200,height=680');

    // form 생성
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = base;
    form.target = 'login';

    // 필요한 파라미터 hidden input으로 추가
    const params = {
        sysCode: '',
        userSsnType,
        rtnPage
    };

    Object.entries(params).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    if (!isCertOnlyVal) {
        // 로컬 + 일반 로그인일 때만 mock 데이터 처리
        const param = {
            ACTION: 'login',
            CERT_DATA: '',
            USER_NM: '',
            CONM_NM: '',
            SUCCESS: true,
            IS_CERT_ONLY: isCertOnlyVal,
            USER_CERT_HSTRY_ID : null,
        };

        const popupTimer = setInterval(() => {
            if (popup.closed) {
                clearInterval(popupTimer);
                getParamCertify(param);
            }
        }, 500);
    }
}

// alert 후 focus 이동을 위해 생성
export const openAlert = (opt) => {
    return new Promise((resolve) => {
        const defaultOpt = {
            title: opt.title,
            modal: true,
            dialogClass: 'pop-box open-alert',
            minHeight: 0,
            width: 350,
            resizable: false,
            buttons: [
                {
                    text: '닫기',
                    "class": "btn krds-btn medium tertiary",
                    click: function () {
                        $(this).dialog("close");
                    }
                }
            ],
            close: function () {
                $(this).dialog("destroy").remove();
                //완료
                resolve();
            },
            text: opt.text
        };

        const contentEl = o2.util.Dom.makeEl(`
      <div class="ui-dialog-content ui-widget-content">
        <div class="contents-wrap">
          <p class="p-confirm" style="text-align: center;"></p>
        </div>
      </div>
    `);

        contentEl.querySelector('.p-confirm')
            .insertAdjacentHTML("beforeend", defaultOpt.text);

        defaultOpt.contentEl = contentEl;

        _UI.openDialog(defaultOpt);
    });

};