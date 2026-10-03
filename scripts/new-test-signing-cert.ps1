#Requires -Version 5.1
<#
.SYNOPSIS
  Creates a self-signed code-signing certificate for test-signing Windows builds.

.DESCRIPTION
  Signing with this certificate needs no Microsoft or certificate-authority
  registration. Windows trusts the signature only on machines where the
  public certificate has been imported, and SmartScreen still treats the
  installer as unknown, so it is for testers, not public releases.

  Writes to the output directory:
    parallel-code-test-signing.pfx      private key; keep it secret
    parallel-code-test-signing.cer      public certificate for testers
    parallel-code-test-signing.pfx.b64  value for the WIN_TEST_CSC_LINK secret

  Then add the repository secrets WIN_TEST_CSC_LINK (the .b64 contents) and
  WIN_TEST_CSC_KEY_PASSWORD (the password), or sign a local build with
  $env:WIN_CSC_LINK = '<path to .pfx>'; $env:WIN_CSC_KEY_PASSWORD = '<password>'.

  Testers trust it from an elevated PowerShell:
    Import-Certificate -FilePath parallel-code-test-signing.cer -CertStoreLocation Cert:\LocalMachine\Root
    Import-Certificate -FilePath parallel-code-test-signing.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [securestring]$Password,
  [string]$OutputDirectory = '.',
  [string]$Subject = 'CN=Parallel Code Test Signing',
  [int]$ValidYears = 3
)

$ErrorActionPreference = 'Stop'
$OutputDirectory = (New-Item -ItemType Directory -Force -Path $OutputDirectory).FullName
$base = Join-Path $OutputDirectory 'parallel-code-test-signing'

$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject `
  -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears($ValidYears)

try {
  Export-PfxCertificate -Cert $cert -FilePath "$base.pfx" -Password $Password | Out-Null
  Export-Certificate -Cert $cert -FilePath "$base.cer" | Out-Null
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("$base.pfx")) |
    Set-Content -NoNewline -Path "$base.pfx.b64"
} finally {
  # The exported .pfx is the only copy of the private key.
  Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey
}

Write-Host "Created $base.pfx, $base.cer and $base.pfx.b64"
Write-Host "Thumbprint: $($cert.Thumbprint)"
