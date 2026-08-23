# Security

Do not report credentials through public issues.

AfricanIES API credentials are Base64-encoded values and are not encrypted. Applications must provide credentials at runtime and must not commit them, compile them into browser bundles, expose them through source maps, persist them in web storage, or include them in logs.

Runtime Base64 credentials remain the selected model for the current stabilization work. This is an acceptance of the present integration direction, not a claim that Base64 protects a secret. The final policy for live browser integrations versus a backend/custom transport is pending. Until it is settled, applications that expose a live credential to browser code must explicitly accept that browser users can inspect it; use a backend/custom transport when that exposure is unacceptable.

The SDK redacts authorization values and signed URL query strings from its own errors. Host applications remain responsible for their logging, analytics, storage, proxy authorization, and browser threat model.

Signed upload URLs must use HTTPS. The SDK rejects a remote plain-HTTP upload URL before reading or transmitting file bytes; HTTP is allowed only for local development hosts (`localhost`, `127.0.0.1`, and `[::1]`). This localhost exception must not be used for remote or production uploads.

When purchase requests use numeric `file_is_url: 0`, document fields in the purchase response are Base64 document data rather than URLs. Treat that data as sensitive: do not log it, attach it to analytics or error reports, or persist it without the same controls used for the original shipment documents.
