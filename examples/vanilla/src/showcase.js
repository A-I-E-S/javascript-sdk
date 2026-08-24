import * as Shipping from '@africanies/shipping/browser';
import './tailwind.css';
import { previewPurchaseRequest,previewPurchaseResult,previewRateRequest,previewRates } from './showcase-fixtures.js';

const envelope=(data,message='Local fixture')=>({success:true,status_code:200,message,data});
const transport={async request(request){if(request.path==='/shipment/rates')return envelope(structuredClone(previewRates));if(request.path==='/shipment/purchase')return envelope(structuredClone(previewPurchaseResult));if(request.path.startsWith('/product/search/'))return envelope([{id:1,name:'Handbags',hs_code:'4202910000',description:'Handbags'}]);throw new Error(`The local preview has no fixture for ${request.path}.`);}};
const client=Shipping.createAfricaniesClient({environment:'test',shipmentMode:'SFN',transport});
const builder=document.querySelector('#preview-builder');builder.client=client;builder.value=structuredClone(previewRateRequest);
const rates=document.querySelector('#preview-rates');rates.client=client;rates.request=structuredClone(previewRateRequest);
const purchase=document.querySelector('#preview-purchase');purchase.client=client;purchase.request=previewPurchaseRequest();

const snippets={builder:`import '@africanies/shipping/elements';\nconst builder = document.querySelector('africanies-shipment-builder');\nbuilder.client = client;\nbuilder.value = initialRateDraft;`,rates:`const rates = document.querySelector('africanies-rate-selection');\nrates.client = client;\nrates.request = completedRateRequest;\nrates.addEventListener('africanies-complete', ({ detail }) => useRate(detail.rate));`,purchase:`// Mount only after the host confirms payment.\nconst purchase = document.querySelector('africanies-purchase-confirmation');\npurchase.client = client;\npurchase.request = completePurchaseRequest;`};
document.querySelectorAll('[data-copy]').forEach((button)=>button.addEventListener('click',async()=>{const value=snippets[button.dataset.copy];try{await navigator.clipboard.writeText(value);button.textContent='Copied';document.querySelector('#copy-status').textContent=`${button.dataset.copy} example copied.`;}catch{document.querySelector('#copy-status').textContent='Clipboard access is unavailable. View the source link for the complete example.';}setTimeout(()=>{button.textContent='Copy example';},1600);}));
