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

## Verify

```powershell
Get-AuthenticodeSignature .\release\Nexus-Draft-Setup-3.11.0.exe
Get-AuthenticodeSignature .\release\Nexus-Draft-Portable-3.11.0.exe
```

Both should report `Status : Valid` and the signer should match `Alexander Guo`.
