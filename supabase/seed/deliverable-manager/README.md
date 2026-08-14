# DeliverableManager 공개 테스트 껍데기

실제 양식/참고자료(hwp, xlsx 등)는 **회사 PC에만** 둡니다.  
여기는 목록 확인용 **빈 .txt** 만 Supabase `samples` 버킷에 올립니다.

## 1. 껍데기 생성

원본 `study/DeliverableManager` 는 읽기만 합니다 (수정하지 않음).

```powershell
cd C:\Mywork\MyPlatform\supabase\seed\deliverable-manager
python build_placeholders.py
```

결과: `out/catalog.json` + ASCII 경로 껍데기.

Storage는 한글 파일명을 거절하므로(`InvalidKey`) 객체 키는 `biz-001.txt` 같은 영문 ID입니다.  
한글 폴더·산출물명은 `catalog.json`과 txt 본문에만 있습니다.

참고자료는 테스트용 **공공 유사사업 / 민간 유사사업** (`reference/site-a`, `reference/site-b`)입니다. 포털 라벨은 `REFERENCE_SITES`에서 바꿉니다.

`out/` 은 git에 넣지 않습니다.

## 2. 공개 버킷 업로드

Dashboard → Storage → 버킷 **`samples`** (Public ON).

```powershell
$env:SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "(service role, 프론트에 넣지 말 것)"
python upload_placeholders.py
```

경로:

```
samples/deliverable-manager/catalog.json
samples/deliverable-manager/deliverable/biz-001.txt
samples/deliverable-manager/template/biz-001.txt
samples/deliverable-manager/reference/site-a/biz-001.txt
samples/deliverable-manager/reference/site-b/biz-001.txt
```

## 3. 포털

Vercel/로컬 `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 이 있으면  
`/apps/deliverable-manager` 가 공개 catalog와 껍데기 txt를 받습니다.
