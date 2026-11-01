/**
 * 데모 페이지 데이터 — 실제 프로그램을 샘플로 실행해 나온 결과를 그대로 저장한 것입니다 (손으로 만든 값 없음).
 * 생성: scripts/demo/README.md 의 절차로 로컬 API(apps/api)를 띄워 실행 → JSON 결과를 옮김.
 * 프로그램 로직이 바뀌면 다시 생성하세요.
 */
export const DB_WORKFLOW_DEMO = {
  "generatedAt": "2026-11-01",
  "sampleFile": "테이블정의서_샘플.xlsx",
  "meta": {
    "system": "A시스템",
    "tables": 6,
    "columns": 14,
    "relations": 4,
    "sheet": "테이블 정의서"
  },
  "tables": [
    {
      "name": "customer",
      "korean": "고객",
      "columns": 2,
      "pk": [
        "customer_id"
      ]
    },
    {
      "name": "member",
      "korean": "회원",
      "columns": 1,
      "pk": [
        "id"
      ]
    },
    {
      "name": "member_detail",
      "korean": "회원상세",
      "columns": 1,
      "pk": [
        "id"
      ]
    },
    {
      "name": "order_item",
      "korean": "주문상세",
      "columns": 5,
      "pk": [
        "order_id",
        "item_seq"
      ]
    },
    {
      "name": "orders",
      "korean": "주문",
      "columns": 2,
      "pk": [
        "order_id"
      ]
    },
    {
      "name": "product1",
      "korean": "상품",
      "columns": 3,
      "pk": [
        "product_id"
      ]
    }
  ],
  "relations": [
    {
      "from": "member",
      "fromColumn": "id",
      "to": "member_detail",
      "toColumn": "id",
      "cardinality": "1:1",
      "identifying": true
    },
    {
      "from": "orders",
      "fromColumn": "order_id",
      "to": "order_item",
      "toColumn": "order_id",
      "cardinality": "1:1..N",
      "identifying": false
    },
    {
      "from": "product1",
      "fromColumn": "product_id",
      "to": "order_item",
      "toColumn": "product_id",
      "cardinality": "1:1..N",
      "identifying": false
    },
    {
      "from": "customer",
      "fromColumn": "customer_id",
      "to": "orders",
      "toColumn": "customer_id",
      "cardinality": "1:1..N",
      "identifying": false
    }
  ],
  "std": {
    "term": {
      "total_cols": 20,
      "matched_cols": 0,
      "review_cols": 20,
      "unmatched_cols": 0,
      "match_rows": 0,
      "review_rows": 26,
      "from_term_cols": 3,
      "from_word_cols": 17
    },
    "domain": {
      "total_cols": 14,
      "matched_cols": 0,
      "review_cols": 3,
      "unmatched_cols": 11,
      "match_rows": 0,
      "review_rows": 3
    },
    "rows": [
      {
        "table": "고객",
        "column": "고객명",
        "current": "CUSTOMER_NM",
        "recommended": "CUST_NM",
        "source": "표준용어",
        "reason": "영문약어불일치"
      },
      {
        "table": "회원",
        "column": "회원아이디",
        "current": "ID",
        "recommended": "MBR_ID",
        "source": "표준단어",
        "reason": "영문약어불일치"
      },
      {
        "table": "주문상세",
        "column": "상품번호",
        "current": "ITEM_SEQ",
        "recommended": "GDS_NO",
        "source": "표준용어",
        "reason": "영문약어불일치"
      },
      {
        "table": "주문상세",
        "column": "개수",
        "current": "QTY",
        "recommended": "CNT",
        "source": "표준단어",
        "reason": "영문약어불일치"
      },
      {
        "table": "주문상세",
        "column": "상품아이디",
        "current": "PRODUCT_ID",
        "recommended": "GDS_ID",
        "source": "표준단어",
        "reason": "영문약어불일치"
      },
      {
        "table": "상품",
        "column": "상품명",
        "current": "PRODUCT_NM",
        "recommended": "GDS_NM",
        "source": "표준용어",
        "reason": "영문약어불일치"
      },
      {
        "table": "상품",
        "column": "가격",
        "current": "PRICE",
        "recommended": "PRC",
        "source": "표준단어",
        "reason": "영문약어불일치"
      },
      {
        "table": "회원상세",
        "column": "(테이블명)",
        "current": "MEMBER_DETAIL",
        "recommended": "MBR_DTL",
        "source": "표준단어",
        "reason": "영문약어불일치"
      },
      {
        "table": "주문상세",
        "column": "(테이블명)",
        "current": "ORDER_ITEM",
        "recommended": "ORDR_DTL",
        "source": "표준단어",
        "reason": "영문약어불일치"
      }
    ],
    "domainRows": [
      {
        "table": "고객",
        "column": "고객명",
        "designType": "VARCHAR2(100)",
        "domain": "명V100",
        "domainType": "VARCHAR(100)",
        "reason": "영문약어불일치"
      },
      {
        "table": "주문상세",
        "column": "상품번호",
        "designType": "NUMBER(10)",
        "domain": "번호V20",
        "domainType": "VARCHAR(20)",
        "reason": "영문약어불일치,타입불일치"
      },
      {
        "table": "상품",
        "column": "상품명",
        "designType": "VARCHAR2(100)",
        "domain": "명V200",
        "domainType": "VARCHAR(200)",
        "reason": "영문약어불일치"
      }
    ]
  },
  "ddl": {
    "scripts": [
      "CUSTOMER.sql",
      "MEMBER.sql",
      "PRODUCT1.sql",
      "MEMBER_DETAIL.sql",
      "ORDERS.sql",
      "ORDER_ITEM.sql",
      "99_sample_data.sql"
    ],
    "exampleName": "ORDER_ITEM.sql",
    "example": "-- Database: dbm\n-- Schema: db1\n-- Table: order_item\n-- Source: 주문상세\n\nCREATE TABLE IF NOT EXISTS db1.order_item (\n    order_id INTEGER NOT NULL,\n    item_seq INTEGER NOT NULL,\n    item_name VARCHAR(100),\n    qty INTEGER,\n    product_id VARCHAR(255) NOT NULL,\n    CONSTRAINT pk_order_item PRIMARY KEY (order_id, item_seq)\n);\n\nCOMMENT ON TABLE db1.order_item IS '주문상세';\nCOMMENT ON COLUMN db1.order_item.order_id IS '주문ID';\nCOMMENT ON COLUMN db1.order_item.item_seq IS '상품번호';\nCOMMENT ON COLUMN db1.order_item.item_name IS '품명';\nCOMMENT ON COLUMN db1.order_item.qty IS '개수';\nCOMMENT ON COLUMN db1.order_item.product_id IS '상품아이디';\nALTER TABLE db1.order_item ADD CONSTRAINT fk_order_item_order_id FOREIGN KEY (order_id) REFERENCES db1.orders (order_id);\nALTER TABLE db1.order_item ADD CONSTRAINT fk_order_item_product1 FOREIGN KEY (product_id) REFERENCES db1.product1 (product_id);\n",
    "sample": "-- Sample data script (aligned to table definition lengths)\n-- PK values are numeric strings (1, 2, …); apply step continues from DB max\n-- Connect to target database before running\n\n-- Sample data: customer (pk from 1)\nINSERT INTO customer (customer_id, customer_nm) VALUES ('1', 's_customer_nm');\n\n-- Sample data: member (pk from 1)\nINSERT INTO member (id) VALUES ('1');\n\n-- Sample data: product1 (pk from 1)\nINSERT INTO product1 (product_id, product_nm, price) VALUES ('1', 's_product_nm', 1);\n\n-- Sample data: member_detail (pk from 1)\nINSERT INTO member_detail (id) VALUES ('1');\n\n-- Sample data: orders (pk from 1)\nINSERT INTO orders (order_id, customer_id) VALUES ('1', '1');\n\n-- Sample data: order_item (pk from 1)\nINSERT INTO order_item (order_id, item_seq, item_name, qty, product_id) VALUES ('1', '1', 's_item_name', 1, '1');\n"
  },
  "erdImage": {
    "src": "/marketing/demo/erd-sample.webp",
    "width": 1248,
    "height": 759
  }
} as const;

