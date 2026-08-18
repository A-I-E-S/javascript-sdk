# Security

Do not report credentials through public issues.

AfricanIES API credentials are Base64-encoded values and are not encrypted. Applications must provide credentials at runtime and must not commit them, compile them into browser bundles, expose them through source maps, persist them in web storage, or include them in logs.

The SDK redacts authorization values and signed URL query strings from its own errors. Host applications remain responsible for their logging, analytics, storage, proxy authorization, and browser threat model.

When purchase requests use numeric `file_is_url: 0`, document fields in the purchase response are Base64 document data rather than URLs. Treat that data as sensitive: do not log it, attach it to analytics or error reports, or persist it without the same controls used for the original shipment documents.
