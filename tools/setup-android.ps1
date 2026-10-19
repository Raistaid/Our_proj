$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repoRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $repoRoot '.local/android-cache'
$toolsRoot = Join-Path $repoRoot '.local/android-tools'
New-Item -ItemType Directory -Force -Path $cacheRoot, $toolsRoot | Out-Null

# Official SDK archives and a pinned Temurin JDK; nothing is installed globally.
$packages = @(
    @{
        File = 'jdk.zip'; Folder = 'jdk'; CheckFile = 'javac.exe'; Algorithm = 'SHA256'
        Url = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'
        Hash = 'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'
    },
    @{
        File = 'platform.zip'; Folder = 'platform'; CheckFile = 'android.jar'; Algorithm = 'SHA1'
        Url = 'https://dl.google.com/android/repository/platform-35_r02.zip'
        Hash = '0bb560a90a7a2cbd0dd8348224d518b638fe7949'
    },
    @{
        File = 'build-tools.zip'; Folder = 'build-tools'; CheckFile = 'aapt2.exe'; Algorithm = 'SHA1'
        Url = 'https://dl.google.com/android/repository/build-tools_r35_windows.zip'
        Hash = 'af059bb67cf7786f45ee0db85e2d24985df1b4b6'
    },
    @{
        File = 'platform-tools.zip'; Folder = 'platform-tools'; CheckFile = 'adb.exe'; Algorithm = 'SHA1'
        Url = 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip'
        Hash = 'e03e78b1d80b396f1c3358e31251cb31740e1110'
    }
)
foreach ($package in $packages) {
    $archivePath = Join-Path $cacheRoot $package.File
    $extractRoot = Join-Path $toolsRoot $package.Folder
    if (!(Test-Path -LiteralPath $archivePath)) {
        Write-Output ('Downloading ' + $package.File)
        $download = New-Object Net.WebClient
        try { $download.DownloadFile($package.Url, $archivePath) } finally { $download.Dispose() }
    }
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm $package.Algorithm).Hash -ne $package.Hash) {
        throw ('Archive checksum mismatch: ' + $archivePath)
    }
    $existing = Get-ChildItem -LiteralPath $extractRoot -Filter $package.CheckFile -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$existing) {
        Write-Output ('Extracting ' + $package.File)
        Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    }
}
Write-Output ('Android tools ready: ' + $toolsRoot)
