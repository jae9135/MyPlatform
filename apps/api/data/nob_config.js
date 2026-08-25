import * as _Ntc from '../panel/Ntc.js';
import * as _Rpstr from '../panel/Rpstr.js';
import * as _Qna from '../panel/Qna.js';
import * as _Faq from '../panel/Faq.js';
import * as _Gbs from '../panel/Gbs.js';
import * as _Card from '../panel/Card.js';
import * as _Cap from '../panel/Cap.js';
import * as _Cpmsn from '../panel/Cpmsn.js';

export const GROUP = {
    NAME: '알림마당',
    CHILDMENU: {
        NTC : {
            open: _Ntc.open,
            name: '공지사항',
            className: 'ntc',
        },
        CAP : {
            open: _Cap.open,
            name: '양도양수 인가공고',
            className: 'cap',
        },
        CPMSN : {
            open: _Cpmsn.open,
            name: '법인 합병/분할 인가공고',
            className: 'cpmsn',
        },
        RPSTR : {
            open: _Rpstr.open,
            name: '자료실',
            className: 'rpstr',
        },
        QNA : {
            open: _Qna.open,
            name: 'Q&A',
            className: 'qna',
        },
        FAQ : {
            open: _Faq.open,
            name: 'FAQ',
            className: 'faq',
        },
        GBS : {
            open: _Gbs.open,
            name: '발전사업 관련사이트',
            className: 'gbs',
        },
        CARD : {
            open: _Card.open,
            name: '카드뉴스',
            className: 'card',
        },
    }
}