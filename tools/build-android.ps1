param([string]$OutputPath = 'downloads/zasvet-android.apk')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $repoRoot '.local/android-tools'

function Find-Tool([string]$Folder, [string]$Name) {
    $found = Get-ChildItem -LiteralPath (Join-Path $toolsRoot $Folder) -Filter $Name -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
    return $null
}
if (!(Find-Tool 'jdk' 'javac.exe') -or !(Find-Tool 'platform' 'android.jar') -or !(Find-Tool 'build-tools' 'aapt2.exe')) {
    & (Join-Path $PSScriptRoot 'setup-android.ps1')
}
$javac = Find-Tool 'jdk' 'javac.exe'
$javaBin = Split-Path -Parent $javac
$java = Join-Path $javaBin 'java.exe'
$jar = Join-Path $javaBin 'jar.exe'
$keytool = Join-Path $javaBin 'keytool.exe'
$androidJar = Find-Tool 'platform' 'android.jar'
$aapt = Find-Tool 'build-tools' 'aapt2.exe'
$zipalign = Find-Tool 'build-tools' 'zipalign.exe'
$d8 = Find-Tool 'build-tools' 'd8.jar'
$apksigner = Find-Tool 'build-tools' 'apksigner.jar'
# SDK native tools on Windows need relative arguments when the user path contains Cyrillic.
$androidJar = $androidJar.Substring($repoRoot.Length + 1)
$d8 = $d8.Substring($repoRoot.Length + 1)
$apksigner = $apksigner.Substring($repoRoot.Length + 1)

function Run-Tool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Build command failed: ' + (Split-Path -Leaf $Executable)) }
}

Push-Location $repoRoot
try {
    # Each build gets a fresh folder; existing builds and signing keys are preserved.
    $build = 'android/build/' + [guid]::NewGuid().ToString('N')
    $classes = $build + '/classes'
    $dex = $build + '/dex'
    $outputAbsolute = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
    $outputToolPath = $outputAbsolute
    if ($outputAbsolute.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        $outputToolPath = $outputAbsolute.Substring($repoRoot.Length + 1)
    }
    New-Item -ItemType Directory -Force -Path $classes, $dex, (Split-Path -Parent $outputAbsolute), '.local/android-signing' | Out-Null

    Write-Output 'Compiling Android resources and Java host...'
    Run-Tool $aapt @('compile', '--dir', 'android/res', '-o', ($build + '/resources.zip'))
    Run-Tool $aapt @('link', '-o', ($build + '/unsigned.apk'), '-I', $androidJar,
        '--manifest', 'android/AndroidManifest.xml', ($build + '/resources.zip'))
    Run-Tool $javac @('--release', '8', '-encoding', 'UTF-8', '-classpath', $androidJar,
        '-d', $classes, 'android/src/ru/raistaid/zasvet/MainActivity.java')
    Run-Tool $jar @('cf', ($build + '/classes.jar'), '-C', $classes, '.')
    Run-Tool $java @('-cp', $d8, 'com.android.tools.r8.D8', '--release', '--min-api', '26',
        '--lib', $androidJar, '--output', $dex, ($build + '/classes.jar'))
    # aapt2 on Windows writes backslashes into nested asset paths; ZIP entries must use '/'.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.IO.Compression
    $gameRoot = Join-Path $repoRoot 'game'
    $archive = [IO.Compression.ZipFile]::Open((Join-Path $repoRoot ($build + '/unsigned.apk')), [IO.Compression.ZipArchiveMode]::Update)
    try {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $repoRoot ($dex + '/classes.dex')), 'classes.dex', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        foreach ($gameFile in (Get-ChildItem -LiteralPath $gameRoot -File -Recurse)) {
            $entryName = 'assets/' + $gameFile.FullName.Substring($gameRoot.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $gameFile.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose() }
    Run-Tool $zipalign @('-P', '16', '-f', '4', ($build + '/unsigned.apk'), ($build + '/aligned.apk'))

    $keyStore = '.local/android-signing/zasvet.p12'
    if (!(Test-Path -LiteralPath $keyStore)) {
        Run-Tool $keytool @('-genkeypair', '-keystore', $keyStore, '-storetype', 'PKCS12',
            '-storepass', 'android', '-keypass', 'android', '-alias', 'zasvet', '-keyalg', 'RSA',
            '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Zasvet,O=Local Build,C=RU', '-noprompt')
    }
    Write-Output 'Signing and verifying APK...'
    Run-Tool $java @('-jar', $apksigner, 'sign', '--ks', $keyStore, '--ks-key-alias', 'zasvet',
        '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--v1-signing-enabled', 'true',
        '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--out', $outputToolPath, ($build + '/aligned.apk'))
    Run-Tool $java @('-jar', $apksigner, 'verify', '--verbose', $outputToolPath)
    Run-Tool $zipalign @('-c', '-P', '16', '4', $outputToolPath)
    Run-Tool $aapt @('dump', 'badging', $outputToolPath)

    $hash = (Get-FileHash -LiteralPath $outputAbsolute -Algorithm SHA256).Hash.ToLowerInvariant()
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText(($outputAbsolute + '.sha256'), ($hash + '  ' + [IO.Path]::GetFileName($outputAbsolute) + "`n"), $utf8)
    Run-Tool 'node' @('tools/check-android.mjs', $outputAbsolute)
    Write-Output ('APK ready: ' + $outputAbsolute)
    Write-Output ('SHA256: ' + $hash)
} finally {
    Pop-Location
}
