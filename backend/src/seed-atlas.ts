import 'dotenv/config';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Long, MongoClient } from 'mongodb';
import { ensureAtlasIndexes } from './infrastructure/indexes.js';
import type {
  HubDocument,
  MerchantDocument,
  ProductDocument,
  ProvenanceDocument,
  Role,
  SettingDocument,
  TariffRuleDocument,
  ThreatDocument,
  TrustLedgerDocument,
  UserDocument
} from './repositories/contracts.js';

const hubs: Array<Omit<HubDocument,'_id'> & {_id:string}> = [
  { _id:'HUB-NYC', code:'HUB-NYC', name:'New York', x:0.18, y:0.31, latencyMs:42, status:'online', queueDepth:8 },
  { _id:'HUB-ZRH', code:'HUB-ZRH', name:'Zurich', x:0.42, y:0.24, latencyMs:34, status:'online', queueDepth:12 },
  { _id:'HUB-DXB', code:'HUB-DXB', name:'Dubai', x:0.61, y:0.46, latencyMs:51, status:'online', queueDepth:19 },
  { _id:'HUB-SIN', code:'HUB-SIN', name:'Singapore', x:0.82, y:0.67, latencyMs:39, status:'online', queueDepth:7 },
  { _id:'HUB-KHI', code:'HUB-KHI', name:'Karachi', x:0.69, y:0.72, latencyMs:146, status:'warning', queueDepth:31 }
];

const catalog = [
  ['AUD-001','Studio Monitor Headphones','Auralis','Audio and Studio','8518.30.20',349,5,42,94,'HUB-ZRH'],
  ['AUD-002','Reference Studio DAC','Auralis','Audio and Studio','8518.40.20',429,5,8,98,'HUB-ZRH'],
  ['AUD-003','Wireless Master Headphones','Northstar Audio','Audio and Studio','8518.30.20',279,5,26,96,'HUB-NYC'],
  ['AUD-004','Ribbon Microphone','Sonora Labs','Audio and Studio','8518.10.00',549,4,4,91,'HUB-ZRH'],
  ['AUD-005','Portable Field Recorder','Sonora Labs','Audio and Studio','8519.81.00',319,4,17,97,'HUB-SIN'],
  ['AUD-006','Reference Monitor Pair','Auralis','Audio and Studio','8518.22.00',899,5,11,99,'HUB-ZRH'],
  ['HOR-004','Automatic Dress Watch','Meridian','Precision Horology','9102.11.00',1280,4,9,99,'HUB-ZRH'],
  ['HOR-005','GMT Explorer Watch','Meridian','Precision Horology','9102.21.00',1890,4,3,98,'HUB-ZRH'],
  ['HOR-006','Mechanical Field Watch','Atelier Nine','Precision Horology','9102.21.00',760,4,14,96,'HUB-NYC'],
  ['HOR-007','Moonphase Calendar','Atelier Nine','Precision Horology','9102.21.00',2350,4,5,99,'HUB-ZRH'],
  ['HOR-008','Automatic Diver 300','Meridian','Precision Horology','9102.21.00',1490,4,18,97,'HUB-DXB'],
  ['HOR-009','Skeleton Edition Watch','Atelier Nine','Precision Horology','9102.21.00',3180,4,2,99,'HUB-ZRH'],
  ['EDG-009','Edge Inference Module','Nexora','Edge Computing','8471.50.00',612,0,25,98,'HUB-SIN'],
  ['EDG-010','Compact AI Accelerator','Nexora','Edge Computing','8471.50.00',845,0,7,97,'HUB-SIN'],
  ['EDG-011','Industrial Vision Gateway','Vector Forge','Edge Computing','8517.62.00',1290,2,15,96,'HUB-DXB'],
  ['EDG-012','Secure Compute Node','Vector Forge','Edge Computing','8471.50.00',1740,0,6,99,'HUB-NYC'],
  ['EDG-013','Low-Power NPU Board','Nexora','Edge Computing','8471.50.00',389,0,31,95,'HUB-SIN'],
  ['EDG-014','Industrial Edge Server','Vector Forge','Edge Computing','8471.50.00',2490,0,3,98,'HUB-DXB'],
  ['OPT-013','Mirrorless Prime Lens','Lumina Optics','Optics and Gear','9002.11.00',890,3,13,99,'HUB-ZRH'],
  ['OPT-014','Wide-Angle Cinema Lens','Lumina Optics','Optics and Gear','9002.11.00',1450,3,5,98,'HUB-ZRH'],
  ['OPT-015','Thermal Imaging Scope','Aster Instruments','Optics and Gear','9005.80.00',780,3,12,94,'HUB-DXB'],
  ['OPT-016','Precision Rangefinder','Aster Instruments','Optics and Gear','9015.10.00',520,2,4,96,'HUB-KHI'],
  ['OPT-017','Low-Light Monocular','Aster Instruments','Optics and Gear','9005.80.00',640,3,19,97,'HUB-SIN'],
  ['OPT-018','Anamorphic Cine Lens','Lumina Optics','Optics and Gear','9002.11.00',2190,3,2,99,'HUB-ZRH']
] as const;

