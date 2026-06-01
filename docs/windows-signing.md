# Windows Signing

Nexus Draft uses Azure Artifact Signing through `electron-builder` for signed Windows release builds.

## Azure Setup

- Artifact Signing account: `NexusDraft`
- Certificate profile: `NexusDraft`
- Publisher name: `Alexander Guo`

The signing identity used locally or in CI must have permission to sign with that certificate profile.

## Environment

Set these before running a signed build:

```powershell
$env:AZURE_TENANT_ID = "<tenant-id>"
$env:AZURE_CLIENT_ID = "<client-id>"
$env:AZURE_CLIENT_SECRET = "<client-secret>"
$env:AZURE_SIGNING_ENDPOINT = "https://eus.codesigning.azure.net/"
```

Optional overrides:

```powershell
$env:AZURE_SIGNING_ACCOUNT_NAME = "NexusDraft"
$env:AZURE_SIGNING_CERTIFICATE_PROFILE_NAME = "NexusDraft"
$env:AZURE_SIGNING_PUBLISHER_NAME = "Alexander Guo"
```

The endpoint must match the Azure region where the Artifact Signing account and certificate profile were created. NexusDraft is currently in East US, so `https://eus.codesigning.azure.net/` is used by default if `AZURE_SIGNING_ENDPOINT` is not set.

## Build

```powershell
npm run dist:win:signed
```

This builds the app and signs the Windows installer/portable artifacts. Timestamping is enabled through Microsoft's Artifact Signing timestamp service so signatures remain valid after the short-lived signing certificate expires.

## Tauri Rust EXE Build

The Rust desktop migration builds side-by-side with Electron. Use this when you want the real Rust-backed `NexusDraft.exe` process instead of an Electron process:

```powershell
npm run tauri:dist
```

This stages:

- `release\NexusDraft.exe`
- `release\Nexus-Draft-Tauri-Portable-3.11.0.exe`
- `release\Nexus-Draft-Tauri-Setup-3.11.0.exe`

For quick Rust desktop fixes, build only the portable EXE:

```powershell
npm run tauri:portable
```

This stages `release\NexusDraft.exe` and `release\Nexus-Draft-Tauri-Portable-3.11.0.exe` without rebuilding the installer.

If disk space is tight after a successful build, use:

```powershell
npm run tauri:dist:clean
```

That stages the same artifacts, then removes the generated Rust `target` directory.

## Local Azure CLI Signing

If you can sign in locally with an Azure account that has the `Artifact Signing Certificate Profile Signer` role, you can avoid service-principal secrets and sign the built release artifacts with SignTool.

Install prerequisites:

```powershell
winget install -e --id Microsoft.AzureCLI
winget install -e --id Microsoft.Azure.ArtifactSigningClientTools
```

Sign in:

```powershell
az login
```

If `az` is not on `PATH` yet, reopen PowerShell or run it directly:

```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" login
```

If Azure CLI reports a permission error under `C:\Users\alexa\.azure`, use a repo-local config directory:

```powershell
$env:AZURE_CONFIG_DIR = "$PWD\.azure-cli"
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" login
```

If the Artifact Signing DLL is not found automatically, set it explicitly:

```powershell
$env:AZURE_CODESIGNING_DLIB_PATH = "$env:LOCALAPPDATA\Microsoft\MicrosoftArtifactSigningClientTools\Azure.CodeSigning.Dlib.dll"
```

Then build and sign:

```powershell
npm run dist:win:azcli
```

This path uses the same Artifact Signing account/profile defaults and the East US endpoint. It signs the generated release installer and portable `.exe` files after `electron-builder` packages them.

To sign only the Tauri/Rust artifacts after `npm run tauri:dist`:

```powershell
npm run release:sign:tauri:azcli
```

To sign both Electron and Tauri artifacts in the same release directory:

```powershell
npm run release:sign:all:azcli
```

## Verify

```powershell
Get-AuthenticodeSignature .\release\Nexus-Draft-Setup-3.11.0.exe
Get-AuthenticodeSignature .\release\Nexus-Draft-Portable-3.11.0.exe
Get-AuthenticodeSignature .\release\NexusDraft.exe
Get-AuthenticodeSignature .\release\Nexus-Draft-Tauri-Setup-3.11.0.exe
```

Every artifact you sign should report `Status : Valid` and the signer should match `Alexander Guo`.
