import * as _OrpList from '../panel/Orp.js';
import * as _MyoList from '../panel/Myo.js';

export const GROUP = {
    NAME: '주민수용성',
    CHILDMENU: {
        ORP:{
            open: _OrpList.open,
            name:'의견수렴공고',
            className: 'orp'
        },
        MYO:{
            open: _MyoList.open,
            name:'내 의견 관리',
            className: 'myo'
        },

    }

}