# WeRead Exporter Windows 一键安装
#
# 用途：从 GitHub Release 下载官方 NSIS 安装包、校验后运行安装。
# 说明：Windows 没有 macOS 的 quarantine 隔离问题，脚本的价值是
#       一条命令完成「下载 + 校验 + 安装」，不用去 Release 页翻资产。
#
# 用法（PowerShell 中任选其一）：
#   irm https://raw.githubusercontent.com/xlongDev/weread-exporter-desktop/main/scripts/install-windows.ps1 | iex
#   或下载后执行：powershell -ExecutionPolicy Bypass -File install-windows.ps1
#   安装指定版本：先执行 $env:WEREAD_VERSION="v0.1.4"
#   静默安装：    先执行 $env:WEREAD_SILENT="1"（NSIS /S，不弹安装向导）
#   下载慢可加速代理：先执行 $env:WEREAD_MIRROR_PREFIX="https://<你的GH代理>/"
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "xlongDev/weread-exporter-desktop"
$Version = $env:WEREAD_VERSION
$Mirror = $env:WEREAD_MIRROR_PREFIX

function Fetch([string]$Url, [string]$OutFile) {
    # 网络抖动重试（对齐 install-macos.sh 的 curl --retry 5）
    for ($i = 1; $i -le 5; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
            return
        }
        catch {
            if ($i -eq 5) { throw }
            Write-Host "下载失败（第 $i 次），3 秒后重试..."
            Start-Sleep -Seconds 3
        }
    }
}

if (-not $Version -or $Version -eq "latest") {
    Write-Host "查询最新版本..."
    $Version = (Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest").tag_name
}
Write-Host "目标版本: $Version"

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("weread-exporter-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Tmp | Out-Null

$SetupName = "WeRead.Exporter_$($Version.TrimStart('v'))_x64-setup.exe"
$SetupUrl = "${Mirror}https://github.com/$Repo/releases/download/$Version/$SetupName"
$SumsUrl = "${Mirror}https://github.com/$Repo/releases/download/$Version/SHA256SUMS.txt"

Write-Host "下载安装包: $SetupUrl"
Fetch $SetupUrl (Join-Path $Tmp $SetupName)

try {
    Fetch $SumsUrl (Join-Path $Tmp "SHA256SUMS.txt")
}
catch {
    Write-Host "（校验和下载失败，跳过校验）"
}

$SumsPath = Join-Path $Tmp "SHA256SUMS.txt"
if (Test-Path $SumsPath) {
    Write-Host "校验完整性..."
    $line = (Select-String -Path $SumsPath -Pattern ([Regex]::Escape($SetupName)) | Select-Object -First 1).Line
    if ($line) {
        $hash = (Get-FileHash -Path (Join-Path $Tmp $SetupName) -Algorithm SHA256).Hash.ToLower()
        $want = ($line -split '\s+')[0].ToLower()
        if ($hash -ne $want) {
            throw "校验和不匹配，下载文件可能损坏，已中止安装（可重试或检查网络/代理）。"
        }
    }
}

$setupArgs = @()
if ($env:WEREAD_SILENT -eq "1") { $setupArgs += "/S" }

Write-Host "启动安装程序..."
$proc = Start-Process -FilePath (Join-Path $Tmp $SetupName) -ArgumentList $setupArgs -PassThru
Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "✅ 完成：可从开始菜单打开 WeRead Exporter。"
