# MyPlatform 로컬 API — 전체 기능 (source-scan, web-quality, DBManager 등)
# 사용: .\scripts\start-api-source-scan.ps1
#
# 환경 변수: apps/api/.env.local (DATABASE_URL 등) + apps/portal/.env.local (공유 키)
# 포털 UI: 별도 터미널에서 npm run dev:portal (apps/portal/.env.local 필요)
#
# npm run dev:api (--reload) 와 동시에 쓰지 마세요. reload 자식 프로세스가 포트를 붙잡을 수 있습니다.

param(
    [int]$Port = 8001,
    [switch]$SkipKill
)

$ErrorActionPreference = "Stop"

function Test-EnvSet {
    param([string]$Name)
    $val = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($val)) { return $false }
    if ($val -match 'YOUR_PROJECT|YOUR-PASSWORD|your_') { return $false }
    return $true
}

function Import-DotEnvFile {
    param(
        [Parameter(Mandatory)][string]$Path,
        [switch]$OnlyIfUnset
    )
    if (-not (Test-Path $Path)) { return $false }

    $loaded = 0
    Get-Content $Path -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        if ($line -match '^\s*export\s+(.+)$') { $line = $Matches[1].Trim() }
        if ($line -notmatch '^\s*([^#=]+?)=(.*)$') { return }

        $key = $Matches[1].Trim()
        $val = $Matches[2].Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"') -and $val.Length -ge 2) {
            $val = $val.Substring(1, $val.Length - 2)
        } elseif ($val.StartsWith("'") -and $val.EndsWith("'") -and $val.Length -ge 2) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if ([string]::IsNullOrWhiteSpace($key)) { return }
        if ($OnlyIfUnset -and (Test-EnvSet $key)) { return }

        Set-Item -Path "Env:$key" -Value $val
        $loaded++
    }
    return ($loaded -gt 0)
}

function Test-DbConfigured {
    if (Test-EnvSet "DATABASE_URL") { return $true }
    return (
        (Test-EnvSet "POSTGRES_HOST") -and
        (Test-EnvSet "POSTGRES_USER")
    )
}

function Initialize-LocalApiEnv {
    param([string]$RepoRoot)

    $apiEnv = Join-Path $RepoRoot "apps\api\.env.local"
    $portalEnv = Join-Path $RepoRoot "apps\portal\.env.local"

    if (Import-DotEnvFile -Path $apiEnv) {
        Write-Host "Loaded API env:" $apiEnv
    } elseif (Test-Path (Join-Path $RepoRoot "apps\api\.env.example")) {
        Write-Host "Tip: copy apps\api\.env.example → apps\api\.env.local (DATABASE_URL for DBManager)"
    }

    if (Import-DotEnvFile -Path $portalEnv -OnlyIfUnset) {
        Write-Host "Loaded portal env (fill missing keys):" $portalEnv
    }

    if (-not (Test-EnvSet "SUPABASE_URL") -and (Test-EnvSet "NEXT_PUBLIC_SUPABASE_URL")) {
        $env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
    }
    if (-not (Test-EnvSet "SUPABASE_SERVICE_ROLE_KEY") -and (Test-EnvSet "SUPABASE_SECRET_KEY")) {
        $env:SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SECRET_KEY
    }
}

function Initialize-CorsOrigins {
    param([string]$RepoRoot)

    if (Test-EnvSet "CORS_ORIGINS") {
        Write-Host "CORS_ORIGINS:" $env:CORS_ORIGINS
        return
    }

    $corsList = [System.Collections.Generic.List[string]]::new()
    [void]$corsList.Add("http://127.0.0.1:3000")
    [void]$corsList.Add("http://localhost:3000")

    $portalEnv = Join-Path $RepoRoot "apps\portal\.env.local"
    if (Test-Path $portalEnv) {
        Get-Content $portalEnv -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match '^\s*NEXT_PUBLIC_PORTAL_URL\s*=\s*(.+)\s*$') {
                $u = $Matches[1].Trim().Trim('"').Trim("'")
                if ($u -match '^https?://') { [void]$corsList.Add($u) }
            }
        }
    }

    $env:CORS_ORIGINS = ($corsList | Select-Object -Unique) -join ','
    Write-Host "CORS_ORIGINS (auto):" $env:CORS_ORIGINS
}

