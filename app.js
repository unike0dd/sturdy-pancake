const $=id=>document.getElementById(id);
const preferences={
  language:localStorage.getItem('cappeto_language')==='es'?'es':'en',
  theme:localStorage.getItem('cappeto_theme')==='dark'?'dark':'light'
};
const translations=window.CAPPETO_I18N;
const t=(key,values={})=>{let text=translations[preferences.language].ui[key]??translations.en.ui[key]??key;for(const [name,value] of Object.entries(values))text=text.replaceAll(`{${name}}`,String(value));return text};
const productCopy=product=>preferences.language==='es'&&translations.products[product.id]?{name:translations.products[product.id][0],category:translations.products[product.id][1],description:translations.products[product.id][2]}:{name:product.name,category:product.category,description:product.description};
const errorKeys={'Please sign in again.':'signInAgain','The 20-product limit has been reached.':'limitReached','Product not found.':'productNotFound','This action is unavailable.':'actionUnavailable','Unexpected server response':'unexpectedResponse','Request failed':'requestFailed','Enter a valid whole quantity.':'wholeQuantity','Quantity exceeds available inventory.':'quantityExceeded','Email or password is incorrect.':'invalidCredentials'};
const localizeError=error=>preferences.language==='es'&&translations.errors[error.message]?translations.errors[error.message]:t(errorKeys[error.message]||error.message);
function applyPreferences(){
  document.documentElement.lang=preferences.language;
  document.documentElement.dataset.theme=preferences.theme;
  document.querySelectorAll('[data-language-toggle]').forEach(button=>{button.textContent=preferences.language==='en'?'EN':'ES';button.setAttribute('aria-label',t('languageLabel'));button.setAttribute('aria-pressed',String(preferences.language==='es'))});
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.textContent=preferences.theme==='light'?'Light':'Dark';button.setAttribute('aria-label',preferences.theme==='dark'?t('themeLight'):t('themeDark'));button.setAttribute('aria-pressed',String(preferences.theme==='light'))});
  document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element=>element.placeholder=t(element.dataset.i18nPlaceholder));
  document.querySelectorAll('[data-i18n-aria]').forEach(element=>element.setAttribute('aria-label',t(element.dataset.i18nAria)));
  if($('passwordToggle'))$('passwordToggle').textContent=t($('authCode').type==='text'?'hidePassword':'showPassword');
  $('skipLink').textContent=preferences.language==='es'?'Ir al contenido principal':'Skip to main content';
  const spanish=preferences.language==='es';
  document.title=spanish?'Cappeto · Menú de café':'Cappeto · Café menu';
  document.querySelector('meta[name="description"]').content=spanish?'Explore el menú de Cappeto, revise la disponibilidad y prepare un pedido con subtotal, IVA y total claros.':"Browse Cappeto's café menu, review product availability, and prepare an order with clear subtotal, VAT, and total pricing.";
  document.querySelector('meta[name="theme-color"]').content=preferences.theme==='dark'?'#0d1511':'#f4f6f0';
  const authValue=document.querySelector('.auth-value');
  if(authValue){
    const shopImage=preferences.language==='es'?'https://unike0dd.github.io/cappeto/assets/branding/cafteria_logo_ES.png':'https://unike0dd.github.io/cappeto/assets/branding/cafteria_logo_EN.png';
    authValue.style.setProperty('--auth-shop-image',`url("${shopImage}")`);
  }
  if($('authForm')?.dataset.mode)setAuthMode($('authForm').dataset.mode);
}
applyPreferences();
document.querySelectorAll('[data-language-toggle]').forEach(button=>button.addEventListener('click',()=>{preferences.language=preferences.language==='en'?'es':'en';localStorage.setItem('cappeto_language',preferences.language);applyPreferences();if(!$('appView').classList.contains('hidden')){renderAll();renderProductPreview();showStaffControls(Boolean(state.staff))}}));
document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{preferences.theme=preferences.theme==='dark'?'light':'dark';localStorage.setItem('cappeto_theme',preferences.theme);applyPreferences()}));
const state={products:[],cart:new Map(),category:'All',query:'',manageQuery:'',financeView:'inventory',staff:null,csrf:'',imageData:'',editingProductId:null,carouselIndex:0,quoteVersion:0};
const defaultBusinessProfile={name:'Cappeto',logo:'',address:'',phone:'',email:'',currency:'USD'};
let businessProfile=loadBusinessProfile();
let pendingBusinessLogo=businessProfile.logo;
const TUTORIAL_SESSION_KEY='sturdy_pancake_tutorial_session';
const previewHelpers={
  persistRememberedEmail(storage,email,checked){if(checked&&email)storage.setItem('sturdy_remembered_email',email);else storage.removeItem('sturdy_remembered_email')},
  restoreRememberedEmail(storage){return storage.getItem('sturdy_remembered_email')||''}
};
const tutorialOwner=()=>({id:'tutorial-owner',role:'owner',displayName:'Tutorial owner',tutorial:true});
const money=cents=>new Intl.NumberFormat(preferences.language==='es'?'es-EC':'en-US',{style:'currency',currency:'USD'}).format(cents/100);
const escapeHtml=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const searchSynonyms=[
  ['coffee','cafe','café'],
  ['juice','jugo','zumo'],
  ['soda','gaseosa','refresco'],
  ['bread','pan'],
  ['milk','leche'],
  ['chicken','pollo'],
  ['turkey','pavo'],
  ['strawberry','fresa','frutilla'],
  ['watermelon','sandia','sandía'],
  ['orange','naranja'],
  ['cinnamon','canela'],
  ['cheese','queso'],
  ['burger','hamburger','hamburguesa'],
  ['wrap','tortilla','envuelto'],
  ['hotdog','salchicha'],
  ['soldout','agotado']
].map(group=>group.map(value=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()));
const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const searchTokens=value=>normalizeSearch(value).split(/\\s+/).filter(Boolean);
function editDistanceWithin(left,right,limit){
  if(Math.abs(left.length-right.length)>limit)return false;
  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let row=1;row<=left.length;row++){
    const current=[row];let rowMinimum=row;
    for(let column=1;column<=right.length;column++){
      current[column]=Math.min(current[column-1]+1,previous[column]+1,previous[column-1]+(left[row-1]===right[column-1]?0:1));
      rowMinimum=Math.min(rowMinimum,current[column]);
    }
    if(rowMinimum>limit)return false;
    previous=current;
  }
  return previous[right.length]<=limit;
}
function tokenMatches(queryToken,candidate){
  if(candidate.includes(queryToken)||queryToken.includes(candidate))return true;
  if(queryToken.length<4||candidate.length<4)return false;
  const limit=Math.max(queryToken.length,candidate.length)>=8?2:1;
  return editDistanceWithin(queryToken,candidate,limit);
}
function productSearchText(product){
  const spanish=translations.products[product.id]||[];
  return [product.id,product.name,product.category,product.description,...spanish].join(' ');
}
function productMatchesSearch(product,query){
  const requested=searchTokens(query);
  if(!requested.length)return true;
  const available=searchTokens(productSearchText(product));
  return requested.every(token=>{
    const synonymGroup=searchSynonyms.find(group=>group.includes(token));
    const alternatives=synonymGroup||[token];
    return alternatives.some(alternative=>available.some(candidate=>tokenMatches(alternative,candidate)));
  });
}
const staticPrototype=location.hostname==='unike0dd.github.io';
let staticCatalog=null;