export const SOURCE_SCAN_DEMO = {
  "generatedAt": "2026-11-01",
  "sampleFile": "demo-shop.zip",
  "stats": {
    "total": 24,
    "fail": 24,
    "not_scanned": 0,
    "pass": 0,
    "by_ruleset": {
      "pmd": 9,
      "findsecbugs": 11,
      "analog": 4,
      "system": 0
    },
    "by_scanner": {
      "bandit": 4,
      "pmd": 9,
      "spotbugs": 11
    },
    "by_severity": {
      "high": 8,
      "medium": 16,
      "low": 0
    },
    "by_language": {
      "python": 4,
      "java": 20
    }
  },
  "scanners": {
    "bandit": {
      "summary": "bandit: 분석 완료 · 결함 4건",
      "fail": 4
    },
    "pmd": {
      "summary": "pmd: 분석 완료 · 결함 9건",
      "fail": 9
    },
    "spotbugs": {
      "summary": "spotbugs: 분석 완료 · 결함 13건",
      "fail": 13
    }
  },
  "findings": [
    {
      "severity": "high",
      "scanner": "bandit",
      "rule": "B602",
      "location": "demo-shop/scripts/backup.py:10",
      "message": "subprocess call with shell=True identified, security issue.",
      "category": "security",
      "ref": "https://cwe.mitre.org/data/definitions/78.html"
    },
    {
      "severity": "high",
      "scanner": "bandit",
      "rule": "B324",
      "location": "demo-shop/scripts/backup.py:23",
      "message": "Use of weak MD5 hash for security. Consider usedforsecurity=False",
      "category": "security",
      "ref": "https://find-sec-bugs.github.io/bugs.htm#PREDICTABLE_RANDOM"
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "DMI_RANDOM_USED_ONLY_ONCE",
      "location": "com/example/shop/OrderService.java:6",
      "message": "Random object created and used only once in com.example.shop.OrderService.newCouponCode()",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "ES_COMPARING_PARAMETER_STRING_WITH_EQ",
      "location": "com/example/shop/OrderService.java:6",
      "message": "Comparison of String parameter using == or != in com.example.shop.OrderService.discount(int, String)",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "DM_DEFAULT_ENCODING",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "Found reliance on default encoding in com.example.shop.UserRepository.hash(String): String.getBytes()",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "HARD_CODE_PASSWORD",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "Hard coded password found",
      "category": "security",
      "ref": "https://find-sec-bugs.github.io/bugs.htm#HARD_CODE_PASSWORD"
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "com.example.shop.UserRepository.login(String, String) passes a nonconstant String to an execute or addBatch method on an SQL statement",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "high",
      "scanner": "spotbugs",
      "rule": "WEAK_MESSAGE_DIGEST_MD5",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "This API MD5 (MDX) is not a recommended cryptographic hash function",
      "category": "security",
      "ref": "https://find-sec-bugs.github.io/bugs.htm#WEAK_MESSAGE_DIGEST_MD5"
    },
    {
      "severity": "medium",
      "scanner": "bandit",
      "rule": "B506",
      "location": "demo-shop/scripts/backup.py:15",
      "message": "Use of unsafe yaml load. Allows instantiation of arbitrary objects. Consider yaml.safe_load().",
      "category": "security",
      "ref": "https://cwe.mitre.org/data/definitions/20.html"
    },
    {
      "severity": "medium",
      "scanner": "bandit",
      "rule": "B301",
      "location": "demo-shop/scripts/backup.py:19",
      "message": "Pickle and modules that wrap it can be unsafe when used to deserialize untrusted data, possible security issue.",
      "category": "security",
      "ref": "https://cwe.mitre.org/data/definitions/502.html"
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "CompareObjectsWithEquals",
      "location": "demo-shop/src/main/java/com/example/shop/OrderService.java:15",
      "message": "Use equals() to compare object references.",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "UseEqualsToCompareStrings",
      "location": "demo-shop/src/main/java/com/example/shop/OrderService.java:15",
      "message": "Use equals() to compare strings instead of '==' or '!='",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "AvoidLiteralsInIfCondition",
      "location": "demo-shop/src/main/java/com/example/shop/OrderService.java:15",
      "message": "Avoid using literals such as \"VIP\" in if statements",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "EmptyCatchBlock",
      "location": "demo-shop/src/main/java/com/example/shop/OrderService.java:20",
      "message": "Avoid empty catch blocks",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "AvoidCatchingGenericException",
      "location": "demo-shop/src/main/java/com/example/shop/OrderService.java:20",
      "message": "Avoid catching Exception in try-catch block",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "CloseResource",
      "location": "demo-shop/src/main/java/com/example/shop/UserRepository.java:15",
      "message": "Ensure that resources like this Connection object are closed after use",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "CloseResource",
      "location": "demo-shop/src/main/java/com/example/shop/UserRepository.java:16",
      "message": "Ensure that resources like this Statement object are closed after use",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "CloseResource",
      "location": "demo-shop/src/main/java/com/example/shop/UserRepository.java:18",
      "message": "Ensure that resources like this ResultSet object are closed after use",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "pmd",
      "rule": "RelianceOnDefaultCharset",
      "location": "demo-shop/src/main/java/com/example/shop/UserRepository.java:25",
      "message": "Specify a character set instead of relying on the default charset",
      "category": "java",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "spotbugs",
      "rule": "PREDICTABLE_RANDOM",
      "location": "com/example/shop/OrderService.java:6",
      "message": "This random generator (java.util.Random) is predictable",
      "category": "security",
      "ref": "https://find-sec-bugs.github.io/bugs.htm#PREDICTABLE_RANDOM"
    },
    {
      "severity": "medium",
      "scanner": "spotbugs",
      "rule": "DMI_CONSTANT_DB_PASSWORD",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "Hardcoded constant database password in com.example.shop.UserRepository.login(String, String)",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "spotbugs",
      "rule": "OBL_UNSATISFIED_OBLIGATION",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "com.example.shop.UserRepository.login(String, String) may fail to clean up java.sql.ResultSet",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "spotbugs",
      "rule": "ODR_OPEN_DATABASE_RESOURCE",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "com.example.shop.UserRepository.login(String, String) may fail to close Connection",
      "category": "security",
      "ref": ""
    },
    {
      "severity": "medium",
      "scanner": "spotbugs",
      "rule": "SQL_INJECTION_JDBC",
      "location": "com/example/shop/UserRepository.java:10",
      "message": "This use of java/sql/Statement.executeQuery(Ljava/lang/String;)Ljava/sql/ResultSet; can be vulnerable to SQL injection (with JDBC)",
      "category": "security",
      "ref": "https://find-sec-bugs.github.io/bugs.htm#SQL_INJECTION_JDBC"
    }
  ]
} as const;

