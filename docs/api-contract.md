# API contract notes

The SDK intentionally preserves the documented AfricanIES wire contract, including endpoint-specific numeric string/number differences.

## Rate to purchase

The selected rate `slug` is copied unchanged to purchase `shipment_method_slug`.

`preparePurchaseRequest` is an explicit conversion boundary for rate request strings becoming purchase numbers. Invalid numeric values return field-addressable issues rather than being silently replaced.

## Duplicate purchase

The API considers the same `external_reference` a duplicate after its associated shipment has been confirmed paid. Before paid confirmation the reference remains accepted. The SDK supplements the server rule with an in-flight UI lock and never automatically retries purchase.

## Files

File generation accepts objects containing `extension`, `mime_type`, and `folder`. The response supplies `upload_url` and `s3_key`. Upload uses presigned PUT; only a successfully uploaded `s3_key` should be attached to item-level `documents_s3_key` or `photos_s3_key` arrays.

Invoices are documented as required for shipments to European countries. The exact country list and upload size/count limits are not yet published, so the SDK does not invent those constraints.