async function staticApi(path,options={}){
  const method=options.method||'GET';
  const body=JSON.parse(options.body||'{}');
  if(path==='/api/auth/session'){const active=sessionStorage.getItem(TUTORIAL_SESSION_KEY)==='active';return active?{authenticated:true,user:tutorialOwner(),csrfToken:''}:{authenticated:false}};
  if(path==='/api/auth/login'&&method==='POST')throw new Error('Staff sign-in requires the trusted identity service.');
  if(path==='/api/auth/logout'){sessionStorage.removeItem(TUTORIAL_SESSION_KEY);return{ok:true}};
  if(!staticCatalog)staticCatalog=await fetch('data/products.json',{cache:'no-store',credentials:'omit'}).then(response=>{
    if(!response.ok)throw new Error('Request failed');
    return response.json();
  });
  if(path==='/api/products'&&method==='GET'){
    return state.staff?.tutorial?staticCatalog:{...staticCatalog,products:staticCatalog.products.map(({procurementCostCents,purchaseTaxRate,purchaseDeliveryCents,procurementQuantity,returned,damaged,sold,purchaseDate,...product})=>product)};
  }
  if(path==='/api/orders/quote'&&method==='POST'){
    const lines=(body.items||[]).map(item=>({product:staticCatalog.products.find(entry=>entry.id===item.productId),quantity:Number(item.quantity)})).filter(line=>line.product&&Number.isInteger(line.quantity)&&line.quantity>0);
    const subtotalCents=lines.reduce((sum,line)=>sum+line.product.priceCents*line.quantity,0);
    const vatCents=lines.reduce((sum,line)=>sum+Math.round(line.product.priceCents*line.quantity*Number(line.product.vatRate??staticCatalog.vatRate)/100),0);
    return{subtotalCents,vatCents,totalCents:subtotalCents+vatCents,vatRate:staticCatalog.vatRate,previewOnly:true};
  }
  throw new Error('This action requires the trusted backend service.');
}
async function api(path,options={}){
  if(staticPrototype)return staticApi(path,options);
  const response=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(state.csrf?{'X-CSRF-Token':state.csrf}:{}),...options.headers},...options});
  const body=await response.json().catch(()=>({error:'Unexpected server response'}));
  if(!response.ok) throw new Error(body.error||'Request failed');
  return body;
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2400)}
function enterApp(){ if(!state.staff)switchView('catalog'); $('landingView').classList.add('hidden');$('authView').classList.add('hidden');$('appView').classList.remove('hidden');$('skipLink').href='#appView';renderAll() }
function showLanding(){ $('landingView').classList.remove('hidden');$('authView').classList.add('hidden');$('appView').classList.add('hidden');$('skipLink').href='#landingMain';$('landingTitle').focus?.() }
function showAuth(mode='signin'){$('landingView').classList.add('hidden');$('authView').classList.remove('hidden');$('appView').classList.add('hidden');$('skipLink').href='#authForm';setAuthMode(mode);$('authTitle').focus?.()}
function setAuthMode(mode){
  const signup=mode==='signup';
  document.querySelectorAll('.signup-only').forEach(element=>element.classList.toggle('hidden',!signup));
  document.querySelectorAll('.signin-only').forEach(element=>element.classList.toggle('hidden',signup));
  $('signInTab').classList.toggle('active',!signup);$('signUpTab').classList.toggle('active',signup);
  $('signInTab').setAttribute('aria-selected',String(!signup));$('signUpTab').setAttribute('aria-selected',String(signup));
  $('authFields').setAttribute('aria-labelledby',signup?'signUpTab':'signInTab');
  $('authTitle').textContent=t(signup?'createYourAccount':'welcomeBack');$('authIntro').textContent=t(signup?'signUpIntro':'signInIntro');$('signInButton').textContent=t(signup?'createAccount':'signIn');
  $('signupBusiness').required=signup;$('signupOwner').required=signup;$('confirmPassword').required=signup;$('termsConsent').required=signup;
  if(signup){$('authCode').pattern='(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}'}else{$('authCode').removeAttribute('pattern')}
  $('authCode').autocomplete=signup?'new-password':'current-password';$('authForm').dataset.mode=mode;$('authError').textContent='';
}
function showStaffControls(enabled){document.querySelectorAll('.staff-only').forEach(el=>el.classList.toggle('hidden',!enabled));document.querySelectorAll('.guest-only').forEach(el=>el.classList.toggle('hidden',enabled));$('sessionLabel').classList.toggle('hidden',enabled);$('sessionLabel').textContent=t('customer')}

