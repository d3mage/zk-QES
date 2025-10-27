Task: CSC QTSP Integration (Qualified Signing from your app)
Goal

Use a real QTSP’s CSC API so users can:

enroll / link their qualified certificate,

approve a signature (PIN/2FA),

return a qualified ECDSA-P256 (or RSA) signature,

build PAdES-T/LT, generate your Noir proof, and (optionally) anchor on Aztec.

Deliverables

config/csc.config.json – provider base URL(s), OAuth client, scopes.

src/csc/cscClient.ts – typed CSC client (discover + signHash + credential flows).

scripts/csc-enroll.ts – enroll/link a user with the QTSP (stores credentialId + signer fingerprint).

scripts/csc-sign.ts – sign a PDF’s /ByteRange hash via CSC; outputs (r,s) or RSA sig + chain.

scripts/sign-qualified.ts – one-click pipeline:

ByteRange hash → CSC sign → PAdES embed → timestamp (TSA) → LT → Noir proof → verify → anchor.

src/csc/store.ts – secure local storage for credentialId, cert_chain, signer_fpr.

README updates: setup, flows, test sandbox instructions.

User Flow (happy path)

Enroll (one-time)

yarn csc:enroll --provider <name>

Opens consent (OAuth/PKCE) in browser or device-code flow.

Lists user’s credentials (qualified key containers).

User selects one → we store:

credentialId

signer_fingerprint = sha256(cert_der)

pubkey (x,y for EC or n,e for RSA)

algo (ES256 preferred; RSA allowed)

Qualified-sign a PDF

yarn sign-qualified sample.pdf

Extract /ByteRange → doc_hash.

CSC /signHash with credentialId (user approves with PIN/2FA).

Receive signature + cert_chain.

Build PAdES (embed CMS), add TSA (+ LT if configured).

Generate Noir proof (ECDSA path).

If RSA, skip in-circuit verify (still PAdES-valid) and prove allow-list/EU trust inclusion only.

Verify + (optional) anchor on Aztec.

API Shape (you’ll implement)

1. Discovery & OAuth

GET /.well-known/openid-configuration (for auth endpoints)

OAuth2/PKCE or Device Code flow to obtain access_token per user

Store tokens encrypted on disk (OS keystore if available)

2. Credential lifecycle

GET /credentials/list → show user’s qualified credentials

GET /credentials/info?credentialId=... → algorithms, key type, cert(s)

POST /credentials/authorize → start signing authorization (SCA, PIN, OTP)

3. Signing

POST /signatures/signHash

inputs: credentialId, hash (SHA-256), hashAlgo: "SHA256", signAlgo: "ECDSA" (or provider enum), numSignatures: 1

return: signature blob (DER for ECDSA/RSA), certificates (PEM/DER)

If provider expects CMS-level input, use signHash (detached) and you still assemble the CMS/PAdES; avoid sign over whole document.

Code Stubs (TypeScript)

config/csc.config.json

{
"default": {
"name": "qtsp-dev",
"baseUrl": "https://qtsp.sandbox.example/csc/v2",
"oauth": {
"authzEndpoint": "https://qtsp.sandbox.example/auth",
"tokenEndpoint": "https://qtsp.sandbox.example/token",
"clientId": "YOUR_CLIENT_ID",
"scopes": ["credential", "signature"]
}
}
}

src/csc/cscClient.ts

import fetch from "node-fetch";

export type CSCConfig = {
baseUrl: string;
oauth: { authzEndpoint: string; tokenEndpoint: string; clientId: string; scopes: string[]; };
};
export class CSCClient {
constructor(private cfg: CSCConfig, private getToken: () => Promise<string>) {}

private async req(path: string, init: RequestInit = {}) {
const token = await this.getToken();
const res = await fetch(`${this.cfg.baseUrl}${path}`, {
...init,
headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers||{}) }
});
if (!res.ok) throw new Error(`CSC ${path} ${res.status}: ${await res.text()}`);
return res.json();
}

