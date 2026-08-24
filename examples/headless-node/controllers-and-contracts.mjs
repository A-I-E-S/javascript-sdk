import { AFRICANIES_ENVIRONMENTS, assertShipmentRequest } from '../../dist/index.js';
import { PurchaseController, RateSelectionController, ShipmentBuilderController, UploadController, completeRateRequest, validatePurchaseRequest } from '../../dist/ui.js';
import { addresses, envelope, rate } from './fixtures.mjs';

if (AFRICANIES_ENVIRONMENTS.test !== 'https://api-sandbox.africaniestest.com') throw new Error('Environment constants changed.');
const draft={addresses,boxes:[{index:'0',length:'30',width:'20',height:'15',weight:'1.2',items:[{name:'Handbags',description:'Leather handbag',product_hs_code:'4202210000',weight:'1.2',unit_price:'1250',country:'NG',quantity:'1',amount:'1250'}]}],units:{dimension:'cm',mass:'KG'},last_mile_delivery:true,pickup:false,is_insured:'0'};
const request=completeRateRequest(draft);assertShipmentRequest(request,'SFN','rate');
const purchaseRequest={address:addresses,assigned_date:'2099-08-20',boxes:request.boxes,units:request.units,currency:'NGN',external_reference:'CONTROLLERS-1001',shipment_method_slug:rate.slug,is_insured:'0',file_is_url:0};
if(!validatePurchaseRequest(purchaseRequest,'SFN',new Date('2026-01-01')).valid)throw new Error('Purchase contract should be valid.');
const client={environment:'test',shipmentMode:'SFN',shipments:{async getRates(){return envelope([rate])},async purchase(){return envelope({reference:'SHIP',tracking_number:'TRACK',tracking_url:'https://example.com/track',documents:{waybill_doc:null,insurance_doc:null,invoice_doc:'JVBERi0xLjQ='},waybill_is_url:0,insurance_is_url:0,invoice_is_url:0,mode:'SFN'})}},files:{async upload(_file,descriptor){return{file_name:'demo.pdf',upload_url:'https://example.com/upload',s3_key:'documents/demo.pdf',descriptor}}}};
const builder=new ShipmentBuilderController(client,draft);builder.subscribe(()=>{});builder.replace(draft);builder.complete();
const rates=new RateSelectionController(client,request);rates.subscribe(()=>{});await rates.load();rates.select(rate.slug);rates.cancel();
const purchase=new PurchaseController(client,purchaseRequest);purchase.subscribe(()=>{});await purchase.submit();purchase.cancel();
const uploads=new UploadController(client);uploads.subscribe(()=>{});const upload=uploads.add(new Blob(['demo']),{extension:'pdf',mime_type:'application/pdf',folder:'documents'});while(uploads.state.find(({id})=>id===upload.id)?.status!=='uploaded')await new Promise((resolve)=>setTimeout(resolve,0));await uploads.retry(upload.id);uploads.remove(upload.id);
console.log('Controller and contract exports executed.');
