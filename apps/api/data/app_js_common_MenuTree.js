// app/js/common/MenuTree.js
import * as _Config from '../common/Config.js';
import * as _CvaConfig from '../cva/config/CvaConfig.js';
import * as _ReaConfig from '../rea/config/ReaConfig.js';
import * as _NobConfig from '../nob/config/NobConfig.js';
import * as _UsgConfig from '../usg/config/UsgConfig.js';
import * as _MyiConfig from '../myi/config/MyiConfig.js';
import * as _StatsConfig from '../stats/config/StatsConfig.js';
import * as _OccConfig from '../occ/config/OccConfig.js';

// 하위 MENU_CD → routeKey(className) 매핑 (기존 class명과 동일하게)
export const ROUTE_KEY_MAP = {
    // cva
    MNU006: 'elbpa',   // 전기사업허가
    MNU007: 'elbpc',   // 전기사업허가변경
    MNU008: 'cspsda',  // 공사계획신고(인가)
    MNU009: 'cspsdc',  // 공사계획신고(인가)변경
    MNU010: 'elbsa',   // 사업개시신고
    MNU011: 'cnasa',   // 사업양수인가
    MNU012: 'cri',     // 제증명발급
    // todo 신규메뉴 관련 명칭 재정의
    MNU070: 'cpms',    // 법인합병분할인가
    MNU071: 'sas',     // 주식취득인가
    MNU072: 'bfad',    // 사업용시설인수신고
    // rea
    MNU013: 'orp',     // 의견수렴공고
    MNU014: 'myo',     // 내 의견 관리
    // nob
    MNU015: 'ntc',     // 공지사항
    MNU016: 'cap',     // 양도양수인가공고 (임시 키, 필요 시 교체)
    MNU065: 'cpmsn',     // 법인 합병/분할 인가공고
    MNU017: 'rpstr',   // 자료실
    MNU018: 'qna',     // Q&A
    MNU019: 'faq',     // FAQ
    MNU020: 'gbs',     // 발전사업 관련사이트
    MNU021: 'card',    // 카드뉴스 (임시 키, 필요 시 교체)
    // usg
    MNU022: 'gbi',     // 발전사업절차
    MNU023: 'ebs',     // 발전사업인허가서비스
    MNU024: 'ebi',// 발전사업주요질의사항 (임시 키, 필요 시 교체)
    // myi
    MNU025: 'mbm',     // 회원관리
    MNU026: 'cvp',     // 민원현황
    MNU027: 'agm',     // 대리인관리
    MNU055: 'cvhm',     // 민원접수 이력 관리


    MNU054: 'dscsn',     // 전화상담

    // 통계분석
    MNU060: 'public-map',     // 공개 주제도
    MNU061: 'stats-dashboard',     // 통계 대시보드
    MNU062: 'forecast-dashboard'     // 전망 대시보드
};

const INV_ROUTE_KEY_MAP = Object.fromEntries(
    Object.entries(ROUTE_KEY_MAP).map(([menuCd, className]) => [className, menuCd])
);
// 통계 부속메뉴는 전화상담 메뉴와 동일한 권한을 사용한다.
INV_ROUTE_KEY_MAP.dscsnStats = 'MNU054';
// CHILDMENU기반 메뉴
const GROUP_CONFIGS = [
    { ulId: 'cva', config: _CvaConfig },
    { ulId: 'rea', config: _ReaConfig },
    { ulId: 'nob', config: _NobConfig },
    { ulId: 'usg', config: _UsgConfig },
    { ulId: 'myi', config: _MyiConfig },
    { ulId: 'stats', config: _StatsConfig },
    { ulId: 'occ', config: _OccConfig },
];
// 게스트에서 회색 처리 대상(클릭 시 로그인 유도는 O2Main에서 처리)
const DISABLED_FOR_GUEST = new Set(['cva', 'rea', 'myi', 'occ']);