const tariffBases: Record<TariffRuleDocument['country'],{duty:number;vat:number}> = {
  US:{duty:0.04,vat:0.08}, UK:{duty:0.045,vat:0.20}, EU:{duty:0.05,vat:0.19},
  AE:{duty:0.05,vat:0.05}, PK:{duty:0.10,vat:0.18}, SG:{duty:0.03,vat:0.09}
};
const imageIds = [
  '1505740420928-5e560c06d30e','1524592094714-0f0654e20314','1518441902117-f0a3a4a9d4d8',
  '1516035069371-29a1b244cc32','1498050108023-c5249f4df085','1523275335684-37898b6baf30',
  '1511379938547-c1f69419868d','1516575150278-77136aed6920'
];
const stages = ['Factory-stage sample','Vault intake sample','Customs pre-clearance sample','Dispatch sample'];
const stageHubs = ['HUB-ZRH','HUB-DXB','HUB-KHI','HUB-SIN'];

function required(name:string):string {
  const value=process.env[name]?.trim();
  if(!value) throw new Error(name+' must be configured.');
  return value;
}
function productId(sku:string):string { return 'p_'+sku.toLowerCase().replace('-','_'); }

async function seed():Promise<void> {
  if(process.env.NODE_ENV==='production') throw new Error('Atlas demo seed is disabled in production.');
  const dbName=required('MONGODB_DB_NAME');
  if(!['verifymart_dev','verifymart_staging'].includes(dbName)) throw new Error('Atlas demo seed is restricted to dev/staging.');
  const client=new MongoClient(required('MONGODB_URI'),{appName:process.env.MONGODB_APP_NAME??'VerifyMart-Seed'});
  try {
    await client.connect();
    const database=client.db(dbName);
    await database.command({ping:1});
    await ensureAtlasIndexes(database);
    const now=new Date();

    for(const hub of hubs) {
      await database.collection<HubDocument>('hubs').updateOne({_id:hub._id},{$setOnInsert:hub},{upsert:true});
    }

    const products=database.collection<ProductDocument>('products');
    const productCount=await products.countDocuments();
    if(productCount===0) {
      const eventDate=Date.now();
      const records:ProductDocument[] = catalog.map((row,index)=>{
        const [sku,name,brand,category,hsCode,price,duty,stock,score,hub]=row;
        const skuText=String(sku), nameText=String(name), brandText=String(brand);
        const hs=String(hsCode), priceUsd=Number(price), stockCount=Number(stock), authenticity=Number(score);
        const batchHash=createHash('sha256').update(JSON.stringify({sku:skuText,name:nameText,brand:brandText,hsCode:hs,price:priceUsd})).digest('hex');
        const id=productId(skuText);
        const events:ProvenanceDocument[]=stages.map((stage,step)=>{
          const occurredAt=new Date(eventDate-(4-step)*86_400_000-index*60_000);
          return {
            id:'evt_'+skuText.toLowerCase()+'_'+(step+1),
            stage,
            hubId:step===0?String(hub):(stageHubs[step] ?? 'HUB-SIN'),
            occurredAt,
            hash:createHash('sha256').update(batchHash+':'+stage+':'+String(hub)+':'+occurredAt.toISOString()).digest('hex'),
            simulated:true
          };
        });
        const state=stockCount<=5?'low_stock':authenticity<93?'audit_flag':'verified';
        return {
          _id:id, sku:skuText, batchHash, hsCode:hs, name:nameText, brand:brandText,
          category:String(category), priceCents:Long.fromNumber(priceUsd*100),
          stock:stockCount, reorderThreshold:5, originHubId:String(hub),
          authenticityScore:authenticity, slaHours:24+(index%48),
          imageUrl:'https://images.unsplash.com/photo-'+(imageIds[index%imageIds.length] ?? imageIds[0])+'?auto=format&fit=crop&w=900&q=80',
          status:state, listingStatus:'published', merchantId:null, managedBy:'platform',
          provenanceEvents:events, createdAt:now, updatedAt:now
        };
      });
      await products.insertMany(records,{ordered:true});
    }

    const tariffCollection=database.collection<TariffRuleDocument>('tariffRules');
    for(const [country,rates] of Object.entries(tariffBases) as Array<[TariffRuleDocument['country'],{duty:number;vat:number}]>) {
      const baseId='tariff_'+country.toLowerCase();
      await tariffCollection.updateOne({_id:baseId},{$setOnInsert:{
        _id:baseId,hsPrefix:'',country,dutyRateBps:Math.round(rates.duty*10000),
        vatRateBps:Math.round(rates.vat*10000),vatIncludesCarrier:true,source:'seed-tariff-v1'
      }},{upsert:true});
      const prefixes=new Map<string,number>();
      for(const item of catalog) {
        const prefix=String(item[4]).slice(0,7);
        prefixes.set(prefix,Math.max(prefixes.get(prefix)??0,Number(item[6])/100));
      }
      for(const [prefix,productRate] of prefixes) {
        const id=baseId+'_'+prefix.replaceAll('.','');
        await tariffCollection.updateOne({_id:id},{$setOnInsert:{
          _id:id,hsPrefix:prefix,country,dutyRateBps:Math.round(Math.min(0.45,rates.duty+productRate)*10000),
          vatRateBps:Math.round(rates.vat*10000),vatIncludesCarrier:true,source:'seed-tariff-v1'
        }},{upsert:true});
      }
    }

    const threatCollection=database.collection<ThreatDocument>('threats');
    if(await threatCollection.countDocuments()===0) {
      const lowStock=await products.find({status:'low_stock'}).limit(2).toArray();
      for(let i=0;i<lowStock.length;i++) {
        const product=lowStock[i];
        if(!product) continue;
        await threatCollection.insertOne({
          _id:'threat_stock_'+(i+1),type:'Low stock',severity:'WARN',
          productId:product._id,detectedAt:now,resolvedAt:null
        });
      }
      const auditFlag=await products.findOne({status:'audit_flag'});
      if(auditFlag) await threatCollection.insertOne({
        _id:'threat_auth_1',type:'Counterfeit signal',severity:'CRITICAL',
        productId:auditFlag._id,detectedAt:now,resolvedAt:null
      });
    }

    const settingDefaults:[string,number][]=[
      ['authenticityConfidenceFloor',92],['customsSurgeBuffer',15],['maxEscrowHoldHours',72]
    ];
    for(const [key,value] of settingDefaults) {
      await database.collection<SettingDocument>('settings').updateOne({key},{$setOnInsert:{_id:key,key,value,updatedAt:now}},{upsert:true});
    }

    const demoPassword=process.env.DEMO_PASSWORD;
    if(demoPassword) {
      if(demoPassword.length<10) throw new Error('DEMO_PASSWORD must contain at least 10 characters.');
      const definitions:Array<{id:string;name:string;email:string;role:Role}>=[
        {id:'user_admin',name:'Haseeb Khan',email:'admin@verifymart.ai',role:'admin'},
        {id:'user_operator',name:'Elena Rostova',email:'auditor@verifymart.ai',role:'operator'},
        {id:'user_shopper',name:'Alex Mercer',email:'shopper@verifymart.ai',role:'shopper'},
        {id:'user_inventory',name:'Inventory Manager',email:'inventory@verifymart.ai',role:'inventory_manager'},
        {id:'user_merchant',name:'Demo Merchant',email:'merchant@verifymart.ai',role:'merchant'}
      ];
      const hash=await bcrypt.hash(demoPassword,12);
      const users=database.collection<UserDocument>('users');
      for(const user of definitions) {
        await users.updateOne({email:user.email},{$setOnInsert:{
          _id:user.id,name:user.name,email:user.email,passwordHash:hash,role:user.role,
          failedLogins:0,lockedUntil:null,lastLogin:null,disabledAt:null,
          createdAt:now,refreshSessions:[]
        }},{upsert:true});
      }
      await database.collection<MerchantDocument>('merchants').updateOne(
        {userId:'user_merchant'},
        {$setOnInsert:{
          _id:'merchant_demo',userId:'user_merchant',businessName:'VerifyMart Demo Merchant',
          country:'PK',status:'approved',trustScore:965,createdAt:now,updatedAt:now
        }},
        {upsert:true}
      );
      const trust=database.collection<TrustLedgerDocument>('trustLedger');
      const demoEntries=[
        ['trust_1',80,'On-time fulfillment'],['trust_2',120,'Verified provenance'],
        ['trust_3',65,'Low dispute rate'],['trust_4',100,'Consistent SLA']
      ] as const;
      for(let i=0;i<demoEntries.length;i++) {
        const entry=demoEntries[i];
        if(!entry) continue;
        const [id,delta,reason]=entry;
        await trust.updateOne({_id:id},{$setOnInsert:{
          _id:id,merchantId:'merchant_demo',delta,reason,
          at:new Date(now.getTime()-(4-i)*86_400_000)
        }},{upsert:true});
      }
    }

    const counts:Record<string,number>={};
    for(const name of ['users','merchants','products','hubs','tariffRules','orders','threats','inventoryAdjustments','auditLog','settings','trustLedger']) {
      counts[name]=await database.collection(name).countDocuments();
    }
    console.log('Atlas dev seed completed. Provenance events and seed metrics are marked simulated.');
    console.log(JSON.stringify(counts));
  } finally {
    await client.close();
  }
}


seed().catch((error:unknown)=>{
  const message=error instanceof Error?error.message:'Unknown Atlas seed failure';
  console.error('Atlas seed failed: '+message);
  process.exitCode=1;
});
