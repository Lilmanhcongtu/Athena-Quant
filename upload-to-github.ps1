$ErrorActionPreference = "Stop"

# Create a classic GitHub token with repo permission:
# https://github.com/settings/tokens
#
# Recommended:
#   $env:GITHUB_TOKEN = "paste_your_token_here"
#   powershell -ExecutionPolicy Bypass -File .\upload-to-github.ps1
$GitHubToken = $env:GITHUB_TOKEN

$Owner = "Lilmanhcongtu"
$Repo = "Athena-Quant"
$Branch = "main"
$Project = "C:\Users\nguye\Documents\Codex\2026-05-13\elite-ai-sports-betting-intelligence-platform"

if (-not $GitHubToken) {
  $secureToken = Read-Host "Paste your GitHub token" -AsSecureString
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $GitHubToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
}

if (-not $GitHubToken) {
  throw "GitHub token is required."
}

$Headers = @{
  Authorization = "Bearer $GitHubToken"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent" = "Athena-Quant-Uploader"
}

function ConvertTo-GitHubPath {
  param([string]$Path)
  return (($Path -split "/") | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join "/"
}

function Get-GitHubContent {
  param([string]$Path)
  $encodedPath = ConvertTo-GitHubPath $Path
  $uri = "https://api.github.com/repos/$Owner/$Repo/contents/$encodedPath`?ref=$Branch"
  try {
    return Invoke-RestMethod -Headers $Headers -Uri $uri -Method Get
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
      return $null
    }
    throw
  }
}

function Send-GitHubFile {
  param(
    [string]$LocalPath,
    [string]$RepoPath
  )

  $existing = Get-GitHubContent $RepoPath
  $encodedPath = ConvertTo-GitHubPath $RepoPath
  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($LocalPath))

  $body = @{
    message = "Update Athena Quant platform files"
    content = $content
    branch = $Branch
  }

  if ($existing -and $existing.sha) {
    $body.sha = $existing.sha
  }

  $json = $body | ConvertTo-Json -Depth 6
  $uri = "https://api.github.com/repos/$Owner/$Repo/contents/$encodedPath"
  Invoke-RestMethod -Headers $Headers -Uri $uri -Method Put -Body $json -ContentType "application/json" | Out-Null
  Write-Host "Uploaded $RepoPath"
}

function Remove-GitHubFile {
  param([string]$RepoPath)

  $existing = Get-GitHubContent $RepoPath
  if (-not $existing) {
    return
  }

  $encodedPath = ConvertTo-GitHubPath $RepoPath
  $body = @{
    message = "Remove accidental upload artifact"
    sha = $existing.sha
    branch = $Branch
  } | ConvertTo-Json -Depth 6

  $uri = "https://api.github.com/repos/$Owner/$Repo/contents/$encodedPath"
  Invoke-RestMethod -Headers $Headers -Uri $uri -Method Delete -Body $body -ContentType "application/json" | Out-Null
  Write-Host "Removed $RepoPath"
}

Write-Host "Checking repository $Owner/$Repo..."
Invoke-RestMethod -Headers $Headers -Uri "https://api.github.com/repos/$Owner/$Repo" -Method Get | Out-Null

$excludedDirs = @(".git", ".cache", "node_modules")
$excludedFiles = @(".env.local", "athena-quant-github-ready.zip", "upload-to-github.ps1")

$files = Get-ChildItem -LiteralPath $Project -Recurse -File -Force | Where-Object {
  $relative = $_.FullName.Substring($Project.Length).TrimStart("\") -replace "\\", "/"
  $parts = $relative -split "/"
  $excludedDirs -notcontains $parts[0] -and
  $relative -ne "data/athena-intelligence-store.json" -and
  $excludedFiles -notcontains $_.Name -and
  $_.Extension -ne ".zip"
}

foreach ($file in $files) {
  $relative = $file.FullName.Substring($Project.Length).TrimStart("\") -replace "\\", "/"
  Send-GitHubFile -LocalPath $file.FullName -RepoPath $relative
}

# These were created by the browser upload/download flow and are not part of the app.
@(
  "download",
  "download (1)",
  "styles.css",
  "athena-quant-logo.svg"
) | ForEach-Object {
  Remove-GitHubFile $_
}

Write-Host ""
Write-Host "Done. Repo repaired: https://github.com/$Owner/$Repo"
Write-Host "Important: .env.local was NOT uploaded. Add ODDS_API_KEY in your hosting provider instead."
