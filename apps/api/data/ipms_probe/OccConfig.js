import * as _Dscsn from "../panel/Dscsn.js";
//import * as _DscsnStatistics from "../panel/DscsnStatistics.js";

export const GROUP = {
    NAME: '운영센터 관리',
    CHILDMENU: {
        // 전화상담 관리
        DSCSN:{
            open: _Dscsn.open,
            name:'전화상담',
            className:'dscsn'
        },
        /*// 상담 통계
        DSCSNSTATS:{
            open: _DscsnStatistics.open,
            name:'운영센터 통계',
            className:'dscsnStats'
        },*/
    }
}
