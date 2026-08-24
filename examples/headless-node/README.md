# Headless Node examples

Build once, then run these deterministic examples without credentials or network access:

```sh
npm run build
node examples/headless-node/automatic-checkout.mjs
node examples/headless-node/manual-packaging.mjs
node examples/headless-node/resources.mjs
node examples/headless-node/transport-and-upload.mjs
node examples/headless-node/validation-and-errors.mjs
```

Replace the in-memory transport with runtime authentication when integrating.