async function loadCatalog(){const data=await api('/api/products');state.products=data.products;state.vatRate=data.vatRate;renderAll()}
function renderAll(){renderCategories();renderProducts();renderCart();renderManager();renderFinancialWorkspace();}
function renderCategories(){const categories=['All',...new Set(state.products.map(p=>p.category))];$('categoryRow').innerHTML=categories.map(name=>{const translated=name==='All'?t('all'):(preferences.language==='es'?(translations.products[state.products.find(p=>p.category===name)?.id]?.[1]||name):name);return`<button type="button" class="category-button ${state.category===name?'active':''}" data-category="${escapeHtml(name)}">${escapeHtml(translated)}</button>`}).join('')}
function visibleProducts(){return state.products.filter(product=>(state.category==='All'||product.category===state.category)&&productMatchesSearch(product,state.query))}
function renderProducts(){const shown=visibleProducts();$('productGrid').innerHTML=shown.length?shown.map((p,index)=>{const copy=productCopy(p);return`<article class="product-card" data-slide="${index}"><div class="product-image"><img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(copy.name)}" loading="lazy"></div><div class="product-content"><div class="product-top"><h2>${escapeHtml(copy.name)}</h2><span class="product-price">${money(p.priceCents)}</span></div><p class="product-description">${escapeHtml(copy.description)}</p><div class="product-footer"><span class="stock">${p.stock>0?`${p.stock} ${t('available')}`:t('soldOut')}</span><button class="add-button" type="button" data-add="${p.id}" ${p.stock<1?'disabled':''}>${t('add')}</button></div></div></article>`}).join(''):`<p class="empty-state">${t('noProducts')}</p>`;state.carouselIndex=Math.min(state.carouselIndex,Math.max(0,shown.length-1));updateCarouselStatus()}
function carouselStep(){const first=$('productGrid').querySelector('.product-card');return first?first.getBoundingClientRect().width+18:0}
function visibleCarouselCards(){const step=carouselStep();return step?Math.max(1,Math.floor(($('productGrid').clientWidth+18)/step)):1}
function moveCarousel(direction){const shown=visibleProducts();if(!shown.length)return;const visible=visibleCarouselCards();state.carouselIndex=Math.max(0,Math.min(state.carouselIndex+direction,Math.max(0,shown.length-visible)));$('productGrid').scrollTo({left:state.carouselIndex*carouselStep(),behavior:'smooth'});updateCarouselStatus()}
function updateCarouselStatus(){const shown=visibleProducts();const visible=visibleCarouselCards();const last=Math.min(shown.length,state.carouselIndex+visible);$('carouselPosition').textContent=shown.length?`${state.carouselIndex+1}–${last} / ${shown.length}`:'0 / 0';$('previousProduct').disabled=state.carouselIndex===0;$('nextProduct').disabled=!shown.length||last>=shown.length}
function renderCart(){let count=0;const lines=[];for(const [id,quantity] of state.cart){const p=state.products.find(item=>item.id===id);if(!p)continue;const copy=productCopy(p);count+=quantity;lines.push(`<div class="cart-line"><img src="${escapeHtml(p.imageUrl)}" alt=""><div><strong>${escapeHtml(copy.name)}</strong><small>${money(p.priceCents)} ${t('each')}</small></div><div class="qty-controls"><button type="button" data-minus="${id}" aria-label="− ${escapeHtml(copy.name)}">−</button><b>${quantity}</b><button type="button" data-plus="${id}" aria-label="+ ${escapeHtml(copy.name)}">+</button></div></div>`)}$('cartCount').textContent=count;$('cartLines').innerHTML=lines.join('')||`<p class="empty-state">${t('emptyOrder')}</p>`;$('clearOrder').disabled=!count;calculateTotals()}
async function calculateTotals(){const version=++state.quoteVersion;const items=[...state.cart].map(([productId,quantity])=>({productId,quantity}));try{const totals=items.length?await api('/api/orders/quote',{method:'POST',body:JSON.stringify({items})}):{subtotalCents:0,vatCents:0,totalCents:0,vatRate:state.vatRate||15};if(version!==state.quoteVersion)return;$('subtotal').textContent=money(totals.subtotalCents);$('vat').textContent=money(totals.vatCents);$('total').textContent=money(totals.totalCents);$('vatLabel').textContent=`${preferences.language==='es'?'IVA':'VAT'} (${totals.vatRate}%)`;$('placeOrder').disabled=!items.length}catch(error){if(version===state.quoteVersion)toast(localizeError(error))}}
function applyInventoryChange(product,action,quantity){if(!Number.isInteger(quantity)||quantity<1||quantity>9999)throw new Error('Enter a valid whole quantity.');product.returned=Number(product.returned||0);product.damaged=Number(product.damaged||0);product.sold=Number(product.sold||0);if(action==='add'||action==='return')product.stock+=quantity;if(action==='return')product.returned+=quantity;if(action==='damage'||action==='sold'){if(quantity>product.stock)throw new Error('Quantity exceeds available inventory.');product.stock-=quantity;product[action==='damage'?'damaged':'sold']+=quantity}}
function effectiveUnitProcurementCostCents(product){
  const baseCostCents=Math.max(0,Number(product.procurementCostCents)||0);
  const purchaseTaxRate=Math.max(0,Number(product.purchaseTaxRate)||0);
  const deliveryCents=Math.max(0,Number(product.purchaseDeliveryCents)||0);
  const trackedUnits=Math.max(0,Number(product.stock)||0)+Math.max(0,Number(product.sold)||0)+Math.max(0,Number(product.damaged)||0);
  const quantity=Math.max(1,Number(product.procurementQuantity)||trackedUnits);
  const subtotalCents=baseCostCents*quantity;
  const purchaseTaxCents=Math.round(subtotalCents*purchaseTaxRate/100);
  return Math.round((subtotalCents+purchaseTaxCents+deliveryCents)/quantity);
}
function financialSummary(){
  return state.products.reduce((summary,product)=>{
    const availableUnits=Math.max(0,Number(product.stock)||0);
    const soldUnits=Math.max(0,Number(product.sold)||0);
    const damagedUnits=Math.max(0,Number(product.damaged)||0);
    const returnedUnits=Math.max(0,Number(product.returned)||0);
    const sellingPriceCents=Math.max(0,Number(product.priceCents)||0);
    const baseCostCents=Math.max(0,Number(product.procurementCostCents)||0);
    const purchaseTaxRate=Math.max(0,Number(product.purchaseTaxRate)||0);
    const purchaseDeliveryCents=Math.max(0,Number(product.purchaseDeliveryCents)||0);
    const purchasedUnits=Math.max(0,Number(product.procurementQuantity)||availableUnits+soldUnits+damagedUnits);
    const purchaseSubtotalCents=baseCostCents*purchasedUnits;
    const purchaseTaxCents=Math.round(purchaseSubtotalCents*purchaseTaxRate/100);
    const unitCostCents=effectiveUnitProcurementCostCents(product);
    const missingCost=unitCostCents===0;
    const salesCents=Math.round(sellingPriceCents*soldUnits);
    const vatRate=Math.max(0,Number(product.vatRate??state.vatRate)||0);
    const taxCents=Math.round(salesCents*vatRate/100);
    summary.inventoryUnits+=availableUnits;
    summary.inventoryValueCents+=availableUnits*unitCostCents;
    summary.purchasedUnits+=purchasedUnits;
    summary.purchaseSubtotalCents+=purchaseSubtotalCents;
    summary.purchaseTaxCents+=purchaseTaxCents;
    summary.purchaseDeliveryCents+=purchaseDeliveryCents;
    summary.purchasePaymentCents+=purchaseSubtotalCents+purchaseTaxCents+purchaseDeliveryCents;
    summary.soldUnits+=soldUnits;
    summary.salesCents+=salesCents;
    summary.taxCents+=taxCents;
    summary.cogsCents+=soldUnits*unitCostCents;
    summary.damagedCostCents+=damagedUnits*unitCostCents;
    summary.returnedUnits+=returnedUnits;
    summary.returnedInventoryValueCents+=returnedUnits*unitCostCents;
    summary.damagedBaseCostCents+=damagedUnits*baseCostCents;
    summary.damagedPurchaseTaxCents+=Math.round(damagedUnits*baseCostCents*purchaseTaxRate/100);
    if(availableUnits&&missingCost)summary.inventoryCostComplete=false;
    if((soldUnits||damagedUnits)&&missingCost)summary.profitCostComplete=false;
    return summary;
  },{inventoryUnits:0,inventoryValueCents:0,purchasedUnits:0,purchaseSubtotalCents:0,purchaseTaxCents:0,purchaseDeliveryCents:0,purchasePaymentCents:0,soldUnits:0,salesCents:0,taxCents:0,cogsCents:0,returnedUnits:0,returnedInventoryValueCents:0,damagedCostCents:0,damagedBaseCostCents:0,damagedPurchaseTaxCents:0,inventoryCostComplete:true,profitCostComplete:true});
}
function localDateKey(date=new Date()){const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,10)}
function summarySnapshot(summary){return{purchasedUnits:summary.purchasedUnits,purchasePaymentCents:summary.purchasePaymentCents,purchaseTaxCents:summary.purchaseTaxCents,purchaseDeliveryCents:summary.purchaseDeliveryCents,unitCostCents:summary.purchasedUnits?Math.round(summary.purchaseSubtotalCents/summary.purchasedUnits):null,inventoryValueCents:summary.inventoryValueCents,averageSaleCents:summary.soldUnits?Math.round(summary.salesCents/summary.soldUnits):null,salesTaxPerUnitCents:summary.soldUnits?Math.round(summary.taxCents/summary.soldUnits):null,salesCents:summary.salesCents,salesTaxCents:summary.taxCents,customerPaymentsCents:summary.salesCents+summary.taxCents,returnedUnits:summary.returnedUnits,returnedInventoryValueCents:summary.returnedInventoryValueCents,damagedBaseCostCents:summary.damagedBaseCostCents,damagedPurchaseTaxCents:summary.damagedPurchaseTaxCents,salesLessDamageCents:summary.salesCents-summary.damagedBaseCostCents,estimatedTaxBalanceCents:summary.taxCents-summary.damagedPurchaseTaxCents,totalCollectedBeforeTaxCents:summary.salesCents,totalSalesTaxCents:summary.taxCents,grandTotalCents:summary.salesCents+summary.taxCents}}
function readSummaryHistory(){try{return JSON.parse(sessionStorage.getItem('cappeto_summary_snapshots')||'{}')}catch{return{}}}
function saveSummarySnapshot(snapshot){const history=readSummaryHistory();history[localDateKey()]=snapshot;const keys=Object.keys(history).sort().slice(-31);sessionStorage.setItem('cappeto_summary_snapshots',JSON.stringify(Object.fromEntries(keys.map(key=>[key,history[key]]))))}
const summaryCsvFields=[['purchasedUnits','purchasedUnits',false],['purchasePayment','purchasePaymentCents',true],['purchaseVatPaid','purchaseTaxCents',true],['purchaseDeliveryPaid','purchaseDeliveryCents',true],['unitCostBeforeTax','unitCostCents',true],['availableInventoryValue','inventoryValueCents',true],['averageSalePerUnit','averageSaleCents',true],['salesTaxPerUnit','salesTaxPerUnitCents',true],['salesBeforeTax','salesCents',true],['salesTaxCollected','salesTaxCents',true],['customerPayments','customerPaymentsCents',true],['returnedUnits','returnedUnits',false],['returnedInventoryValue','returnedInventoryValueCents',true],['damagedCostBeforeTax','damagedBaseCostCents',true],['damagedPurchaseTax','damagedPurchaseTaxCents',true],['salesLessDamage','salesLessDamageCents',true],['estimatedTaxBalance','estimatedTaxBalanceCents',true],['totalCollectedBeforeTax','totalCollectedBeforeTaxCents',true],['totalSalesTax','totalSalesTaxCents',true],['grandCustomerTotal','grandTotalCents',true]];
function csvCell(value){return`"${String(value??'').replaceAll('"','""')}"`}
function snapshotCsvRow(date,snapshot){return[date,...summaryCsvFields.map(([,key,currency])=>snapshot?.[key]===null||snapshot?.[key]===undefined?'':currency?(snapshot[key]/100).toFixed(2):snapshot[key])].map(csvCell).join(',')}
function downloadSummaryCsv(days){const selected=$('summaryReportDate').value||localDateKey();const history=readSummaryHistory();const dates=[];const end=new Date(`${selected}T12:00:00`);for(let offset=days-1;offset>=0;offset--){const date=new Date(end);date.setDate(end.getDate()-offset);dates.push(localDateKey(date))}if(days===1&&!history[selected]){toast(t('snapshotUnavailable'));return}const header=[t('reportDate'),...summaryCsvFields.map(([label])=>t(label))].map(csvCell).join(',');const note=csvCell(t('snapshotCsvNote'));const csv=`\uFEFF${note}\n${header}\n${dates.map(date=>snapshotCsvRow(date,history[date])).join('\n')}`;const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`cappeto-${days===1?'1-day':'10-day'}-${selected}.csv`;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(link.href)}
function renderFinancialWorkspace(){
  const summary=financialSummary();
  const grossProfitCents=summary.salesCents-summary.cogsCents;
  const netProductProfitCents=grossProfitCents-summary.damagedCostCents;
  const costValue=(cents,complete)=>complete?money(cents):t('notAvailableShort');
  $('inventoryUnits').textContent=t('inventoryUnitCount',{count:summary.inventoryUnits});
  $('inventoryValue').textContent=costValue(summary.inventoryValueCents,summary.inventoryCostComplete);
  $('salesValue').textContent=money(summary.salesCents);
  $('taxesValue').textContent=money(summary.taxCents);
  $('grossValue').textContent=costValue(grossProfitCents,summary.profitCostComplete);
  $('cogsValue').textContent=costValue(summary.cogsCents,summary.profitCostComplete);
  $('netValue').textContent=costValue(netProductProfitCents,summary.profitCostComplete);
  $('damagedValue').textContent=costValue(summary.damagedCostCents,summary.profitCostComplete);
  const snapshot=summarySnapshot(summary);
  $('summaryPurchasedUnits').textContent=String(snapshot.purchasedUnits);
  $('summaryPurchasePayment').textContent=money(snapshot.purchasePaymentCents);
  $('summaryPurchaseVat').textContent=money(snapshot.purchaseTaxCents);
  $('summaryPurchaseDelivery').textContent=money(snapshot.purchaseDeliveryCents);
  $('summaryUnitCost').textContent=snapshot.unitCostCents===null?t('notAvailableShort'):money(snapshot.unitCostCents);
  $('inventorySummaryValue').textContent=costValue(snapshot.inventoryValueCents,summary.inventoryCostComplete);
  $('summaryAverageSale').textContent=snapshot.averageSaleCents===null?t('notAvailableShort'):money(snapshot.averageSaleCents);
  $('summarySalesTaxUnit').textContent=snapshot.salesTaxPerUnitCents===null?t('notAvailableShort'):money(snapshot.salesTaxPerUnitCents);
  $('salesSummaryValue').textContent=money(snapshot.salesCents);
  $('taxesSummaryValue').textContent=money(snapshot.salesTaxCents);
  $('customerCollectedValue').textContent=money(snapshot.customerPaymentsCents);
  $('summaryReturnedUnits').textContent=String(snapshot.returnedUnits);
  $('summaryReturnedValue').textContent=money(snapshot.returnedInventoryValueCents);
  $('summaryDamagedBase').textContent=money(snapshot.damagedBaseCostCents);
  $('summaryDamagedTax').textContent=money(snapshot.damagedPurchaseTaxCents);
  $('summarySalesLessDamage').textContent=money(snapshot.salesLessDamageCents);
  $('summaryTaxBalance').textContent=money(snapshot.estimatedTaxBalanceCents);
  $('summaryCollectedBeforeTax').textContent=money(snapshot.totalCollectedBeforeTaxCents);
  $('summaryTotalSalesTax').textContent=money(snapshot.totalSalesTaxCents);
  $('summaryGrandTotal').textContent=money(snapshot.grandTotalCents);
  saveSummarySnapshot(snapshot);
  $('resetInventoryButton').disabled=summary.inventoryUnits===0;
  document.querySelectorAll('[data-finance-tab]').forEach(button=>{
    const active=button.dataset.financeTab===state.financeView;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
  });
  document.querySelectorAll('[data-finance-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.financePanel!==state.financeView));
}
function switchFinanceView(view){
  if(!['inventory','sales','taxes','gross','net','summary'].includes(view))return;
  state.financeView=view;
  if(view==='inventory')$('inventoryGoodsSection').open=true;
  else $('financeMenuSection').open=true;
  renderFinancialWorkspace();
}
function renderManager(){const products=state.products.filter(product=>productMatchesSearch(product,state.manageQuery));$('capacityLabel').textContent=`${state.products.length} / 20`;$('manageList').innerHTML=products.map(p=>{const copy=productCopy(p);return`<article class="manage-item"><div class="manage-product"><img src="${escapeHtml(p.imageUrl)}" alt=""><div class="manage-summary"><div><strong>${escapeHtml(copy.name)}</strong><span class="inventory-status ${p.stock<1?'sold-out':''}">${p.stock<1?t('soldOut'):t('inStock')}</span></div><small>${escapeHtml(copy.category)} · ${t('purchased')} ${escapeHtml(p.purchaseDate||t('notRecorded'))}</small></div></div><div class="item-price"><span>${t('price')}</span><strong>${money(p.priceCents)}</strong></div><div class="inventory-actions"><label class="inventory-control"><span>${t('quantity')}</span><input type="number" min="1" max="9999" step="1" value="1" aria-label="${t('quantity')} ${escapeHtml(copy.name)}" data-inventory-quantity="${p.id}"></label><label class="inventory-control inventory-action-select"><span>${t('inventoryAction')}</span><select aria-label="${t('inventoryAction')} ${escapeHtml(copy.name)}" data-inventory-action="${p.id}"><option value="add">${t('addInventory')}</option><option value="return">${t('return')}</option><option value="damage">${t('damage')}</option><option value="sold">${t('sold')}</option></select></label><label class="inventory-control"><span>${t('vatShort')}</span><input type="number" min="0" max="100" step="0.01" value="${Number(p.vatRate??state.vatRate)}" aria-label="${t('vat')} ${escapeHtml(copy.name)}" data-inventory-vat="${p.id}"></label><label class="inventory-control inventory-date"><span>${t('purchaseDate')}</span><input type="date" value="${escapeHtml(p.purchaseDate||'')}" aria-label="${t('purchaseDate')} ${escapeHtml(copy.name)}" data-inventory-date="${p.id}"></label><div class="inventory-action-buttons" aria-label="${t('productActions')} ${escapeHtml(copy.name)}"><button class="button inventory-button" type="button" data-inventory-apply="${p.id}">${t('apply')}</button><button class="button edit-button" type="button" data-edit="${p.id}">${t('edit')}</button><button class="delete-button" type="button" data-delete="${p.id}">${t('delete')}</button></div></div></article>`}).join('')||`<p class="empty-state">${t('noInventory')}</p>`;updateProductAction()}
function renderPurchaseTotals(){
  const quantity=Math.max(0,Number($('productStock').value)||0);
  const unitCostCents=Math.round(Math.max(0,Number($('productProcurementCost').value)||0)*100);
  const taxRate=Math.max(0,Number($('productPurchaseTax').value)||0);
  const deliveryCents=Math.round(Math.max(0,Number($('productPurchaseDelivery').value)||0)*100);
  const subtotalCents=quantity*unitCostCents;
  const taxCents=Math.round(subtotalCents*taxRate/100);
  $('purchaseSubtotal').textContent=money(subtotalCents);
  $('purchaseTaxAmount').textContent=money(taxCents);
  $('purchaseTotal').textContent=money(subtotalCents+taxCents+deliveryCents);
}
function renderProductPreview(){renderPurchaseTotals();const value=(id,fallback)=>$(id).value.trim()||fallback;$('previewName').textContent=value('productName',t('productName'));$('previewCategory').textContent=value('productCategory',t('category'));$('previewPrice').textContent=money(Math.round((Number($('productPrice').value)||0)*100));$('previewVat').textContent=`${Number($('productVat').value)||0}%`;$('previewStock').textContent=String(Number($('productStock').value)||0);$('previewDate').textContent=$('productPurchaseDate').value||t('notSelected');$('previewDescription').textContent=value('productDescription',t('shortDescription'))}
function updateProductAction(){const button=$('productSubmitButton');const updateButton=$('updateItemButton');const editing=Boolean(state.editingProductId);const atCapacity=state.products.length>=20;const complete=$('productForm').checkValidity()&&Boolean(state.imageData);button.textContent=editing?t('updateProduct'):t('publishProduct');button.classList.toggle('hidden',!complete||(!editing&&atCapacity));updateButton.disabled=!editing||!complete;$('capacityMessage').classList.toggle('hidden',editing||!atCapacity)}
function clearProductForm(message=''){state.editingProductId=null;state.imageData='';$('productForm').reset();$('productVat').value='15';for(const id of ['uploadPreview','previewPicture']){$(id).style.backgroundImage='';$(id).classList.remove('has-image')}renderProductPreview();updateProductAction();$('productMessage').textContent=message}
function editProduct(product){$('productEntrySection').open=true;state.editingProductId=product.id;$('productName').value=product.name;$('productCategory').value=product.category;$('productPrice').value=(product.priceCents/100).toFixed(2);$('productProcurementCost').value=product.procurementCostCents?((product.procurementCostCents/100).toFixed(2)):'';$('productPurchaseTax').value=product.purchaseTaxRate||'';$('productPurchaseDelivery').value=product.purchaseDeliveryCents?((product.purchaseDeliveryCents/100).toFixed(2)):'';$('productVat').value=Number(product.vatRate??state.vatRate);$('productStock').value=product.stock;$('productPurchaseDate').value=product.purchaseDate||'';$('productDescription').value=product.description;state.imageData=product.imageUrl;for(const id of ['uploadPreview','previewPicture']){$(id).style.backgroundImage=`url(${product.imageUrl})`;$(id).classList.add('has-image')}renderProductPreview();updateProductAction();$('productForm').scrollIntoView({behavior:'smooth',block:'start'});$('productMessage').textContent=t('editing',{name:productCopy(product).name})}
function openCart(open){if(open)openSiteMenu(false);$('cartDrawer').classList.toggle('open',open);$('scrim').classList.toggle('open',open);$('cartDrawer').setAttribute('aria-hidden',String(!open));document.body.classList.toggle('cart-open',open);if(open)$('closeCart').focus()}
function switchView(view){if(view==='tutorial'&&!state.staff){showAuth('signin');return}$('catalogView').classList.toggle('hidden',view!=='catalog');$('manageView').classList.toggle('hidden',view!=='manage');$('settingsView').classList.toggle('hidden',view!=='settings');$('tutorialView').classList.toggle('hidden',view!=='tutorial');document.querySelectorAll('.nav-button').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});$('ownerSettingsButton').classList.toggle('active',view==='settings');$('ownerSettingsButton').setAttribute('aria-pressed',String(view==='settings'));if(view==='tutorial')$('tutorialTitle').focus?.()}

