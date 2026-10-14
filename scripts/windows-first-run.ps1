param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$TestRoot,[int]$DebugPort=11741,[switch]$AllowModels)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'launch-clean-windows.ps1') -Executable $Executable -TestRoot $TestRoot -DebugPort $DebugPort
$launch=Get-Content -LiteralPath (Join-Path $TestRoot 'launch.json') -Raw | ConvertFrom-Json
$connection=$null;$passed=$false;$commandId=0
function Invoke-CDP([string]$Method,[hashtable]$Parameters) {
    $script:commandId++
    $message=@{id=$script:commandId;method=$Method;params=$Parameters}|ConvertTo-Json -Depth 16 -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($message)
    $deadline=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(30))
    try {
        $connection.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,$deadline.Token).GetAwaiter().GetResult()
        do {
            $buffer=New-Object byte[] 65536;$stream=[IO.MemoryStream]::new()
            try {
                do {$packet=$connection.ReceiveAsync([ArraySegment[byte]]::new($buffer),$deadline.Token).GetAwaiter().GetResult();if($packet.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close){throw 'App closed the debug connection'};$stream.Write($buffer,0,$packet.Count)}while(-not $packet.EndOfMessage)
                $response=[Text.Encoding]::UTF8.GetString($stream.ToArray())|ConvertFrom-Json
            } finally {$stream.Dispose()}
        }while($response.id -ne $script:commandId)
        if($response.error){throw ($response.error|ConvertTo-Json -Compress)}
        return $response.result
    } finally {$deadline.Dispose()}
}
function Invoke-App([string]$Expression) {
    $result=Invoke-CDP 'Runtime.evaluate' @{expression=$Expression;awaitPromise=$true;returnByValue=$true}
    if($result.exceptionDetails){throw ($result.exceptionDetails|ConvertTo-Json -Depth 5 -Compress)}
    return $result.result.value
}
try {
    $watch=[Diagnostics.Stopwatch]::StartNew();$page=$null
    while($watch.Elapsed.TotalSeconds -lt 190){
        try {$targets=Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list" -TimeoutSec 2;$page=$targets|Where-Object {$_.type -eq 'page' -and $_.url -match '^http://127\.0\.0\.1:\d+/'}|Select-Object -First 1}catch{}
        if($page){break};Start-Sleep -Milliseconds 400
    }
    if(-not $page){throw 'No classroom window after first launch; inspect startup.log/runtime.log'}
    $connection=[Net.WebSockets.ClientWebSocket]::new()
    $connection.ConnectAsync([Uri]$page.webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
    do {
        $boot=Invoke-App "({courses:document.querySelector('#courseSelect')?.options.length||0,modelControls:!!document.querySelector('#localSettings'),captureControls:!!document.querySelector('#captureSource'),tokenReady:!!window.localToken,status:document.querySelector('#reliabilityStatus')?.textContent||''})"
        if($boot.courses -gt 0 -and $boot.tokenReady){break};Start-Sleep -Milliseconds 400
    }while($watch.Elapsed.TotalSeconds -lt 190)
    if($boot.courses -lt 1 -or -not $boot.modelControls -or -not $boot.captureControls){throw 'Classroom UI failed to initialize'}
    $health=Invoke-App "(async()=>{const response=await fetch('/api/health',{headers:{'X-Lecture-Token':window.localToken}});return {status:response.status,...await response.json()}})()"
    if($health.status -ne 200 -or -not $health.ready){throw 'Local runtime is not healthy'}
    if(-not $AllowModels -and ($health.asr.ready -or $health.llm.ready)){throw 'Fresh-machine test unexpectedly inherited available AI models'}
    $archive=Invoke-App "(async()=>{const headers={'X-Lecture-Token':window.localToken,'Content-Type':'application/json'};const c=await fetch('/api/courses',{method:'POST',headers,body:JSON.stringify({name:'First run QA'})});if(!c.ok)throw Error('Course creation failed');const course=await c.json();const id=crypto.randomUUID();const snapshot={id,course_id:course.id,title:'Fresh machine startup QA',language:'en-US',transcript:[{text:'Clean startup works before model setup.',translation:'首次运行可在准备模型之前打开。',time:'00:00'}],notes:'Synthetic portability test'};const saved=await fetch('/api/lectures',{method:'POST',headers,body:JSON.stringify(snapshot)});if(!saved.ok)throw Error('Lecture save failed');const row=await fetch('/api/lectures/'+id,{headers});return {saveStatus:saved.status,readStatus:row.status,title:(await row.json()).title,unauthenticated:(await fetch('/api/ready')).status}})()"
    if($archive.readStatus -ne 200 -or $archive.title -ne 'Fresh machine startup QA' -or $archive.unauthenticated -ne 403){throw 'Archive/security checks failed'}
    $image=Invoke-CDP 'Page.captureScreenshot' @{format='png'}
    [IO.File]::WriteAllBytes((Join-Path $TestRoot 'first-run.png'),[Convert]::FromBase64String($image.data))
    [ordered]@{status='PASS';elapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds,2);os=[Environment]::OSVersion.VersionString;architecture=$env:PROCESSOR_ARCHITECTURE;app=$Executable;modelsAvailable=$health.llm.ready;asrAvailable=$health.asr.ready;courseArchive=$archive;ui=$boot}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $TestRoot 'result.json') -Encoding utf8
    $passed=$true;Write-Output 'PASS: actual EXE wrapper, system-only PATH, fresh profile/cache/temp, no preinstalled models, native classroom UI, local archive and authenticated API'
} catch {
    $_.Exception.Message|Set-Content -LiteralPath (Join-Path $TestRoot 'failure.txt') -Encoding utf8
    foreach($name in @('startup.log','runtime.log')){$file=Join-Path $TestRoot "profile/classroom-data/$name";if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Tail 20}}
    throw
} finally {
    if($connection -and $connection.State -eq [Net.WebSockets.WebSocketState]::Open){try {Invoke-App 'window.close()'|Out-Null}catch{};$connection.Dispose()}
    # Cleanup is limited to executables within this fresh, task-owned test tree.
    Start-Sleep -Seconds 2
    $testProcesses=Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith([IO.Path]::GetFullPath($TestRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)}
    foreach($testProcess in $testProcesses){Stop-Process -Id $testProcess.ProcessId -ErrorAction SilentlyContinue}
}
