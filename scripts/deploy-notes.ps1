# MyPlatform 배포 안내 (로컬에서 실행)
Write-Host @"

=== MyPlatform 배포 체크리스트 ===

1) GitHub
   cd C:\Mywork\MyPlatform
   git init
   git add .
   git commit -m "chore: MyPlatform scaffold"
   # GitHub 웹에서 repo 생성 후 push
   git remote add origin https://github.com/<USER>/MyPlatform.git
   git push -u origin main

2) Supabase
   - New project
   - SQL Editor: supabase/migrations/20260326000000_init.sql 실행
   - Storage 버킷 samples / standards 생성

3) Vercel
   - Import repo, Root Directory = apps/portal
   - Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_BASE_URL
   - 또는: cd apps/portal; npx vercel login; npx vercel --prod

4) Render
   - Blueprint: render.yaml
   - Env: CORS_ORIGINS=<vercel-url>

"@