export const WEB_QUALITY_DEMO = {
  "generatedAt": "2026-11-01",
  "samplePath": "/samples/demo-shop/index.html",
  "stats": {
    "total": 21,
    "pass": 2,
    "fail": 9,
    "review": 7,
    "manual": 3,
    "not_scanned": 0,
    "na": 0,
    "by_category": {
      "a11y": {
        "fail": 8,
        "pass": 0,
        "not_scanned": 0
      },
      "uiux": {
        "fail": 1,
        "pass": 1,
        "not_scanned": 0
      },
      "compat": {
        "fail": 0,
        "pass": 1,
        "not_scanned": 0
      }
    }
  },
  "findings": [
    {
      "status": "fail",
      "category": "a11y",
      "rule": "8.2.1",
      "kwcag": "8.2.1",
      "severity": "error",
      "message": "Buttons must have discernible text"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WA-1.3.3",
      "kwcag": "5.4.3",
      "severity": "error",
      "message": "Elements must meet minimum color contrast ratio thresholds"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WS-1.3",
      "kwcag": "7.1.1",
      "severity": "error",
      "message": "<html> element must have a lang attribute"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WA-1.1.1",
      "kwcag": "5.1.1",
      "severity": "error",
      "message": "Images must have alternative text"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WA-3.3.1",
      "kwcag": "5.3.2",
      "severity": "warning",
      "message": "Document should have one main landmark"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "8.2.1",
      "kwcag": "8.2.1",
      "severity": "error",
      "message": "<marquee> elements are deprecated and must not be used"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WA-2.4.2",
      "kwcag": "6.4.2",
      "severity": "warning",
      "message": "Page should contain a level-one heading"
    },
    {
      "status": "fail",
      "category": "a11y",
      "rule": "WA-2.4.1",
      "kwcag": "6.4.1",
      "severity": "warning",
      "message": "All page content should be contained by landmarks"
    },
    {
      "status": "fail",
      "category": "uiux",
      "rule": "UX-KRDS-1.2",
      "kwcag": "6.4.1",
      "severity": "error",
      "message": "본문 바로가기(건너뛰기) 링크를 찾을 수 없습니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-1.1",
      "kwcag": null,
      "severity": "warning",
      "message": "공식 전자정부 누리집 안내 문구가 보이지 않습니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-2.1",
      "kwcag": null,
      "severity": "warning",
      "message": "header/banner 또는 nav/GNB landmark가 부족합니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-2.2",
      "kwcag": null,
      "severity": "warning",
      "message": "footer(contentinfo) 또는 연락처·저작권 영역이 부족합니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-2.3",
      "kwcag": "6.4.2",
      "severity": "warning",
      "message": "h1 페이지 제목 또는 breadcrumb이 없습니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-3.1",
      "kwcag": null,
      "severity": "info",
      "message": "KRDS design token(--krds-*) 또는 krds 클래스 사용 흔적이 없습니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-3.2",
      "kwcag": null,
      "severity": "info",
      "message": "KRDS 컴포넌트 클래스(krds-*)가 감지되지 않습니다."
    },
    {
      "status": "review",
      "category": "uiux",
      "rule": "UX-KRDS-4.1",
      "kwcag": null,
      "severity": "warning",
      "message": "글자·화면 표시 설정 UI가 감지되지 않습니다."
    }
  ],
  "pageImage": {
    "src": "/marketing/demo/web-sample-page.webp",
    "width": 1280,
    "height": 900
  }
} as const;

/**
 * DB 적용 — DBManager 「스크립트 → 적용」 화면에서 1. 테이블 생성 → 2. 샘플 데이터 를 실행한 실제 응답과
 * 적용 후 DB 를 조회한 결과 (PostgreSQL 16 테스트 DB, public 스키마).
 */
export const DB_APPLY_DEMO = {
  generatedAt: "2026-11-01",
  database: "PostgreSQL 16 (테스트 DB)",
  steps: [
    { step: "1. 테이블 생성", ok: true, message: "Table script executed successfully." },
    {
      step: "2. 샘플 데이터",
      ok: true,
      message:
        "Sample data inserted successfully. (PK: public.customer → 1~1, public.member → 1~1, public.product1 → 1~1, public.member_detail → 1~1, public.orders → 1~1, public.order_item → 1~1)",
    },
  ],
  verify: {
    tables: ["customer", "member", "member_detail", "order_item", "orders", "product1"],
    foreignKeys: 4,
    rows: { customer: 1, orders: 1, order_item: 1, product1: 1 },
  },
} as const;
