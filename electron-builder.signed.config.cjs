const packageJson = require('./package.json')

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const endpoint = process.env.AZURE_SIGNING_ENDPOINT?.trim() || 'https://eus.codesigning.azure.net'
const codeSigningAccountName = process.env.AZURE_SIGNING_ACCOUNT_NAME?.trim() || 'NexusDraft'
const certificateProfileName = process.env.AZURE_SIGNING_CERTIFICATE_PROFILE_NAME?.trim() || 'NexusDraft'
const publisherName = process.env.AZURE_SIGNING_PUBLISHER_NAME?.trim() || 'Alexander Guo'

module.exports = {
  ...packageJson.build,
  win: {
    ...packageJson.build.win,
    publisherName,
    signAndEditExecutable: true,
    azureSignOptions: {
      endpoint,
      codeSigningAccountName,
      certificateProfileName,
      FileDigest: 'SHA256',
      TimestampDigest: 'SHA256',
      TimestampRfc3161: 'http://timestamp.acs.microsoft.com'
    }
  }
}