// 메뉴트리 가공 (비로그인 예외 적용)
export function getMenuTree(user = _Config.USER) {

    const userAuthList = Array.isArray(user?.USER_AUTHRT) ? user.USER_AUTHRT : [];
    const isLoggedIn   = !!user?.USER_ID;

    // AUTHRT_CD 조회용: MENU_CD → AUTHRT_CD 맵
    const authMap = {};
    if (isLoggedIn) {
        userAuthList.forEach(a => {
            if (a && a.MENU_CD) authMap[a.MENU_CD] = a.AUTHRT_CD;
        });
    }

    // CHILDMENU 기반으로 트리 구성
    const tops = GROUP_CONFIGS.map(({ ulId, config }) => {
        const children = Object.values(config.GROUP.CHILDMENU).map((m) => {
            const className = m.className;
            let disabled = false;

            if (!isLoggedIn) {
                // 게스트: 그룹 기준으로 비활성
                disabled = DISABLED_FOR_GUEST.has(ulId);
            } else {
                // 로그인 O: AUTHRT_CD가 ATH001이면 비활성 (없으면 안전하게 비활성)
                const menuCd = INV_ROUTE_KEY_MAP[className];
                const code   = menuCd ? authMap[menuCd] : null;
                disabled = (code === 'ATH001' || code == null);
            }

            return {
                menuCd:   null,
                menuNm:   m.name,
                sortSeq:  0,
                className,
                disabled,
            };
        });

        return {
            menuCd:  null,
            menuNm:  config.GROUP.NAME,
            sortSeq: 0,
            ulId,
            children,
        };
    });

    return { tops };
}

// 하위(ulId, className) 노드가 비활성인지 확인
export function isDisabled(tree, ulId, className) {
    const top = tree?.tops?.find(t => t.ulId === ulId);
    const node = (top?.children || []).find(c => c.className === className);
    return !!node?.disabled;
}

// 상위(ulId)에서 비활성인 className 집합(Set) 반환
export function disabledSet(tree, ulId) {
    const top = tree?.tops?.find(t => t.ulId === ulId);
    const set = new Set();
    (top?.children || []).forEach(c => { if (c.disabled) set.add(c.className); });
    return set;
}


// GNB 렌더링 (main.jsp의 .gnb-list#gnb 유지 )
export function renderGNB(tree) {
    const gnb = document.querySelector('.gnb-list#gnb') || document.querySelector('.gnb-list');
    if (!gnb) return;
    o2.util.Dom.emptyEl(gnb);

    tree.tops.forEach(top => {
        const li = document.createElement('li');
        li.className = 'gnb-dropdown';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gnb-main-trigger';
        btn.textContent = top.menuNm;

        const subWrap = document.createElement('div');
        subWrap.className = 'gnb-sub';

        const ul = document.createElement('ul');
        ul.id = top.ulId;

        top.children.forEach(ch => {
            const liSub = document.createElement('li');
            const linkEl = document.createElement('a');
            //linkEl.href = '#';
            linkEl.href = 'javascript:;';
            linkEl.className = ch.className;
            linkEl.textContent = ch.menuNm;

            // 비활성 스타일(회색)
            if (ch.disabled) {
                linkEl.setAttribute('aria-disabled', 'true');
                linkEl.style.opacity = '0.45';
                linkEl.style.filter = 'grayscale(1)';
            }

            liSub.appendChild(linkEl);
            ul.appendChild(liSub);
        });

        subWrap.appendChild(ul);
        li.appendChild(btn);
        li.appendChild(subWrap);
        gnb.appendChild(li);
    });
}

// 빌드+렌더
export function initGNB() {
    const tree = getMenuTree();
    renderGNB(tree);
    return tree;
}

// 기본 진입(비활성 제외 우선: 첫 번째 활성 하위 → 없으면 첫 하위)
export function getFirstEntry(tree) {
    if (!tree?.tops?.length) return null;
    // 비활성 아닌 첫 항목 우선
    for (const top of tree.tops) {
        const ok = (top.children || []).find(ch => !ch.disabled);
        if (ok) return { ulId: top.ulId, liClass: ok.className };
    }
    // 전부 비활성이면 첫 항목이라도 반환
    const top = tree.tops[0];
    const first = top.children?.[0];
    if (!first) return null;
    return { ulId: top.ulId, liClass: first.className };
}

// 상위메뉴 활성 시 하위 메뉴 return
export function leftMenuSet(tree, ulId) {
    const top = tree?.tops?.find(t => t.ulId === ulId);
    return new Set((top?.children || []).map(c => c.className));
}