function openSiteMenu(open){
  $('siteMenu').classList.toggle('open',open);
  $('siteMenu').setAttribute('aria-hidden',String(!open));
  $('siteMenuScrim').hidden=!open;
  document.body.classList.toggle('site-menu-open',open);
  document.querySelectorAll('[data-site-menu-toggle]').forEach(button=>{button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',t(open?'closeNavigation':'openNavigation'))});
  if(open)$('siteMenuClose').focus();
}

document.querySelectorAll('[data-site-menu-toggle]').forEach(button=>button.addEventListener('click',()=>openSiteMenu(button.getAttribute('aria-expanded')!=='true')));
$('siteMenuClose').addEventListener('click',()=>openSiteMenu(false));
$('siteMenuScrim').addEventListener('click',()=>openSiteMenu(false));
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if($('cartDrawer').classList.contains('open'))openCart(false);else if($('siteMenu').classList.contains('open'))openSiteMenu(false)});
document.querySelectorAll('[data-site-route]').forEach(button=>button.addEventListener('click',async()=>{
  const route=button.dataset.siteRoute;
  openSiteMenu(false);
  if(route==='home')showLanding();
  else if(route==='signin')showAuth('signin');
  else if(route==='signup')showAuth('signup');
  else if(route==='logout')$('logoutButton').click();
  else{if(['tutorial','manage','settings'].includes(route)&&!state.staff){showAuth('signin');return}if(!state.products.length)await loadCatalog();enterApp();switchView(route)}
}));


