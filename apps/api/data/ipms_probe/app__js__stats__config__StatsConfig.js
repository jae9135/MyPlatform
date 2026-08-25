import * as _Pub from '../../stats/panel/Pub.js';
import * as _Sta from '../../stats/panel/Sta.js';
import * as _For from '../../stats/panel/For.js';


export const GROUP = {
    NAME: '통계분석',
    CHILDMENU: {
        PUB : {
            open: _Pub.open,
            name: '공개 주제도',
            className: 'public-map',
        },
        STA : {
            open: _Sta.open,
            name: '통계 대시보드',
            className: 'stats-dashboard',
        },
        FOR : {
            open: _For.open,
            name: '전망 대시보드',
            className: 'forecast-dashboard',
        }
    }
}