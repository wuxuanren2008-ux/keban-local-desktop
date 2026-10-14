param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$TestRoot,[int]$DebugPort=11741)
$ErrorActionPreference='Stop'
$fullRoot=[System.IO.Path]::GetFullPath($TestRoot)
if(Test-Path -LiteralPath (Join-Path $fullRoot 'profile')){throw 'Use a new, isolated test directory'}
foreach($folder in @('profile','home','appdata','localappdata','temp')){New-Item -ItemType Directory -Path (Join-Path $fullRoot $folder) -Force | Out-Null}
$startInfo=New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName=[System.IO.Path]::GetFullPath($Executable)
$startInfo.UseShellExecute=$false
$startInfo.ArgumentList.Add("--remote-debugging-port=$DebugPort")
$startInfo.Environment['PATH']="$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\Wbem"
foreach($key in @('PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','NODE_PATH','CONDA_PREFIX','LECTURE_DEFAULT_LLM','LECTURE_APP_EXE')){$startInfo.Environment.Remove($key) | Out-Null}
$startInfo.Environment['LECTURE_TEST_DATA']=Join-Path $fullRoot 'profile'
$startInfo.Environment['USERPROFILE']=Join-Path $fullRoot 'home'
$startInfo.Environment['HOME']=Join-Path $fullRoot 'home'
$startInfo.Environment['APPDATA']=Join-Path $fullRoot 'appdata'
$startInfo.Environment['LOCALAPPDATA']=Join-Path $fullRoot 'localappdata'
$startInfo.Environment['TEMP']=Join-Path $fullRoot 'temp'
$startInfo.Environment['TMP']=Join-Path $fullRoot 'temp'
$startInfo.Environment['HF_HOME']=Join-Path $fullRoot 'home/huggingface'
$startInfo.Environment['OLLAMA_MODELS']=Join-Path $fullRoot 'home/ollama-models'
$process=[System.Diagnostics.Process]::Start($startInfo)
[ordered]@{pid=$process.Id;executable=$startInfo.FileName;root=$fullRoot;debugPort=$DebugPort;isolatedPath=$startInfo.Environment['PATH']} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fullRoot 'launch.json') -Encoding utf8
Write-Output "Test process $($process.Id) launched; isolated profile and system-only PATH"
