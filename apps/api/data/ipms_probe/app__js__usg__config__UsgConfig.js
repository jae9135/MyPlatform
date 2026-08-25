import * as _Gbi from '../panel/Gbi.js';
import * as _Ebi from '../panel/Ebi.js';
import * as _Ebs from '../panel/Ebs.js';

export const GROUP = {
    NAME: '이용안내',
    CHILDMENU: {
        GBI : {
            open: _Gbi.open,
            name: '발전사업절차',
            className: 'gbi',
        },
        EBS : {
            open: _Ebs.open,
            name: '시스템 안내',
            className: 'ebs',
        },
        EBI : {
            open: _Ebi.open,
            name: '발전사업주요질의사항',
            className: 'ebi',
        }

    }
}