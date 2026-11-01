param(
    [Parameter(Mandatory = $true)][string]$LiteLoaderRoot,
    [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$RemoveOtherPlugins
)
$ErrorActionPreference = 'Stop'
$loader = (Resolve-Path -LiteralPath $LiteLoaderRoot).ProviderPath.TrimEnd('\')
$source = (Resolve-Path -LiteralPath $SourceRoot).ProviderPath.TrimEnd('\')
$plugins = Join-Path $loader 'plugins'
if (-not (Test-Path -LiteralPath (Join-Path $loader 'package.json'))) { throw '未找到 LiteLoaderQQNT。' }
$manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.slug -ne 'qm-qqnt') { throw '来源目录不是 QmQQNT。' }
$backupBase = Join-Path (Split-Path -Parent $loader) 'LiteLoaderQQNT-backups'
$backup = Join-Path $backupBase ('QmQQNT-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
$stage = Join-Path $backup 'staging'
$target = Join-Path $plugins 'qm-qqnt'
$previous = Join-Path $backup 'previous-qm-qqnt'
$moved = [Collections.Generic.List[object]]::new()
$installed = $false
function Assert-Child([string]$Child, [string]$Parent) {
    $absolute = [IO.Path]::GetFullPath($Child)
    $parentAbsolute = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if ((Split-Path -Parent $absolute) -ne $parentAbsolute) { throw "路径不在预期目录内：$absolute" }
    if (Test-Path -LiteralPath $absolute) {
        if ((Get-Item -LiteralPath $absolute -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "不自动移动链接目录：$absolute" }
    }
}
Assert-Child $target $plugins
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Assert-Child $stage $backup
Copy-Item -LiteralPath $plugins -Destination (Join-Path $backup 'plugins') -Recurse
if (Test-Path -LiteralPath (Join-Path $loader 'data')) { Copy-Item -LiteralPath (Join-Path $loader 'data') -Destination (Join-Path $backup 'data') -Recurse }
foreach ($entry in Get-ChildItem -LiteralPath $source -Force) {
    if ($entry.Name -in @('.git', 'node_modules')) { continue }
    Copy-Item -LiteralPath $entry.FullName -Destination $stage -Recurse
}
foreach ($entry in $manifest.injects.PSObject.Properties.Value) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $entry) -PathType Leaf)) { throw "缺少入口文件：$entry" }
}
$files = @(Get-ChildItem -LiteralPath $stage -Recurse -File)
foreach ($file in $files) {
    $relative = $file.FullName.Substring($stage.Length + 1)
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $relative)).Hash) { throw "复制校验失败：$relative" }
}
try {
    if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $previous }
    Move-Item -LiteralPath $stage -Destination $target
    $installed = $true
    $data = Join-Path $loader 'data\qm-qqnt'
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    $oldConfig = Join-Path $loader 'data\liuli-dsh-theme\config.json'
    if ((Test-Path -LiteralPath $oldConfig) -and -not (Test-Path -LiteralPath (Join-Path $data 'config.json'))) { Copy-Item -LiteralPath $oldConfig -Destination (Join-Path $data 'config.json') }
    if ($RemoveOtherPlugins) {
        $disabled = Join-Path $backup 'removed-plugins'
        New-Item -ItemType Directory -Path $disabled | Out-Null
        foreach ($entry in Get-ChildItem -LiteralPath $plugins -Directory) {
            if ($entry.Name -eq 'qm-qqnt') { continue }
            Assert-Child $entry.FullName $plugins
            $destination = Join-Path $disabled $entry.Name
            Move-Item -LiteralPath $entry.FullName -Destination $destination
            $moved.Add([pscustomobject]@{ Source = $destination; Target = $entry.FullName })
        }
    }
    $configFile = Join-Path $loader 'data\LiteLoader\config.json'
    $text = Get-Content -LiteralPath $configFile -Raw
    Copy-Item -LiteralPath $configFile -Destination (Join-Path $backup 'loader-config-before-activation.json')
    $config = $text | ConvertFrom-Json
    $config.enable_plugins = $true
    $config.disabled_plugins = @($config.disabled_plugins | Where-Object { $_ -ne 'qm-qqnt' })
    if ($RemoveOtherPlugins) {
        $config | Add-Member -NotePropertyName deleting_plugins -NotePropertyValue ([pscustomobject]@{}) -Force
        $config | Add-Member -NotePropertyName installing_plugins -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $json = ($config | ConvertTo-Json -Depth 30) -replace "`r?`n", $newline
    [IO.File]::WriteAllText($configFile, $json + $newline, [Text.UTF8Encoding]::new($false))
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($stage.Length + 1)
        if ((Get-FileHash -LiteralPath (Join-Path $target $relative)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $relative)).Hash) { throw "安装后校验失败：$relative" }
    }
    [pscustomobject]@{ Plugin = $manifest.name; Version = $manifest.version; Target = $target; Backup = $backup; VerifiedFiles = $files.Count; RemovedPlugins = $moved.Count; RestartRequired = $true } | ConvertTo-Json
} catch {
    foreach ($entry in $moved) { if (-not (Test-Path -LiteralPath $entry.Target)) { Assert-Child $entry.Target $plugins; Move-Item -LiteralPath $entry.Source -Destination $entry.Target } }
    if ($installed -and (Test-Path -LiteralPath $target)) { Assert-Child $target $plugins; Move-Item -LiteralPath $target -Destination (Join-Path $backup 'failed-install') }
    if (Test-Path -LiteralPath $previous) { Assert-Child $target $plugins; Move-Item -LiteralPath $previous -Destination $target }
    $savedConfig = Join-Path $backup 'loader-config-before-activation.json'
    if (-not (Test-Path -LiteralPath $savedConfig)) { $savedConfig = Join-Path $backup 'data\LiteLoader\config.json' }
    if (Test-Path -LiteralPath $savedConfig) { Copy-Item -LiteralPath $savedConfig -Destination (Join-Path $loader 'data\LiteLoader\config.json') -Force }
    throw
}
