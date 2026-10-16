const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let result = 0
  left.forEach((byte, index) => { result |= byte ^ right[index] })
  return result === 0
}

export interface PasscodeVerifier {
  salt: string
  hash: string
  iterations: number
}

export async function createPasscodeVerifier(passcode: string): Promise<PasscodeVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 210_000
  const key = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(bits)), iterations }
}

export async function verifyPasscode(passcode: string, verifier: PasscodeVerifier) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(verifier.salt), iterations: verifier.iterations, hash: 'SHA-256' }, key, 256)
  return constantTimeEqual(new Uint8Array(bits), base64ToBytes(verifier.hash))
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  return bytesToBase64(new Uint8Array(buffer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function biometricSupported() {
  return window.isSecureContext && 'PublicKeyCredential' in window && 'credentials' in navigator
}

export async function registerBiometric() {
  if (!biometricSupported()) throw new Error('Biometric unlock is not available in this browser or context.')
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'type a wish' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'local-atlas', displayName: 'type a wish owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
  }) as PublicKeyCredential | null
  if (!credential) throw new Error('No biometric credential was created.')
  return bufferToBase64Url(credential.rawId)
}

export async function authenticateBiometric(credentialId: string) {
  if (!biometricSupported()) throw new Error('Biometric unlock is not available in this browser or context.')
  const response = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: base64UrlToBuffer(credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  return Boolean(response)
}

function base64UrlToBuffer(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return base64ToBytes(padded).buffer
}
