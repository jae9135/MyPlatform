import * as _ElbpaList from '../panel/ElbpaList.js'
import * as _ElbpcList from '../panel/ElbpcList.js'
import * as _CspsdaList from '../panel/CspsdaList.js'
import * as _CspsdcList from '../panel/CspsdcList.js'
import * as _ElbsaList from '../panel/ElbsaList.js'
import * as _CnasaList from '../panel/CnasaList.js'
import * as _CriList from '../panel/CriList.js'
import * as _BfadList from '../panel/BfadList.js'
import * as _CpmsList from '../panel/CpmsList.js'
import * as _SasList from '../panel/SasList.js'

export const GROUP = {
    NAME: '민원신청',
    CHILDMENU: {
        ELBPA:{
            open: _ElbpaList.open,
            name:'전기사업허가',
            className: 'elbpa'
        },
        ELBPC:{
            open: _ElbpcList.open,
            name:'전기사업허가변경',
            className: 'elbpc'
        },
        CSPSDA:{
            open: _CspsdaList.open,
            name:'공사계획신고(인가)',
            className: 'cspsda'
        },
        CSPSDC:{
            open: _CspsdcList.open,
            name:'공사계획신고(인가)변경',
            className: 'cspsdc'
        },
        ELBSA:{
            open: _ElbsaList.open,
            name:'사업개시신고',
            className: 'elbsa'
        },
        CNASA:{
            open: _CnasaList.open,
            name:'사업양수인가',
            className: 'cnasa'
        },
        CRI:{
            open: _CriList.open,
            name:'제증명발급',
            className: 'cri'
        },
        CPMS:{
            open: _CpmsList.open,
            name:'법인합병분할인가',
            className: 'cpms'
        },
        SAS:{
            open: _SasList.open,
            name:'주식취득인가',
            className: 'sas'
        },
        BFAD:{
            open: _BfadList.open,
            name:'사업용시설인수신고',
            className: 'bfad'
        },
    }

}

export let MAP_CONFIG = {
    MAP_NM: 'IPMS',
    // LOC_X: 409608.9496760085, //에너지공단 중심점
    // LOC_Y: 332289.03587524936,
    LOC_X: 290037,//대한민국 중심점
    LOC_Y: 454758,
    LOC_Z: 3223.7209481849836,
    MAP_CRS: 'EPSG:5186',
    MAP_EXTENT: [
        -336410.1177425205, 46164.706000525504, 940893.5997345448, 652299.4728532603
    ],
    APP_EXTENT: [
        -336410.1177425205, 46164.706000525504, 940893.5997345448, 652299.4728532603
    ],
    MIN_RESOLUTION: 0.015625,
    SEARCH_EXTENT: [
        -336410.1177425205, 46164.706000525504, 940893.5997345448, 652299.4728532603
    ]
}

export let CRS_CONFIG = {
    LYR_CRS: 'EPSG:5186',  // 설치장소,설치 필지 CRS
    SEARCH_CRS: 'EPSG:4326' //카카오 주소검색 CRS
}

export const PAGE_OPT = {
    LIST: {
        pg_rowsize: 10,     // 한 페이지당 데이터 개수
        pageNo: 1,          // 현재 페이지
        pageCountOfGroup: 3 // 한 화면에 보여질 페이지 수
    }
}

export const SEARCH_OPT = {
    LIST: {
        searchType: null,
        searchValue: null,
        APLY_STTS_CDS: []
    }
}

//상수용 코드
export const STTS_CD   = Object.freeze({
    DRAFT: 'STT001',             // 작성중
    APPLY: 'STT002',             // 접수신청
    SUPP_BEFORE: 'STT003',       // 보완(접수전)
    RECEIVED: 'STT004',          // 접수완료
    SUPP_AFTER: 'STT005',        // 보완(접수후)
    APRV_BEFORE_TAX: 'STT006',   // 승인(등록면허세 납부 전)
    APRV: 'STT007',              // 승인
    WITHDRAW: 'STT008',          // 취하
    REJECT: 'STT009',            // 불허
    CHANGE: 'STT010',            // 기재사항변경
    CANCEL: 'STT011',            // 취소
    APRV_AFTER_TAX: 'STT012'     // 승인(등록면허세 납부 후)
});
//상수용 코드
export const UT_CD = Object.freeze({
    INDV : 'UT001', // 개인
    CORP : 'UT002', // 법인
    AGENT : 'UT003' // 대리인
});
//상수용 코드
export const CVLCPT_KND_CD = Object.freeze({
    ELBP:  'CK001',  // 전기사업허가
    CSPS:  'CK002',  // 공사계획신고(인가)
    ELBSA: 'CK003',  // 사업개시신고
    CNAS:  'CK004',  // 사업양수인가
    CRI:   'CK005',  // 제증명발급
    CPMS:  'CK006',  // 법인합병분할인가
    SAS:   'CK007',  // 주식취득인가
    BFAD:  'CK008'   // 사업용시설인수신고
});

export const CVLCPT_TMPLT_CD = Object.freeze({
    ELBPA: 'STC001',    // 전기사업허가신청
    ELBPC: 'STC002',    // 전기사업허가변경신청
    CSPSA: 'STC003',    // 공사계획인가신청
    CSPSC: 'STC004',    // 공사계획인가변경신청
    CSPDA: 'STC005',    // 공사계획신고신청
    CSPDC: 'STC006',    // 공사계획신고변경신청
    ELBSA: 'STC007',    // 사업개시신고
    CNAS:  'STC008',    // 사업양수인가
    CPMS:  'STC009',    // 법인합병분할인가
    SAS:   'STC010',    // 주식취득인가
    BFAD:  'STC011'     // 사업용시설인수신고
});

export const STTS_CD_LIST = [
    { code: STTS_CD.DRAFT, label : '작성중 '},
    { code: STTS_CD.APPLY, label : '접수신청' },
    { code: STTS_CD.SUPP_BEFORE, label : '보완(접수전)'},
    { code: STTS_CD.RECEIVED, label : '접수완료'},
    { code: STTS_CD.SUPP_AFTER, label : '보완(접수후)'},
    { code: STTS_CD.APRV_BEFORE_TAX, label : '승인(등록면허세 납부 전)'},
    { code: STTS_CD.APRV, label : '승인'},
    { code: STTS_CD.WITHDRAW, label : '취하'},
    { code: STTS_CD.REJECT, label : '불허'},
    { code: STTS_CD.CHANGE, label : '기재사항 변경'},
    { code: STTS_CD.CANCEL, label : '취소'},
    { code: STTS_CD.APRV_AFTER_TAX, label : '승인(등록면허세 납부 후)'}
];

export const CVLCPT_STTS_CLSF_CD_LIST = [
    { code: "SNC001", label : '신청 '},
    { code: "SNC002", label : '변경' },
    { code: "SNC003", label : '기재사항변경'},
    { code: "SNC004", label : '양도양수'}
];

export const CHG_RSN_CD = [
    { code: "CRN001", label : '대표자변경 '},
    { code: "CRN002", label : '상호변경' },
    { code: "CRN003", label : '소재지변경'},
    { code: "CRN004", label : '전기설비변경'},
    { code: "CRN999", label : '기타'}
];
