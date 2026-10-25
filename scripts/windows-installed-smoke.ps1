$ErrorActionPreference = 'Stop'
$installer = (Resolve-Path $env:AURA_INSTALLER).Path
$root = Join-Path $env:RUNNER_TEMP ('aura-installed-smoke-' + [guid]::NewGuid().ToString('N'))
$profile = Join-Path $root 'profile'
$report = Join-Path $root 'smoke-report.json'
$readyReport = Join-Path $root 'smoke-ready.json'
$stopSignal = Join-Path $root 'smoke-stop.signal'
$installDir = Join-Path $root 'install'
$gatewayReady = Join-Path $root 'gateway-ready.json'
$gatewayStdout = Join-Path $root 'gateway.stdout.log'
$gatewayStderr = Join-Path $root 'gateway.stderr.log'
$resourceSamplePath = Join-Path $env:GITHUB_WORKSPACE 'windows-installed-resource-sample.json'
$gateway = $null
$app = $null
New-Item -ItemType Directory -Force -Path $root, $profile | Out-Null
$env:APPDATA = Join-Path $profile 'Roaming'
$env:LOCALAPPDATA = Join-Path $profile 'Local'
New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA | Out-Null

function Get-InstalledProcessSnapshot {
  $allProcesses = @(Get-CimInstance Win32_Process)
  $trackedIds = [System.Collections.Generic.HashSet[int]]::new()
  [void]$trackedIds.Add([int]$app.Id)
  $foundChild = $true
  while ($foundChild) {
    $foundChild = $false
    foreach ($entry in $allProcesses) {
      $processId = [int]$entry.ProcessId
      if (!$trackedIds.Contains($processId) -and $trackedIds.Contains([int]$entry.ParentProcessId)) {
        [void]$trackedIds.Add($processId)
        $foundChild = $true
      }
    }
  }
  $entries = @($allProcesses | Where-Object { $trackedIds.Contains([int]$_.ProcessId) })
  $cpuSeconds = ($entries | ForEach-Object { (([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000000) } | Measure-Object -Sum).Sum
  $workingSetBytes = ($entries | Measure-Object -Property WorkingSetSize -Sum).Sum
  $privateMemoryBytes = ($entries | Measure-Object -Property PrivatePageCount -Sum).Sum
  $handleCount = ($entries | Measure-Object -Property HandleCount -Sum).Sum
  $processIdentities = @($entries | ForEach-Object {
    $creation = $_.CreationDate
    if ($creation -is [datetime]) { $creation = $creation.ToUniversalTime().ToString('o') }
    "$([int]$_.ProcessId)|$creation"
  } | Sort-Object)
  if ($null -eq $cpuSeconds) { $cpuSeconds = 0.0 }
  if ($null -eq $workingSetBytes) { $workingSetBytes = 0 }
  if ($null -eq $privateMemoryBytes) { $privateMemoryBytes = 0 }
  if ($null -eq $handleCount) { $handleCount = 0 }
  [pscustomobject]@{
    processEntries = $entries
    processCount = $entries.Count
    processIds = @($entries | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
    processIdentities = $processIdentities
    cpuSeconds = [double]$cpuSeconds
    workingSetBytes = [double]$workingSetBytes
    privateMemoryBytes = [double]$privateMemoryBytes
    handleCount = [int64]$handleCount
  }
}

try {
  $tokenBytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
  $env:AURA_AI_INSTALL_TOKEN = [Convert]::ToHexString($tokenBytes).ToLowerInvariant()
  [Array]::Clear($tokenBytes, 0, $tokenBytes.Length)
  $env:AURA_WINDOWS_SMOKE_GATEWAY_READY = $gatewayReady
  $gatewayScript = Join-Path $env:GITHUB_WORKSPACE 'tests/fixtures/windows-smoke-gateway.mjs'
  $nodePath = (Get-Command node).Source
  $gateway = Start-Process -FilePath $nodePath -ArgumentList @("`"$gatewayScript`"") -WorkingDirectory $env:GITHUB_WORKSPACE -PassThru -WindowStyle Hidden -RedirectStandardOutput $gatewayStdout -RedirectStandardError $gatewayStderr
  $gatewayDeadline = (Get-Date).AddSeconds(30)
  while (!(Test-Path $gatewayReady) -and (Get-Date) -lt $gatewayDeadline) {
    $gateway.Refresh()
    if ($gateway.HasExited) { throw 'Local smoke Gateway exited before readiness.' }
    Start-Sleep -Milliseconds 250
  }
  if (!(Test-Path $gatewayReady)) { throw 'Timed out waiting for local smoke Gateway.' }
  $gatewayInfo = Get-Content $gatewayReady -Raw | ConvertFrom-Json
  if ($gatewayInfo.port -lt 1 -or $gatewayInfo.port -gt 65535) { throw 'Local smoke Gateway returned an invalid port.' }
  $env:AURA_AI_GATEWAY_URL = "http://127.0.0.1:$($gatewayInfo.port)"

  # NSIS may start the app from its finish action; set smoke variables before installing so that process inherits them.
  $env:AURA_INSTALLED_SMOKE = '1'
  $env:AURA_INSTALLED_SMOKE_REPORT = $report
  $env:AURA_INSTALLED_SMOKE_READY = $readyReport
  $env:AURA_INSTALLED_SMOKE_STOP = $stopSignal

  $proc = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru -WindowStyle Hidden
  if ($proc.ExitCode -ne 0) { throw "NSIS installer failed with exit code $($proc.ExitCode)" }
  $appExe = Join-Path $installDir 'Aura POS.exe'
  if (!(Test-Path $appExe)) { throw 'Installed application executable missing.' }
  $unpackedWorkerDir = Join-Path $installDir 'resources/app.asar.unpacked/electron'
  $requiredWorkerFiles = @('whatsapp-service.cjs', 'whatsapp-session.cjs', 'whatsapp-messaging.cjs', 'whatsapp-command-queue.cjs')
  foreach ($workerFile in $requiredWorkerFiles) {
    if (!(Test-Path (Join-Path $unpackedWorkerDir $workerFile))) { throw "Unpacked WhatsApp worker dependency missing: $workerFile" }
  }

  # Prefer the instrumented app that NSIS may have launched; otherwise start it explicitly.
  $appLaunchDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $appLaunchDeadline) {
    $installedMain = @(Get-CimInstance Win32_Process | Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath -ieq $appExe -and $_.CommandLine -notmatch '(?:^|\s)--type='
    } | Select-Object -First 1)
    if ($installedMain.Count -gt 0) {
      $app = Get-Process -Id ([int]$installedMain[0].ProcessId) -ErrorAction SilentlyContinue
      if ($app) { break }
    }
    Start-Sleep -Milliseconds 250
  }
  if (!$app) {
    Write-Host 'NSIS did not auto-launch the installed app; starting it with the smoke environment.'
    $app = Start-Process -FilePath $appExe -PassThru -WindowStyle Hidden
  } else {
    Write-Host "Using NSIS-launched installed app (PID $($app.Id)) with inherited smoke environment."
  }

  $readyDeadline = (Get-Date).AddMinutes(4)
  while (!(Test-Path $readyReport) -and (Get-Date) -lt $readyDeadline) {
    $app.Refresh()
    if ($app.HasExited) {
      $smokeErrorCode = 'unavailable'
      $serviceErrorCode = 'none'
      $serviceState = 'unknown'
      $serviceStateAtSoakStart = 'unknown'
      $serviceRestartCount = 'unknown'
      $servicePid = 'unknown'
      $supervisorEvents = 'none'
      $performanceSummary = 'unavailable'
      if (Test-Path $report) {
        try {
          $earlyReport = Get-Content $report -Raw | ConvertFrom-Json
          if ($earlyReport.errorCode -match '^[A-Z0-9_]{1,48}$') { $smokeErrorCode = $earlyReport.errorCode }
          if ($earlyReport.serviceErrorCode -match '^[A-Z0-9_]{1,48}$') { $serviceErrorCode = $earlyReport.serviceErrorCode }
          if ($earlyReport.serviceStateAtExit -match '^[a-z-]{1,24}$') { $serviceState = $earlyReport.serviceStateAtExit }
          if ($earlyReport.whatsappServiceStateAtSoakStart -match '^[a-z-]{1,24}$') { $serviceStateAtSoakStart = $earlyReport.whatsappServiceStateAtSoakStart }
          if ($null -ne $earlyReport.serviceRestartCount -and "$($earlyReport.serviceRestartCount)" -match '^\d{1,4}$') { $serviceRestartCount = $earlyReport.serviceRestartCount }
          if ($null -ne $earlyReport.servicePidAtExit -and "$($earlyReport.servicePidAtExit)" -match '^\d{1,10}$') { $servicePid = $earlyReport.servicePidAtExit }
          $eventCodes = @($earlyReport.serviceSupervisorLogCodes | Where-Object { $_ -match '^SERVICE_[A-Z0-9_]{1,48}$' })
          if ($eventCodes.Count -gt 0) { $supervisorEvents = $eventCodes -join ',' }
          $metricValues = @()
          foreach ($metricName in @('loadConversations','loadReplies','loadOrders','mainEventLoopP99Ms','serverEventLoopP99Ms','rendererEventLoopSamples','rendererEventLoopP95Ms','rendererEventLoopP99Ms','rendererEventLoopMaxMs')) {
            $metricValue = $earlyReport.$metricName
            if ($null -eq $metricValue -or "$metricValue" -notmatch '^\d+(?:\.\d{1,2})?$') { $metricValue = 'unknown' }
            $metricValues += "$metricName=$metricValue"
          }
          $performanceSummary = $metricValues -join ','
        } catch { $smokeErrorCode = 'unreadable' }
      }
      throw "Installed application exited before soak readiness ($($app.ExitCode); smokeError=$smokeErrorCode; serviceError=$serviceErrorCode; serviceState=$serviceState; serviceStateAtSoakStart=$serviceStateAtSoakStart; serviceRestarts=$serviceRestartCount; servicePid=$servicePid; supervisorEvents=$supervisorEvents; performance=$performanceSummary)."
    }
    Start-Sleep -Milliseconds 500
  }
  if (!(Test-Path $readyReport)) { throw 'Timed out waiting for installed load/QR readiness.' }
  $ready = Get-Content $readyReport -Raw | ConvertFrom-Json
  $readyRequired = @('healthReady','databaseReady','windowShown','trayHide','serverContinued','serviceContinued','whatsappRuntimeLoaded','qrObserved','performanceWithinTarget')
  foreach ($name in $readyRequired) { if ($ready.$name -ne $true) { throw "Installed readiness check failed: $name ($($ready.errorCode))" } }
  if ($ready.loadConversations -ne 20 -or $ready.loadReplies -ne 20 -or $ready.loadOrders -ne 0) { throw 'Installed 20-conversation load counts are invalid.' }
  if ([int]$ready.mainEventLoopSamples -lt 100 -or [int]$ready.serverEventLoopSamples -lt 100 -or [int]$ready.rendererEventLoopSamples -lt 100) { throw 'Installed event-loop p99 sample counts are insufficient.' }
  foreach ($metric in @('mainEventLoopP99Ms','serverEventLoopP99Ms','rendererEventLoopP99Ms')) {
    if ($null -eq $ready.$metric -or [double]$ready.$metric -gt 100) { throw "Installed event-loop p99 target failed: $metric=$($ready.$metric) ms." }
  }
  if ($null -eq $ready.whatsappServiceMemoryMb -or [double]$ready.whatsappServiceMemoryMb -ge 150) { throw "WhatsApp idle memory target failed: $($ready.whatsappServiceMemoryMb) MB." }
  if ($ready.PSObject.Properties.Name -contains 'qr' -or $ready.PSObject.Properties.Name -contains 'qrPayload') { throw 'Unsafe QR field in readiness report.' }

  # The Main process has warmed the SQLite/Gateway path, hidden its window, and reached Baileys QR.
  # Keep the installed app idle for at least 10 minutes, with a small measurement margin, while sampling its entire process tree.
  $resourceSamples = @()
  $observedProcessIdentities = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $cpuCount = [math]::Max(1, (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors)
  $lastSnapshot = Get-InstalledProcessSnapshot
  if ($lastSnapshot.processCount -lt 2) { throw "Expected the installed app and utility process; found $($lastSnapshot.processCount)." }
  foreach ($identity in $lastSnapshot.processIdentities) { [void]$observedProcessIdentities.Add([string]$identity) }
  $soakStartedAt = Get-Date
  $lastSampleAt = $soakStartedAt
  $nextSampleAt = $soakStartedAt.AddSeconds(2)
  $soakDeadline = $soakStartedAt.AddMinutes(10).AddSeconds(5)
  while ((Get-Date) -lt $soakDeadline) {
    $waitMilliseconds = [math]::Ceiling(($nextSampleAt - (Get-Date)).TotalMilliseconds)
    if ($waitMilliseconds -gt 0) { Start-Sleep -Milliseconds $waitMilliseconds }
    $app.Refresh()
    if ($app.HasExited) {
      $exitSummary = 'smokeReport=missing'
      if (Test-Path $report) {
        try {
          $exitReport = Get-Content $report -Raw | ConvertFrom-Json
          $exitErrorCode = if ($exitReport.errorCode -match '^[A-Z0-9_]{1,48}$') { $exitReport.errorCode } else { 'unknown' }
          $exitServiceError = if ($exitReport.serviceErrorCode -match '^[A-Z0-9_]{1,48}$') { $exitReport.serviceErrorCode } else { 'none' }
          $exitServiceState = if ($exitReport.serviceStateAtExit -match '^[a-z-]{1,24}$') { $exitReport.serviceStateAtExit } else { 'unknown' }
          $exitSoakStartState = if ($exitReport.whatsappServiceStateAtSoakStart -match '^[a-z-]{1,24}$') { $exitReport.whatsappServiceStateAtSoakStart } else { 'unknown' }
          $exitRestarts = if ($null -ne $exitReport.serviceRestartCount -and "$($exitReport.serviceRestartCount)" -match '^\d{1,4}$') { $exitReport.serviceRestartCount } else { 'unknown' }
          $exitServicePid = if ($null -ne $exitReport.servicePidAtExit -and "$($exitReport.servicePidAtExit)" -match '^\d{1,10}$') { $exitReport.servicePidAtExit } else { 'unknown' }
          $exitSoakMs = if ($null -ne $exitReport.soakDurationMs -and "$($exitReport.soakDurationMs)" -match '^\d{1,12}$') { $exitReport.soakDurationMs } else { 'unknown' }
          $eventCodes = @($exitReport.serviceSupervisorLogCodes | Where-Object { $_ -match '^SERVICE_[A-Z0-9_]{1,48}$' })
          $exitEvents = if ($eventCodes.Count -gt 0) { $eventCodes -join ',' } else { 'none' }
          $exitMetrics = @()
          foreach ($metricName in @('mainEventLoopP99Ms','serverEventLoopP99Ms','rendererEventLoopSamples','rendererEventLoopP95Ms','rendererEventLoopP99Ms','rendererEventLoopMaxMs')) {
            $metricValue = $exitReport.$metricName
            if ($null -eq $metricValue -or "$metricValue" -notmatch '^\d+(?:\.\d{1,2})?$') { $metricValue = 'unknown' }
            $exitMetrics += "$metricName=$metricValue"
          }
          $exitSummary = "smokeError=$exitErrorCode; serviceError=$exitServiceError; serviceState=$exitServiceState; serviceStateAtSoakStart=$exitSoakStartState; serviceRestarts=$exitRestarts; servicePid=$exitServicePid; soakDurationMs=$exitSoakMs; supervisorEvents=$exitEvents; p99=$($exitMetrics -join ',')"
        } catch { $exitSummary = 'smokeReport=unreadable' }
      }
      throw "Installed application exited during the 10-minute soak ($($app.ExitCode); $exitSummary)."
    }
    $snapshot = Get-InstalledProcessSnapshot
    foreach ($identity in $snapshot.processIdentities) { [void]$observedProcessIdentities.Add([string]$identity) }
    $now = Get-Date
    $elapsed = [math]::Max(0.1, ($now - $lastSampleAt).TotalSeconds)
    $cpuDeltaSeconds = $snapshot.cpuSeconds - $lastSnapshot.cpuSeconds
    if ($cpuDeltaSeconds -lt 0) { throw 'Application process CPU counters regressed during the soak.' }
    $cpuPercent = ($cpuDeltaSeconds / $elapsed / $cpuCount) * 100
    $systemCpuValues = @(Get-CimInstance Win32_Processor | Where-Object { $null -ne $_.LoadPercentage } | Select-Object -ExpandProperty LoadPercentage)
    $systemCpuPercent = if ($systemCpuValues.Count -gt 0) { [math]::Round((($systemCpuValues | Measure-Object -Average).Average), 2) } else { $null }
    $resourceSamples += [pscustomobject]@{
      timestampUtc = $now.ToUniversalTime().ToString('o')
      applicationCpuPercent = [math]::Round($cpuPercent, 2)
      cpuIntervalSeconds = [math]::Round($elapsed, 3)
      systemCpuPercent = $systemCpuPercent
      processCount = $snapshot.processCount
      processIds = $snapshot.processIds
      processIdentities = $snapshot.processIdentities
      handleCount = $snapshot.handleCount
      workingSetMB = [math]::Round($snapshot.workingSetBytes / 1MB, 1)
      privateMemoryMB = [math]::Round($snapshot.privateMemoryBytes / 1MB, 1)
    }
    $lastSnapshot = $snapshot
    $lastSampleAt = $now
    $nextSampleAt = $now.AddSeconds(2)
  }
  $soakDurationSeconds = [math]::Round(((Get-Date) - $soakStartedAt).TotalSeconds, 1)
  if ($soakDurationSeconds -lt 600) { throw "Installed soak lasted only $soakDurationSeconds seconds." }
  if ($resourceSamples.Count -lt 270) { throw "Insufficient process/resource samples: $($resourceSamples.Count)." }

  $initialWindow = @($resourceSamples | Select-Object -First 30)
  $finalWindow = @($resourceSamples | Select-Object -Last 30)
  $lastFiveMinutesSince = (Get-Date).ToUniversalTime().AddMinutes(-5).AddSeconds(-2)
  $lastFiveMinutes = @($resourceSamples | Where-Object { [DateTimeOffset]::Parse($_.timestampUtc).UtcDateTime -ge $lastFiveMinutesSince })
  if ($lastFiveMinutes.Count -lt 120) { throw "Insufficient samples for an actual five-minute idle CPU average: $($lastFiveMinutes.Count)." }
  $lastFiveMinuteTimes = @($lastFiveMinutes | ForEach-Object { [DateTimeOffset]::Parse($_.timestampUtc).UtcDateTime })
  $lastFiveMinutesCoverageSeconds = ($lastFiveMinuteTimes[-1] - $lastFiveMinuteTimes[0]).TotalSeconds
  if ($lastFiveMinutesCoverageSeconds -lt 300) { throw "Last-five-minute sample coverage was only $([math]::Round($lastFiveMinutesCoverageSeconds, 1)) seconds." }
  $cpuIntervalWeightSeconds = [double](($lastFiveMinutes | Measure-Object -Property cpuIntervalSeconds -Sum).Sum)
  if ($cpuIntervalWeightSeconds -lt 300) { throw "Application CPU intervals covered only $([math]::Round($cpuIntervalWeightSeconds, 1)) seconds." }
  $initialPrivateMB = [double](($initialWindow | Measure-Object -Property privateMemoryMB -Average).Average)
  $peakPrivateMB = [double](($resourceSamples | Measure-Object -Property privateMemoryMB -Maximum).Maximum)
  $finalPrivateMB = [double](($finalWindow | Measure-Object -Property privateMemoryMB -Average).Average)
  $privatePeakGrowthPercent = if ($initialPrivateMB -gt 0) { [math]::Round((($peakPrivateMB - $initialPrivateMB) / $initialPrivateMB) * 100, 2) } else { 999.0 }
  $privateFinalGrowthPercent = if ($initialPrivateMB -gt 0) { [math]::Round((($finalPrivateMB - $initialPrivateMB) / $initialPrivateMB) * 100, 2) } else { 999.0 }
  $initialHandles = [double](($initialWindow | Measure-Object -Property handleCount -Average).Average)
  $peakHandles = [double](($resourceSamples | Measure-Object -Property handleCount -Maximum).Maximum)
  $finalHandles = [double](($finalWindow | Measure-Object -Property handleCount -Average).Average)
  $peakHandleGrowthPercent = if ($initialHandles -gt 0) { [math]::Round((($peakHandles - $initialHandles) / $initialHandles) * 100, 2) } else { 999.0 }
  $finalHandleGrowthPercent = if ($initialHandles -gt 0) { [math]::Round((($finalHandles - $initialHandles) / $initialHandles) * 100, 2) } else { 999.0 }
  $processCounts = @($resourceSamples | Select-Object -ExpandProperty processCount | Sort-Object -Unique)
  $processCountStable = $processCounts.Count -eq 1
  $processIdentitySets = @($resourceSamples | ForEach-Object { (@($_.processIdentities | Sort-Object) -join ',') } | Sort-Object -Unique)
  $processIdentityStable = $processIdentitySets.Count -eq 1
  $weightedApplicationCpu = ($lastFiveMinutes | ForEach-Object { [double]$_.applicationCpuPercent * [double]$_.cpuIntervalSeconds } | Measure-Object -Sum).Sum
  $idleApplicationCpuPercent = [math]::Round(($weightedApplicationCpu / $cpuIntervalWeightSeconds), 2)
  $systemCpuSamples = @($lastFiveMinutes | Where-Object { $null -ne $_.systemCpuPercent })
  if ($systemCpuSamples.Count -lt 100) { throw "Insufficient total-system CPU samples in the last five minutes: $($systemCpuSamples.Count)." }
  $idleSystemCpuPercent = if ($systemCpuSamples.Count -gt 0) { [math]::Round((($systemCpuSamples | Measure-Object -Property systemCpuPercent -Average).Average), 2) } else { $null }
  $systemCpuTargetMet = $null -ne $idleSystemCpuPercent -and $idleSystemCpuPercent -le 2.0
  $peakWorkingSetMB = [double](($resourceSamples | Measure-Object -Property workingSetMB -Maximum).Maximum)
  $summary = [pscustomobject]@{
    soakDurationSeconds = $soakDurationSeconds
    samples = $resourceSamples.Count
    lastFiveMinutesCoverageSeconds = [math]::Round($lastFiveMinutesCoverageSeconds, 1)
    lastFiveMinutesCpuIntervalSeconds = [math]::Round($cpuIntervalWeightSeconds, 1)
    idleApplicationCpuAveragePercentLast5Min = $idleApplicationCpuPercent
    idleSystemCpuAveragePercentLast5Min = $idleSystemCpuPercent
    idleSystemCpuTarget0To2PercentMet = $systemCpuTargetMet
    initialPrivateMemoryAverageMB = [math]::Round($initialPrivateMB, 1)
    peakPrivateMemoryMB = [math]::Round($peakPrivateMB, 1)
    finalPrivateMemoryAverageMB = [math]::Round($finalPrivateMB, 1)
    privateMemoryPeakGrowthPercent = $privatePeakGrowthPercent
    privateMemoryFinalGrowthPercent = $privateFinalGrowthPercent
    initialHandleAverage = [math]::Round($initialHandles, 0)
    peakHandleCount = [math]::Round($peakHandles, 0)
    finalHandleAverage = [math]::Round($finalHandles, 0)
    peakHandleGrowthPercent = $peakHandleGrowthPercent
    finalHandleGrowthPercent = $finalHandleGrowthPercent
    stableProcessCount = $processCountStable
    stableProcessIdentity = $processIdentityStable
    processIdentitySetCount = $processIdentitySets.Count
    processCountValues = $processCounts
    peakWorkingSetMB = [math]::Round($peakWorkingSetMB, 1)
    p99BaselineComparisonAvailable = $false
    p99BaselineComparisonReason = 'No prior Windows baseline with the same 20-conversation WhatsApp workload.'
    whatsappServiceIdleMemoryAtReadinessMB = [double]$ready.whatsappServiceMemoryMb
  }
  $resourceReport = [pscustomobject]@{
    schema = 2
    os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
    summary = $summary
    samples = $resourceSamples
  }
  $resourceReport | ConvertTo-Json -Depth 6 | Set-Content -Path $resourceSamplePath -Encoding utf8
  if ($env:GITHUB_STEP_SUMMARY) {
    @"
## Windows installed smoke and 10-minute idle soak

- OS: $($resourceReport.os)
- Soak: $soakDurationSeconds seconds / $($resourceSamples.Count) samples
- Load p99 Main/server/renderer: $($ready.mainEventLoopP99Ms)/$($ready.serverEventLoopP99Ms)/$($ready.rendererEventLoopP99Ms) ms
- Idle application CPU, last five minutes: $idleApplicationCpuPercent%; total system CPU: $idleSystemCpuPercent% (0–2% target met: $systemCpuTargetMet)
- p99 baseline comparison unavailable: no prior Windows baseline with the same 20-conversation workload; absolute 100ms target is enforced.
- Private memory: start average $([math]::Round($initialPrivateMB,1)) MB; peak $([math]::Round($peakPrivateMB,1)) MB; peak growth $privatePeakGrowthPercent%
- Handles: start average $([math]::Round($initialHandles,0)); peak $([math]::Round($peakHandles,0)); peak growth $peakHandleGrowthPercent%
- Process count/identity stable: $processCountStable/$processIdentityStable ($($processCounts -join ', ')); WhatsApp idle service memory: $($ready.whatsappServiceMemoryMb) MB
"@ | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8
    if (!$systemCpuTargetMet) { '- Total-system CPU target was not met; it includes unrelated runner processes, while application CPU is measured separately.' | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
  }

  if ($privatePeakGrowthPercent -gt 10.0) { throw "Private memory peak growth exceeded 10%: $privatePeakGrowthPercent%." }
  if ($peakHandleGrowthPercent -gt 10.0) { throw "Handle growth exceeded 10%: $peakHandleGrowthPercent%." }
  if (!$processCountStable) { throw "Installed process count changed during soak: $($processCounts -join ', ')." }
  if (!$processIdentityStable) { throw "Installed process identities changed during soak ($($processIdentitySets.Count) distinct PID sets)." }
  if ($idleApplicationCpuPercent -gt 2.0) { throw "Installed app idle CPU exceeded 2% over the final five minutes: $idleApplicationCpuPercent%." }

  New-Item -ItemType File -Path $stopSignal -Force | Out-Null
  $finalReportDeadline = (Get-Date).AddSeconds(60)
  while (!(Test-Path $report) -and (Get-Date) -lt $finalReportDeadline) {
    $app.Refresh()
    if ($app.HasExited -and !(Test-Path $report)) { throw "Installed app exited before final soak report ($($app.ExitCode))." }
    Start-Sleep -Milliseconds 500
  }
  if (!(Test-Path $report)) { throw 'Timed out waiting for final installed smoke report.' }
  $smoke = Get-Content $report -Raw | ConvertFrom-Json
  if ($smoke.ok -ne $true -or $smoke.soakCompleted -ne $true -or [double]$smoke.soakDurationMs -lt 600000) { throw "Final installed smoke failed: $($smoke.errorCode)." }
  if ($null -eq $smoke.whatsappServiceMemoryMb -or [double]$smoke.whatsappServiceMemoryMb -ge 150) { throw "WhatsApp idle service memory peak exceeded 150 MB or was unavailable: $($smoke.whatsappServiceMemoryMb) MB." }
  if ($env:GITHUB_STEP_SUMMARY) { "- WhatsApp state at soak start/end: $($smoke.whatsappServiceStateAtSoakStart)/$($smoke.whatsappServiceStateAtSoakEnd); QR observed: $($smoke.qrObserved); this does not claim an account was linked." | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
  if ($smoke.PSObject.Properties.Name -contains 'qr' -or $smoke.PSObject.Properties.Name -contains 'qrPayload') { throw 'Unsafe QR field in final smoke report.' }
  $summary | Add-Member -NotePropertyName whatsappServiceIdleMemoryPeakMB -NotePropertyValue ([double]$smoke.whatsappServiceMemoryMb) -Force
  $resourceReport | ConvertTo-Json -Depth 6 | Set-Content -Path $resourceSamplePath -Encoding utf8
  if ($env:GITHUB_STEP_SUMMARY) { "- WhatsApp Utility idle-memory peak over the soak: $($smoke.whatsappServiceMemoryMb) MB (<150 MB)." | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8 }

  $app.Refresh()
  if (!$app.HasExited) { Wait-Process -Id $app.Id -Timeout 30 -ErrorAction SilentlyContinue }
  $app.Refresh()
  if (!$app.HasExited) { Stop-Process -Id $app.Id -Force; throw 'Application did not exit after smoke.' }
  Start-Sleep -Seconds 3
  $orphans = @(Get-CimInstance Win32_Process | Where-Object {
    $creation = $_.CreationDate
    if ($creation -is [datetime]) { $creation = $creation.ToUniversalTime().ToString('o') }
    $observedProcessIdentities.Contains("$([int]$_.ProcessId)|$creation")
  })
  if ($orphans) { $orphans | ForEach-Object { Write-Host "Orphan PID $($_.ProcessId)" }; throw 'Installed application left child processes running.' }
  $databaseFilePath = [string]$smoke.databaseFilePath
  if ([string]::IsNullOrWhiteSpace($databaseFilePath) -or ![System.IO.Path]::IsPathRooted($databaseFilePath) -or [System.IO.Path]::GetFileName($databaseFilePath) -ne 'aura.sqlite' -or !(Test-Path -LiteralPath $databaseFilePath -PathType Leaf)) { throw 'Smoke database is missing or empty.' }
  $db = Get-Item -LiteralPath $databaseFilePath -Force
  if ($db.Length -le 0) { throw 'Smoke database is missing or empty.' }

  # Verify that the isolated Baileys dependency is the pinned release used to reach QR.
  $runtime = Join-Path $installDir 'resources/whatsapp-runtime'
  $baileysPackage = Join-Path $runtime 'node_modules/@whiskeysockets/baileys/package.json'
  if (!(Test-Path $baileysPackage)) { throw 'Packaged Baileys runtime is missing.' }
  $baileys = Get-Content $baileysPackage -Raw | ConvertFrom-Json
  if ($baileys.version -ne '6.7.24') { throw "Unexpected packaged Baileys version: $($baileys.version)" }

  # Inspect the ASAR and unpacked runtime; never emit file contents.
  $resources = Join-Path $installDir 'resources'
  $appAsar = Join-Path $resources 'app.asar'
  $unpacked = Join-Path $resources 'app.asar.unpacked'
  $scanRoot = Join-Path $root 'asar-extracted'
  if (!(Test-Path $appAsar)) { throw 'Packaged app.asar missing.' }
  npx --no-install asar extract $appAsar $scanRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not extract app.asar for security scan.' }
  $scanRoots = @($scanRoot, $unpacked, $runtime) | Where-Object { Test-Path $_ }
  $forbidden = Get-ChildItem -Path $scanRoots -Force -Recurse -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^\.env($|\.)' -or $_.FullName -match '(^|[\\/])mini-services[\\/]ai-gateway([\\/]|$)'
  }
  if ($forbidden) { throw "Forbidden package content detected: $($forbidden[0].Name)" }
  $files = Get-ChildItem -Path $scanRoots -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
      $buffer = [byte[]]::new(1048576)
      $carry = [byte[]]@()
      while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $text = [Text.Encoding]::ASCII.GetString($carry) + [Text.Encoding]::ASCII.GetString($buffer, 0, $read)
        if ($text -match 'AIza[0-9A-Za-z_-]{30,}') { throw "Google API key value detected in packaged file: $($file.Name)" }
        $carryLength = [math]::Min(128, $read)
        $carry = [byte[]]::new($carryLength)
        if ($carryLength -gt 0) { [Array]::Copy($buffer, $read - $carryLength, $carry, 0, $carryLength) }
      }
    } finally { $stream.Dispose() }
  }
  Write-Host "Installed smoke passed; DB bytes=$($db.Length); Baileys=$($baileys.version); load p99 Main/server/renderer=$($ready.mainEventLoopP99Ms)/$($ready.serverEventLoopP99Ms)/$($ready.rendererEventLoopP99Ms)ms; idle app CPU=$idleApplicationCpuPercent%; system CPU=$idleSystemCpuPercent%; private memory peak growth=$privatePeakGrowthPercent%; handle peak growth=$peakHandleGrowthPercent%; processes stable=$processCountStable; process identities stable=$processIdentityStable; WhatsApp service peak=$($smoke.whatsappServiceMemoryMb)MB."
} finally {
  if ($app) {
    $app.Refresh()
    if (!$app.HasExited) {
      try { & taskkill.exe /PID $app.Id /T /F | Out-Null } catch { }
    }
  }
  if ($observedProcessIdentities) {
    try {
      $remainingProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $creation = $_.CreationDate
        if ($creation -is [datetime]) { $creation = $creation.ToUniversalTime().ToString('o') }
        $observedProcessIdentities.Contains("$([int]$_.ProcessId)|$creation")
      })
      foreach ($entry in $remainingProcesses) { Stop-Process -Id $entry.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch { Write-Host 'Could not inspect or clean remaining installed-app processes after smoke.' }
  }
  if ($gateway) {
    $gateway.Refresh()
    if (!$gateway.HasExited) { Stop-Process -Id $gateway.Id -Force -ErrorAction SilentlyContinue }
  }
  Remove-Item Env:AURA_INSTALLED_SMOKE -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_INSTALLED_SMOKE_REPORT -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_INSTALLED_SMOKE_READY -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_INSTALLED_SMOKE_STOP -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_AI_INSTALL_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_AI_GATEWAY_URL -ErrorAction SilentlyContinue
  Remove-Item Env:AURA_WINDOWS_SMOKE_GATEWAY_READY -ErrorAction SilentlyContinue
  Remove-Item -Path $root -Recurse -Force -ErrorAction SilentlyContinue
}
