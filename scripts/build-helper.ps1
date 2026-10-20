$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root ".venv-build"
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
    if (Get-Command uv -ErrorAction SilentlyContinue) { uv venv $venv --python 3.11 -q } else { python -m venv $venv }
}
# o auxiliar não tem dependências de runtime: só o PyInstaller
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv pip install --python $python -q pyinstaller
} else {
    & $python -m pip install -q pyinstaller
}
$work = Join-Path $root "build"
$helper = Join-Path $root "helper"
& $python -m PyInstaller --noconfirm --onefile --noconsole --log-level WARN `
    --name viewer-helper `
    --distpath (Join-Path $root "bin") `
    --workpath $work `
    --specpath $work `
    --paths $helper `
    --add-data "$(Join-Path $helper 'web');web" `
    (Join-Path $helper "launcher.py")
if ($LASTEXITCODE -ne 0) { throw "PyInstaller falhou" }
Get-Item (Join-Path $root "bin\viewer-helper.exe") | Select-Object Name, Length