function Show-FeatureReadiness {
    param([string]$RepoRoot)

    Write-Host ""
    Write-Host "=== Local feature readiness ==="

    function Write-FeatureStatus {
        param([string]$Label, [bool]$Ok, [string]$Hint = "")
        $mark = if ($Ok) { "[OK]" } else { "[--]" }
        $color = if ($Ok) { "Green" } else { "Yellow" }
        Write-Host "  $mark $Label" -ForegroundColor $color
        if (-not $Ok -and $Hint) { Write-Host "       $Hint" -ForegroundColor DarkYellow }
    }

    $portalEnv = Join-Path $RepoRoot "apps\portal\.env.local"
    $hasPortalEnv = Test-Path $portalEnv

    Write-FeatureStatus "Source scan (PMD/SpotBugs)" `
        ($env:PMD_HOME -and (Test-Path $env:PMD_HOME) -and $env:SPOTBUGS_HOME -and (Test-Path $env:SPOTBUGS_HOME)) `
        "PMD_HOME / SPOTBUGS_HOME 경로 확인"

    Write-FeatureStatus "Web quality (Playwright)" `
        (Test-EnvSet "PORTAL_PASSWORD") `
        "apps/portal/.env.local 에 PORTAL_PASSWORD (IPMS 로그인용)"

    Write-FeatureStatus "DBManager (Supabase Postgres)" `
        (Test-DbConfigured) `
        "apps/api/.env.local 에 DATABASE_URL (Supabase Database URI)"

    Write-FeatureStatus "Portal Supabase apps (DeliverableManager, MyGantt)" `
        ($hasPortalEnv -and (Test-EnvSet "NEXT_PUBLIC_SUPABASE_URL") -and (Test-EnvSet "NEXT_PUBLIC_SUPABASE_ANON_KEY")) `
        "apps/portal/.env.local + npm run dev:portal"

    Write-FeatureStatus "ChkDBStd / ER Modeler API" $true ""

    $locustOk = $false
    try {
        python -c "import locust" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $locustOk = $true }
    } catch { }

    Write-FeatureStatus "Perf test (Locust)" $locustOk "pip install locust (apps/api/requirements.txt)"
    Write-Host ""
}

function Get-PidsOnPort {
    param([int]$ListenPort)
    $pids = [System.Collections.Generic.HashSet[int]]::new()

    try {
        Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.OwningProcess -gt 0) { [void]$pids.Add($_.OwningProcess) }
            }
    } catch {
        # netstat fallback only
    }

    netstat -ano | Select-String ":$ListenPort\s" | ForEach-Object {
        if ($_.Line -match "LISTENING\s+(\d+)\s*$") {
            [void]$pids.Add([int]$Matches[1])
        }
    }

    return @($pids)
}

function Stop-ProcessForce {
    param([int]$ProcId)
    $proc = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  stopping $($proc.ProcessName) (PID $ProcId)..."
        Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "  taskkill PID $ProcId (process handle gone, socket may linger)..."
        cmd /c "taskkill /F /PID $ProcId" 2>$null | Out-Null
    }
}

