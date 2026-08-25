import * as Config from '../js/common/Config.js';
import * as O2Main from '../js/common/O2Main.js';
import {ENV} from "../js/common/Config.js";

export const initConfig = function () {
    const dataScript = document.querySelector('#server-data');
    const rawData = dataScript.textContent;
    const serverData = JSON.parse(rawData);

    o2.util.Dom.removeEl(dataScript);

    const contextPath = window.location.pathname.replaceAll('/', '');
    
    // o2platform config setting
    o2.common.Config.HOST.VALUES.APP_CONTEXT_PATH = contextPath;
    o2.common.Config.HOST.VALUES.PLATFORM_HOST = serverData.O2PLATFORM_URL;
    o2.common.Config.HOST.VALUES.APP_PROXY = `common/proxy.jsp`;
    o2.common.Config.HOST.VALUES.APP_LOGOUT_PATH = `login/logout`;
    o2.common.Config.HOST.VALUES.USE_PROXY = true;
    o2.common.Config.HOST.VALUES.SESSION_TIMEOUT = 99999999999999999;

    // application config setting
    Config.HOST.APP_CONTEXT_PATH = contextPath;
    Config.HOST.ADMIN_SYSTEM_URL = serverData.ADMIN_SYSTEM_URL;
    Config.API_KEY.KAKAO = serverData.MAP_APIKEY_KAKAO;
    Config.API_KEY.VWORLD = serverData.MAP_APIKEY_VWORLD;
    Config.DATA_CONFIG.LAYER.JIJUK = serverData.JIJUK_LAYER_NM;
    Config.ENV.IS_PROD = serverData.IS_PROD;

    if(serverData.USER_ID){
        // Object.entries(serverData.USR_INF).forEach(([key, value]) => {
        //     Config.USR_INF[key] = value;
        // });
        o2.common.Config.USER = {
            USER_ID : serverData.USER_ID,
            USER_NM : serverData.USER_NM,
            USER_TYPE : serverData.USER_TYPE,
            USER_AUTHRT : serverData.USER_AUTHRT
        };
        Config.USER.USER_ID = serverData.USER_ID;
        Config.USER.USER_NM = serverData.USER_NM;
        Config.USER.USER_TYPE = serverData.USER_TYPE;
        Config.USER.USER_AUTHRT = serverData.USER_AUTHRT;
    }

    // override
    o2.common.Config.API_KEY.VALUES = {
        ...o2.common.Config.API_KEY.VALUES,
        ...Config.API_KEY
    };
};

initConfig();
O2Main.init();