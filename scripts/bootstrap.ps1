$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { winget install OpenJS.NodeJS.LTS }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { winget install Git.Git }
if (-not (Get-Command llama-server -ErrorAction SilentlyContinue)) { winget install ggml.llamacpp }
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npx playwright install chromium
node packages/cli/dist/index.js --verbose model setup
