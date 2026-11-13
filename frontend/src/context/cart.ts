import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product,Destination } from '@verifymart/shared';
type CartLine={product:Product;quantity:number};
type CartState={items:CartLine[];destination:Destination;open:boolean;add:(product:Product)=>void;remove:(id:string)=>void;setQty:(id:string,quantity:number)=>void;setDestination:(destination:Destination)=>void;setOpen:(open:boolean)=>void;clear:()=>void};
export const useCart=create<CartState>()(persist((set)=>({items:[],destination:'PK',open:false,
  add:(product)=>set(s=>({items:s.items.some(i=>i.product.id===product.id)?s.items.map(i=>i.product.id===product.id?{...i,quantity:Math.min(20,i.quantity+1)}:i):[...s.items,{product,quantity:1}],open:true})),
  remove:(id)=>set(s=>({items:s.items.filter(i=>i.product.id!==id)})),
  setQty:(id,quantity)=>set(s=>({items:quantity<=0?s.items.filter(i=>i.product.id!==id):s.items.map(i=>i.product.id===id?{...i,quantity:Math.min(20,quantity)}:i)})),
  setDestination:(destination)=>set({destination}),setOpen:(open)=>set({open}),clear:()=>set({items:[]})
}),{name:'verifymart-cart'}));