listCredentials() { return this.req(`/credentials/list`); }

credentialInfo(credentialId: string) {
return this.req(`/credentials/info?credentialId=${encodeURIComponent(credentialId)}`);
}

authorize(credentialId: string, description: string) {
return this.req(`/credentials/authorize`, {
method: "POST",
body: JSON.stringify({ credentialId, description })
});
}

signHash(opts: { credentialId: string; hash: string; hashAlgo: "SHA256"; signAlgo: "ECDSA" | "RSA"; }) {
return this.req(`/signatures/signHash`, {
method: "POST",
body: JSON.stringify({
credentialId: opts.credentialId,
hash: [opts.hash], // CSC often accepts array of hashes
hashAlgo: opts.hashAlgo,
signAlgo: opts.signAlgo
})
});
}
}

scripts/csc-enroll.ts (sketch)

// 1) OAuth device-code or PKCE → access_token
// 2) client.listCredentials() → display
// 3) pick credentialId, client.credentialInfo() → get cert + algo
// 4) compute signer_fpr = sha256(cert_der) → store in src/csc/store.ts

scripts/csc-sign.ts (sketch)

// 1) read out/doc_hash.bin
// 2) authorize(credentialId, "Sign PDF hash ...")
// 3) signHash({ credentialId, hash: hex(doc_hash), hashAlgo: "SHA256", signAlgo: algFromInfo })
// 4) parse signature DER → (r,s) if ECDSA; else raw RSA
// 5) write out/CSC_sig.json, out/CSC_cert_chain.pem

scripts/sign-qualified.ts

// glue command that runs: hash-byte-range → csc-sign → pades-certify (if first) / pades-embed → pades-timestamp → pades-lt → prove → verify → (optional) anchor

Integration with your pipeline

PAdES embed: reuse your CMS builder; if the QTSP returns just raw signature, you still construct CMS and embed as you do now.

ZK/Noir:

ECDSA-P256: use (r,s) + (x,y) from CSC credentialInfo → your circuit passes as-is.

RSA: keep your “RSA off-circuit” path:

Verify PAdES normally.

ZK proof includes trust inclusion (local/EU Merkle) + binds doc_hash & artifact_hash (what you already have). Document in manifest that alg=RSA (no in-circuit ECDSA).

Manifest additions:

{
"qtsp": {
"provider": "qtsp-dev",
"credentialId": "abcd1234",
"alg": "ES256|RS256",
"cert_chain_sha256": "<hex>",
"lotl_snapshot_id": "<id>"
}
}

Security & Compliance Notes

Keys never touch your app: QTSP holds them in QSCD/HSM.

SCA/PIN: enforce per-signature approval; never cache PINs.

Store minimal: credentialId, signer fingerprint, public key, chain; encrypt at rest.

Clock: ensure signer’s device/your server has reliable time for TSA/LT.

Audit: log credentialId, proof id, tl_root snapshot id, TSA serial.

Acceptance Criteria

✅ yarn csc:enroll lists QTSP credentials, stores one (fingerprint, pubkey, algo).

✅ yarn csc-sign returns a valid signature for a provided doc_hash.

✅ yarn sign-qualified produces a qualified PAdES (T and LT if configured), Noir proof, verified locally.

✅ If alg=ECDSA-P256 → Noir proof checks signature; if alg=RSA → Noir proof still binds doc/artifact + trust inclusion (documented).

✅ End-to-end demo (E2E) green in CI with a QTSP sandbox.

Test Plan (quick)

Positive: ECDSA credential → full run passes; Adobe + DSS validate PAdES-T/LT.

RSA: credential returns RSA → PAdES validates; Noir runs “trust-only” proof; verify step shows alg=RSA.

User cancels PIN: csc-sign exits with clear error; nothing embedded.

Stale token: refresh OAuth; retry once; then fail closed.

Wrong doc: tamper PDF → verification fails in step 1 or ZK.