function Stop-UvicornWorkers {
    param([int]$ListenPort)
    $portPat = [regex]::Escape("$ListenPort")
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like "python*" -and $_.CommandLine -and (
                ($_.CommandLine -match "uvicorn" -and $_.CommandLine -match "--port\s+$portPat") -or
                ($_.CommandLine -match "multiprocessing\.spawn" -and $_.CommandLine -match "spawn_main")
            )
        } |
        ForEach-Object {
            Write-Host "  stopping uvicorn worker $($_.ProcessId): $($_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length)))..."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Stop-ListenerOnPort {
    param(
        [int]$ListenPort,
        [int]$MaxAttempts = 8
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        Stop-UvicornWorkers -ListenPort $ListenPort

        $pids = Get-PidsOnPort -ListenPort $ListenPort
        if (-not $pids -or $pids.Count -eq 0) {
            if ($attempt -gt 1) { Write-Host "Port $ListenPort is now free." }
            return
        }

        Write-Host "Port $ListenPort in use (attempt $attempt/$MaxAttempts) — PIDs: $($pids -join ', ')"
        foreach ($procId in $pids) {
            Stop-ProcessForce -ProcId $procId
        }
        Start-Sleep -Seconds 2
    }

    Stop-UvicornWorkers -ListenPort $ListenPort
    Start-Sleep -Seconds 2

    $remaining = Get-PidsOnPort -ListenPort $ListenPort
    if ($remaining -and $remaining.Count -gt 0) {
        throw @"
Port $ListenPort still in use by PID(s): $($remaining -join ', ').
- Close all terminals running 'npm run dev:api'
- Task Manager에서 python 종료
- 그래도 안 되면 PC 재로그인 후 다시 실행
"@
    }
}

function Wait-PortFree {
    param(
        [int]$ListenPort,
        [int]$TimeoutSec = 20
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $pids = Get-PidsOnPort -ListenPort $ListenPort
        if (-not $pids -or $pids.Count -eq 0) { return }
        Start-Sleep -Milliseconds 500
    }
    $left = Get-PidsOnPort -ListenPort $ListenPort
    if ($left -and $left.Count -gt 0) {
        throw "Timed out waiting for port $ListenPort (still PID: $($left -join ', '))."
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Initialize-LocalApiEnv -RepoRoot $repoRoot
Initialize-CorsOrigins -RepoRoot $repoRoot

# === 경로를 환경에 맞게 수정 ===
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-11.0.32.9-hotspot"
$mavenBin = "C:\Mywork\Tools\apache-maven-3.9.16\bin"
$env:PMD_HOME = "C:\tools\pmd-bin-7.26.0"
$env:SPOTBUGS_HOME = "C:\tools\spotbugs-4.10.4"
$env:SOURCE_SCAN_TOOLS_DIR = "C:\tools"

# SpotBugs 4.9+ 는 실행용 JDK 11+ 필요 (Maven 컴파일은 JAVA_HOME=8 유지 가능)
$spotbugsJdk = @(
    $env:SPOTBUGS_JAVA_HOME,
    (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -Filter "jdk-11*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName),
    (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)
) | Where-Object { $_ -and (Test-Path (Join-Path $_ "bin\java.exe")) } | Select-Object -First 1

if ($spotbugsJdk) {
    $env:SPOTBUGS_JAVA_HOME = $spotbugsJdk
    Write-Host "SPOTBUGS_JAVA_HOME:" $env:SPOTBUGS_JAVA_HOME
} else {
    Write-Warning @"
SpotBugs 4.10 실행에 JDK 11+ 필요 (현재 JAVA_HOME=JDK 8).
- Eclipse Temurin 11 설치: https://adoptium.net/
- 설치 후 이 스크립트가 SPOTBUGS_JAVA_HOME 을 자동 설정합니다.
- 또는 SpotBugs 4.8.6.8 + JDK 8 조합으로 SPOTBUGS_HOME 변경
"@
}

$plugin = Get-ChildItem "C:\tools" -Filter "findsecbugs*.jar" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($plugin) {
    $env:FINDSEC_BUGS_PLUGIN_JAR = $plugin.FullName
    Write-Host "findsecbugs plugin:" $plugin.FullName
} else {
    Write-Warning "findsecbugs-plugin JAR not found under C:\tools"
}

$env:PATH = "$env:JAVA_HOME\bin;$mavenBin;$env:PATH"

Write-Host "JAVA_HOME:" $env:JAVA_HOME
Write-Host "PMD_HOME:" $env:PMD_HOME
Write-Host "SPOTBUGS_HOME:" $env:SPOTBUGS_HOME
if (Test-DbConfigured) {
    Write-Host "DATABASE: configured (DBManager ready)"
} else {
    Write-Warning "DATABASE_URL not set — DBManager Supabase apply disabled. See apps/api/.env.example"
}
if (Test-EnvSet "PORTAL_PASSWORD") {
    Write-Host "PORTAL_PASSWORD: set (web-quality IPMS)"
}
if (Test-EnvSet "API_ACCESS_KEY") {
    Write-Host "API_ACCESS_KEY: set"
}

Show-FeatureReadiness -RepoRoot $repoRoot

if (-not $SkipKill) {
    Stop-ListenerOnPort -ListenPort $Port
    Wait-PortFree -ListenPort $Port
}

Write-Host "Starting API on http://127.0.0.1:$Port ..."
Write-Host "Health: http://127.0.0.1:$Port/health/detail"
Write-Host "Portal: npm run dev:portal  →  http://127.0.0.1:3000"
Write-Host "Tip: use this script instead of 'npm run dev:api' (PMD/SpotBugs + .env.local included)."

python -m uvicorn main:app --app-dir apps/api --port $Port
