# Security

Do not report credentials through public issues.

AfricanIES API credentials are Base64-encoded values and are not encrypted. Applications must provide credentials at runtime and must not commit them, compile them into browser bundles, expose them through source maps, persist them in web storage, or include them in logs.

The SDK redacts authorization values and signed URL query strings from its own errors. Host applications remain responsible for their logging, analytics, storage, proxy authorization, and browser threat model.
