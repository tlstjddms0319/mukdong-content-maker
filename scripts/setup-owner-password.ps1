$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.local'
$hashScript = Join-Path $PSScriptRoot 'hash-owner-password.mjs'
$secure = Read-Host '관리자 암호' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($plain)) { throw '비어 있지 않은 관리자 암호를 입력하세요.' }
  $OutputEncoding = New-Object System.Text.UTF8Encoding $false
  $assignments = @($plain | node $hashScript)
  if ($LASTEXITCODE -ne 0 -or $assignments.Count -ne 2 -or
      $assignments[0] -notmatch '^OWNER_PASSWORD_HASH=scrypt:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$' -or
      $assignments[1] -notmatch '^AUTH_SECRET=[A-Za-z0-9_-]+$') {
    throw '관리자 로그인 값 생성에 실패했습니다. 설정 파일은 변경되지 않았습니다.'
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable plain -ErrorAction SilentlyContinue
}

$existing = if ([IO.File]::Exists($envPath)) { [IO.File]::ReadAllText($envPath) } else { '' }
$newline = if ($existing.Contains("`r`n")) { "`r`n" } else { "`n" }
$retained = [regex]::Replace($existing, '(?m)^(?:OWNER_PASSWORD_HASH|AUTH_SECRET)=.*(?:\r?\n|$)', '')
$separator = if ($retained.Length -gt 0 -and -not $retained.EndsWith("`n")) { $newline } else { '' }
$updated = $retained + $separator + ($assignments -join $newline) + $newline
$temporary = Join-Path $projectRoot ('.env.local.' + [guid]::NewGuid().ToString('N') + '.tmp')
$backup = Join-Path $projectRoot ('.env.local.' + [guid]::NewGuid().ToString('N') + '.backup')
$replaced = $false
try {
  [IO.File]::WriteAllText($temporary, $updated, (New-Object System.Text.UTF8Encoding $false))
  if ([IO.File]::Exists($envPath)) {
    [IO.File]::Replace($temporary, $envPath, $backup)
  } else {
    [IO.File]::Move($temporary, $envPath)
  }
  $replaced = $true
} finally {
  if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
  if ($replaced -and [IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
}
Write-Host '관리자 로그인 설정이 저장됐습니다. 앱을 다시 시작하세요.'
