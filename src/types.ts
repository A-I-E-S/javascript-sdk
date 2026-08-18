export type AfricaniesEnvironment = 'test' | 'live';
export type ShipmentMode = 'SFN' | 'STN';
export type ResourceSelector = number | 'all';

export interface ApiEnvelope<T> {
  success: boolean;
  status_code: number;
  message: string;
  data: T;
}

export interface SimplePaginator<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number | null;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
}

export interface AddressVerifyRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  address: string;
  address_in_detail: string;
  zip_code: string;
  type: string;
  alternate_phone?: string | null;
  address_landmark?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  street_number?: string | null;
  street_name?: string | null;
  google_address?: boolean;
}

export interface AddressMatch {
  countryCode: string;
  postalCode: string;
  cityName: string;
  serviceArea: {
    code: string;
    description: string;
    GMTOffset: string;
  };
}

export interface AddressVerifyResult {
  address: AddressMatch[];
}

interface ShipmentAddressBase {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  address: string;
  address_in_detail: string;
  zip_code: string;
  type: string;
  alternate_phone?: string | null;
  street_number?: string | null;
  street_name?: string | null;
}

export interface ShipmentRateAddress extends ShipmentAddressBase {
  address_landmark: string;
  longitude: number;
  latitude: number;
  google_address: string;
}

export interface ShipmentPurchaseAddress extends ShipmentAddressBase {
  address_landmark: string | null;
  longitude: number | null;
  latitude: number | null;
  google_address: string | null;
}

export interface ShipmentRateDraftAddress extends ShipmentAddressBase {
  address_landmark: string | null;
  longitude: number | null;
  latitude: number | null;
  google_address: string | null;
}

export interface ShipmentAddressPair<TAddress> {
  sender: TAddress;
  receiver: TAddress;
}

export type ShipmentRateAddresses = ShipmentAddressPair<ShipmentRateAddress>;
export type ShipmentPurchaseAddresses = ShipmentAddressPair<ShipmentPurchaseAddress>;
export type ShipmentRateDraftAddresses = ShipmentAddressPair<ShipmentRateDraftAddress>;

export interface ShipmentUnits {
  mass: string;
  dimension: string;
}

export interface RateItem {
  name: string;
  description: string;
  price: number;
  product_hs_code: string;
  product_hs_code_description: string;
  weight: string;
  unit_price: number;
  country: string;
  quantity: string;
  amount: string;
}

export interface RateBox {
  index: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  items: RateItem[];
}

export interface ShipmentRateRequest {
  addresses: ShipmentRateAddresses;
  boxes: RateBox[];
  units: ShipmentUnits;
  last_mile_delivery?: boolean;
  is_insured?: '0' | '1';
}

export interface ShipmentRateDraft extends Omit<ShipmentRateRequest, 'addresses'> {
  addresses: ShipmentRateDraftAddresses;
}

export interface RateCharges {
  shipment_cost: number;
  insurance_cost: number;
  pickup_cost: string;
  last_mile_delivery_cost: number;
  vat?: string | null;
}

export interface ShipmentRate {
  name: string;
  slug: string;
  charges: RateCharges;
  total_amount: number;
  discount_amount: number;
  payment_amount: number;
  total_item_value: number;
  others: {
    min_day: string;
    max_day: string;
    currency: string;
  };
  mode: string;
}

export interface PurchaseItem {
  name: string;
  product_hs_code: string;
  product_hs_code_description: string;
  description: string;
  weight: number;
  unit_price: number;
  quantity: number;
  amount: number;
  country: string;
  documents_s3_key: string[];
  photos_s3_key: string[];
}

export interface PurchaseBox {
  length: number;
  width: number;
  height: number;
  weight: number;
  index: number;
  items: PurchaseItem[];
}

export interface ShipmentPurchaseRequest {
  address: ShipmentPurchaseAddresses;
  assigned_date: string;
  boxes: PurchaseBox[];
  units: ShipmentUnits;
  external_reference: string;
  shipment_method_slug: string;
  type?: string;
  product_code?: 'P' | 'D';
  is_insured?: '0' | '1';
  file_is_url?: '0' | '1';
}

export interface PurchaseDocuments {
  waybill_doc: string;
  insurance_doc: string;
  invoice_doc: string;
}

export interface ShipmentPurchaseResult {
  reference: string;
  tracking_number: string;
  tracking_url: string;
  documents: PurchaseDocuments;
  waybill_is_url: number;
  insurance_is_url: number;
  invoice_is_url: number;
  mode: string;
}

export interface UploadFileDescriptor {
  extension: string;
  mime_type: string;
  folder: string;
}

export interface GeneratedUpload {
  file_name: string;
  upload_url: string;
  s3_key: string;
}

export interface ProductHsCode {
  id: number;
  hs_code: string;
  name: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ProductVerification {
  hs_code: string;
  valid: boolean;
  description: string;
  category: string;
}

export interface TrackingResult {
  shipment_id: string;
  tracking_number: string;
  status: string;
  location: string;
  estimated_delivery: string;
}

export interface Carrier {
  id: string;
  name: string;
  slug: string;
  mode: string;
  min_weight: string;
  max_weight: string;
  max_length: string;
  max_width: string;
  max_height: string;
  min_delivery_business_day: string;
  max_delivery_business_day: string;
}

export interface Warehouse {
  id: number;
  name: string;
  address: string;
  active: boolean;
  country?: string;
}

export type ListResult<T> = T[] | SimplePaginator<T>;