function loadBusinessProfile(){try{return{...defaultBusinessProfile,...JSON.parse(sessionStorage.getItem('cappeto_business_profile')||'{}')}}catch{return{...defaultBusinessProfile}}}
function paintBusinessLogo(element,logo,name){element.style.backgroundImage=logo?`url("${logo}")`:'';element.classList.toggle('has-logo',Boolean(logo));const label=element.querySelector('span')||element;label.textContent=logo?'':(name.trim().charAt(0)||'C').toUpperCase()}
function applyBusinessProfile(fillForm=false){$('businessWordmark').textContent=businessProfile.name||'Cappeto';paintBusinessLogo($('businessLogoMark'),businessProfile.logo,businessProfile.name);paintBusinessLogo($('businessLogoPreview'),pendingBusinessLogo,businessProfile.name);if(fillForm){$('businessName').value=businessProfile.name;$('businessAddress').value=businessProfile.address;$('businessPhone').value=businessProfile.phone;$('businessEmail').value=businessProfile.email;$('businessCurrency').value=businessProfile.currency||'USD';$('businessProfileMessage').textContent=''}}
async function toBusinessLogo(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('chooseImage');if(file.size>8*1024*1024)throw new Error('imageSize');const bitmap=await createImageBitmap(file);const scale=Math.min(1,400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.82)}
applyBusinessProfile();
const rememberedEmail=previewHelpers.restoreRememberedEmail();if(rememberedEmail){$('staffEmail').value=rememberedEmail;$('rememberMe').checked=true}
const summaryToday=localDateKey();$('summaryReportDate').max=summaryToday;$('summaryReportDate').value=summaryToday;
$('downloadDaySummary').addEventListener('click',()=>downloadSummaryCsv(1));
$('downloadTenDaySummary').addEventListener('click',()=>downloadSummaryCsv(10));

