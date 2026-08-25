import * as _Agm from "../panel/Agm.js";
import * as _Mbm from "../panel/Mbm.js";
import * as _Cvp from "../panel/Cvp.js";
import * as _Cvhm from "../panel/Cvhm.js";


export const GROUP = {
    NAME: '내정보관리',
    CHILDMENU: {
        MBM:{
            open: _Mbm.open,
            name:'회원관리',
            className:'mbm'
        },
        CVP:{
            open: _Cvp.open,
            name: '민원현황',
            className: 'cvp'
        },
        AGM: {
            open: _Agm.open,
            name: '대리인관리',
            className: 'agm'
        },
        CVHM: {
            open: _Cvhm.open,
            name: '민원접수 이력 관리',
            className: 'cvhm'
        }
    }
}