param(
  [string[]]$Names = @('title', 'select', 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6', 'lvl7', 'lvl8', 'lvl9', 'lvl10'),
  [string]$OutDir = (Join-Path $env:TEMP 'nine-crests-tests'),   # helpers: use your own folder, e.g. $env:TEMP\nc-tests-B
  [int]$Width = 1280, [int]$Height = 720, [int]$Budget = 6000, [int]$Parallel = 1,
  [switch]$Dom
)
# Opens index.html#test=NAME in hidden (headless) Edge windows. tools\autoplay.js plays up to the named moment.
# Default: saves a picture NAME.png.  With -Dom: prints the test log (PASS/FAIL lines) instead.
$ErrorActionPreference = 'Stop'
$Names = @($Names | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$game = Split-Path -Parent $PSScriptRoot
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Edge not found' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$url = 'file:///' + ($game -replace '\\', '/') + '/index.html'
$queue = New-Object System.Collections.Queue
$Names | ForEach-Object { $queue.Enqueue($_) }
$running = @()
function Start-One($n) {
  $profileDir = Join-Path $OutDir "profile-$n"
  if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
  $common = @('--headless=new', '--no-first-run', '--disable-extensions', '--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    "--user-data-dir=`"$profileDir`"", "--window-size=$Width,$Height", "--virtual-time-budget=$Budget")
  if ($Dom) {
    $outFile = Join-Path $OutDir "$n.dom.txt"
    if (Test-Path $outFile) { Remove-Item $outFile -Force }
    $a = $common + @('--dump-dom', "`"$url#test=$n`"")
    $p = Start-Process -FilePath $edge -ArgumentList $a -PassThru -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError (Join-Path $OutDir "$n.err.txt")
    return [pscustomobject]@{ Name = $n; Out = $outFile; Proc = $p; Profile = $profileDir }
  } else {
    $png = Join-Path $OutDir "$n.png"
    if (Test-Path $png) { Remove-Item $png -Force }
    $a = $common + @("--screenshot=`"$png`"", "`"$url#test=$n`"")
    $p = Start-Process -FilePath $edge -ArgumentList $a -PassThru -WindowStyle Hidden
    return [pscustomobject]@{ Name = $n; Out = $png; Proc = $p; Profile = $profileDir }
  }
}
function Finish-One($r) {
  if (-not $r.Proc.WaitForExit(240000)) { try { $r.Proc.Kill() } catch {}; "$($r.Name): TIMED OUT"; return }
  # kill any child Edge processes still using this test profile
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$($r.Profile)*" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
  if ($Dom) {
    if (Test-Path $r.Out) {
      $html = Get-Content -Raw $r.Out
      $m = [regex]::Match($html, '<pre id="testlog"[^>]*>([\s\S]*?)</pre>')
      if ($m.Success) { [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) } else { "$($r.Name): no test log in DOM" }
    } else { "$($r.Name): no output" }
  } elseif (Test-Path $r.Out) { "$($r.Name): ok  $($r.Out)" } else { "$($r.Name): no picture" }
}
while ($queue.Count -gt 0 -or $running.Count -gt 0) {
  while ($queue.Count -gt 0 -and $running.Count -lt $Parallel) { $running += Start-One $queue.Dequeue() }
  $first = $running[0]
  Finish-One $first
  $running = @($running | Select-Object -Skip 1)
}
