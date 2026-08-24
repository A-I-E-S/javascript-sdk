export { AfricaniesElement } from './elements/base.js';
export { AfricaniesShipmentBuilderElement } from './elements/builder.js';
export type {
  AfricaniesCountryOption,
  AfricaniesLocationOption,
  AfricaniesPlaceSelection,
  AfricaniesPlacesProvider,
  AfricaniesShipmentBuilderConfig,
} from './elements/builder.js';
export { AfricaniesPurchaseConfirmationElement } from './elements/purchase.js';
export { AfricaniesRateSelectionElement } from './elements/rates.js';

import { AfricaniesShipmentBuilderElement } from './elements/builder.js';
import { AfricaniesPurchaseConfirmationElement } from './elements/purchase.js';
import { AfricaniesRateSelectionElement } from './elements/rates.js';

export function defineAfricaniesElements(registry: CustomElementRegistry = customElements): void {
  if (!registry.get('africanies-shipment-builder')) registry.define('africanies-shipment-builder', AfricaniesShipmentBuilderElement);
  if (!registry.get('africanies-rate-selection')) registry.define('africanies-rate-selection', AfricaniesRateSelectionElement);
  if (!registry.get('africanies-purchase-confirmation')) registry.define('africanies-purchase-confirmation', AfricaniesPurchaseConfirmationElement);
}

if (typeof globalThis.customElements !== 'undefined') defineAfricaniesElements(globalThis.customElements);

declare global {
  interface HTMLElementTagNameMap {
    'africanies-shipment-builder': AfricaniesShipmentBuilderElement;
    'africanies-rate-selection': AfricaniesRateSelectionElement;
    'africanies-purchase-confirmation': AfricaniesPurchaseConfirmationElement;
  }
}