$('openSignIn').addEventListener('click',()=>showAuth('signin'));$('openSignUp').addEventListener('click',()=>showAuth('signup'));$('landingCreateAccount').addEventListener('click',()=>showAuth('signup'));$('authBack').addEventListener('click',showLanding);document.querySelectorAll('[data-auth-home]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();showLanding()}));
$('signInTab').addEventListener('click',()=>setAuthMode('signin'));$('signUpTab').addEventListener('click',()=>setAuthMode('signup'));
[['gmailButton','Gmail'],['appleButton','Apple']].forEach(([id,provider])=>$(id).addEventListener('click',()=>{$('authError').textContent=t('providerBackendRequired',{provider})}));
$('passwordToggle').addEventListener('click',()=>{const visible=$('authCode').type==='text';$('authCode').type=visible?'password':'text';$('passwordToggle').textContent=t(visible?'showPassword':'hidePassword');$('passwordToggle').setAttribute('aria-pressed',String(!visible));$('authCode').focus()});
$('landingBrowse').addEventListener('click',async()=>{showStaffControls(false);await loadCatalog();enterApp()});
$('forgotPassword').addEventListener('click',()=>{$('authError').textContent=t('passwordResetInfo')});
$('authForm').addEventListener('submit',async event=>{event.preventDefault();$('authError').textContent='';if(event.currentTarget.dataset.mode==='signup'){if($('authCode').value!==$('confirmPassword').value){$('authError').textContent=t('passwordMismatch');return}$('authError').textContent=t('signupBackendRequired');return}const button=$('signInButton');button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=t('signingIn');try{const email=$('staffEmail').value.trim();const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password:$('authCode').value})});previewHelpers.persistRememberedEmail(sessionStorage,email,$('rememberMe').checked);state.staff=result.user;state.csrf=result.csrfToken;showStaffControls(true);await loadCatalog();enterApp()}catch(error){$('authError').textContent=localizeError(error)}finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=t('signIn')}});
$('browseButton').addEventListener('click',async()=>{showStaffControls(false);await loadCatalog();enterApp()});
$('tutorialAccess').addEventListener('click',async()=>{
  sessionStorage.setItem(TUTORIAL_SESSION_KEY,'active');
  state.staff=tutorialOwner();
  state.csrf='';
  showStaffControls(true);
  await loadCatalog();
  enterApp();
});
$('logoutButton').addEventListener('click',async()=>{const tutorialSession=Boolean(state.staff&&state.staff.tutorial);if(tutorialSession){sessionStorage.removeItem(TUTORIAL_SESSION_KEY);state.staff=null;state.csrf='';showStaffControls(false);showLanding();return}try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch(error){if(!error||error.message!=='Unauthorized')throw error}finally{location.reload()}});
$('categoryRow').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.category=button.dataset.category;state.carouselIndex=0;renderCategories();renderProducts()});
$('productGrid').addEventListener('click',event=>{const id=event.target.closest('[data-add]')?.dataset.add;if(!id)return;const p=state.products.find(item=>item.id===id);const quantity=Math.min((state.cart.get(id)||0)+1,p.stock);state.cart.set(id,quantity);renderCart();toast(t('productAdded',{name:productCopy(p).name}))});
$('searchInput').addEventListener('input',event=>{state.query=event.target.value;state.carouselIndex=0;renderProducts()});
$('previousProduct').addEventListener('click',()=>moveCarousel(-1));$('nextProduct').addEventListener('click',()=>moveCarousel(1));
$('productGrid').addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();moveCarousel(1)}if(event.key==='ArrowLeft'){event.preventDefault();moveCarousel(-1)}});
$('productGrid').addEventListener('scroll',()=>{clearTimeout(state.carouselTimer);state.carouselTimer=setTimeout(()=>{const step=carouselStep();if(step){state.carouselIndex=Math.round($('productGrid').scrollLeft/step);updateCarouselStatus()}},80)});
window.addEventListener('resize',()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(()=>{state.carouselIndex=0;$('productGrid').scrollTo({left:0});updateCarouselStatus()},120)});
$('cartButton').addEventListener('click',()=>openCart(true));$('closeCart').addEventListener('click',()=>openCart(false));$('scrim').addEventListener('click',()=>openCart(false));
$('clearOrder').addEventListener('click',()=>{if(!state.cart.size)return;state.cart.clear();renderCart();toast(t('orderCleared'))});
$('cartLines').addEventListener('click',event=>{const plus=event.target.closest('[data-plus]')?.dataset.plus;const minus=event.target.closest('[data-minus]')?.dataset.minus;const id=plus||minus;if(!id)return;const p=state.products.find(item=>item.id===id);const next=(state.cart.get(id)||0)+(plus?1:-1);if(next<=0)state.cart.delete(id);else state.cart.set(id,Math.min(next,p.stock));renderCart()});
document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view)));
$('ownerSettingsButton').addEventListener('click',()=>{pendingBusinessLogo=businessProfile.logo;applyBusinessProfile(true);switchView('settings');$('settingsTitle').focus?.()});
$('businessLogo').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{pendingBusinessLogo=await toBusinessLogo(file);paintBusinessLogo($('businessLogoPreview'),pendingBusinessLogo,$('businessName').value||businessProfile.name);$('businessProfileMessage').textContent=''}catch(error){$('businessProfileMessage').textContent=localizeError(error)}});
$('businessName').addEventListener('input',()=>paintBusinessLogo($('businessLogoPreview'),pendingBusinessLogo,$('businessName').value||'Cappeto'));
$('businessProfileForm').addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.checkValidity()){event.currentTarget.reportValidity();return}businessProfile={name:$('businessName').value.trim(),logo:pendingBusinessLogo,address:$('businessAddress').value.trim(),phone:$('businessPhone').value.trim(),email:$('businessEmail').value.trim(),currency:$('businessCurrency').value};sessionStorage.setItem('cappeto_business_profile',JSON.stringify(businessProfile));applyBusinessProfile();$('businessProfileMessage').textContent=t('settingsSaved');toast(t('settingsSaved'))});
$('productImage').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{state.imageData=await toWebP(file);for(const id of ['uploadPreview','previewPicture']){$(id).style.backgroundImage=`url(${state.imageData})`;$(id).classList.add('has-image')}$('productMessage').textContent='';updateProductAction()}catch(error){state.imageData='';$('productMessage').textContent=localizeError(error);updateProductAction()}});
$('removePictureButton').addEventListener('click',()=>{state.imageData='';$('productImage').value='';for(const id of ['uploadPreview','previewPicture']){$(id).style.backgroundImage='';$(id).classList.remove('has-image')}updateProductAction();$('productMessage').textContent=t('pictureRequired')});
$('productForm').addEventListener('input',()=>{renderProductPreview();updateProductAction()});
$('clearProductButton').addEventListener('click',()=>clearProductForm(t('fieldsCleared')));
async function toWebP(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('chooseImage');if(file.size>8*1024*1024)throw new Error('imageSize');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.84)}
$('productForm').addEventListener('submit',async event=>{event.preventDefault();if(!event.target.checkValidity()||!state.imageData){$('productMessage').textContent=t('pictureRequired');return}const editingId=state.editingProductId;const payload={name:$('productName').value,category:$('productCategory').value,description:$('productDescription').value,price:Number($('productPrice').value),procurementCost:Number($('productProcurementCost').value)||0,purchaseTaxRate:Number($('productPurchaseTax').value)||0,purchaseDeliveryCost:Number($('productPurchaseDelivery').value)||0,vatRate:Number($('productVat').value),stock:Number($('productStock').value),purchaseDate:$('productPurchaseDate').value,imageData:state.imageData};try{await api(editingId?`/api/products/${encodeURIComponent(editingId)}`:'/api/products',{method:editingId?'PUT':'POST',body:JSON.stringify(payload)});clearProductForm(t(editingId?'updated':'published'));await loadCatalog();$('manageList').scrollIntoView({behavior:'smooth',block:'start'})}catch(error){$('productMessage').textContent=localizeError(error)}});
$('resetInventoryButton').addEventListener('click',async()=>{
  const button=$('resetInventoryButton');
  if(financialSummary().inventoryUnits===0){toast(t('inventoryAlreadyZero'));return}
  if(!confirm(t('resetInventoryConfirm')))return;
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  try{
    await api('/api/inventory/reset',{method:'POST',body:'{}'});
    await loadCatalog();
    toast(t('inventoryReset'));
  }catch(error){
    button.disabled=false;
    toast(localizeError(error));
  }finally{
    button.removeAttribute('aria-busy');
  }
});
document.querySelectorAll('.tax-disclosure-button').forEach(button=>button.addEventListener('click',()=>{
  const disclosure=$('taxDisclosure');
  const open=button.getAttribute('aria-expanded')==='true';
  button.setAttribute('aria-expanded',String(!open));
  disclosure.classList.toggle('hidden',open);
}));
document.querySelector('.finance-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-finance-tab]');
  if(!button)return;
  switchFinanceView(button.dataset.financeTab);
});
document.querySelector('.finance-tabs').addEventListener('keydown',event=>{
  const tabs=[...document.querySelectorAll('[data-finance-tab]')];
  const current=tabs.indexOf(document.activeElement);
  if(current<0)return;
  let next=current;
  if(event.key==='ArrowRight')next=(current+1)%tabs.length;
  else if(event.key==='ArrowLeft')next=(current-1+tabs.length)%tabs.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=tabs.length-1;
  else return;
  event.preventDefault();
  switchFinanceView(tabs[next].dataset.financeTab);
  tabs[next].focus();
});
$('manageSearch').addEventListener('input',event=>{state.manageQuery=event.target.value;renderManager()});
$('manageList').addEventListener('click',async event=>{const editId=event.target.closest('[data-edit]')?.dataset.edit;if(editId){const product=state.products.find(item=>item.id===editId);if(product)editProduct(product);return}const applyId=event.target.closest('[data-inventory-apply]')?.dataset.inventoryApply;if(applyId){const escaped=CSS.escape(applyId);const quantity=Number(document.querySelector(`[data-inventory-quantity="${escaped}"]`).value);const action=document.querySelector(`[data-inventory-action="${escaped}"]`).value;const vatRate=Number(document.querySelector(`[data-inventory-vat="${escaped}"]`).value);const purchaseDate=document.querySelector(`[data-inventory-date="${escaped}"]`).value;try{await api(`/api/products/${encodeURIComponent(applyId)}/inventory`,{method:'PATCH',body:JSON.stringify({action,quantity,vatRate,purchaseDate})});await loadCatalog();toast(t('inventoryUpdated'))}catch(error){toast(localizeError(error))}return}const id=event.target.closest('[data-delete]')?.dataset.delete;if(!id||!confirm(t('deleteConfirm')))return;try{await api(`/api/products/${encodeURIComponent(id)}`,{method:'DELETE'});state.cart.delete(id);await loadCatalog();toast(t('productDeleted'))}catch(error){toast(localizeError(error))}});
$('placeOrder').addEventListener('click',async()=>{const items=[...state.cart].map(([productId,quantity])=>({productId,quantity}));try{const result=await api('/api/orders',{method:'POST',body:JSON.stringify({items})});state.cart.clear();await loadCatalog();openCart(false);toast(t('orderPlaced',{id:result.orderId,total:money(result.totalCents)}))}catch(error){toast(localizeError(error))}});

api('/api/auth/session').then(async result=>{if(result.authenticated){state.staff=result.user;state.csrf=result.csrfToken;showStaffControls(true);await loadCatalog();enterApp()}}).catch(()=>{});
