import { EventEmitter } from 'node:events';

export interface OrderRealtimeEvent {
  type: 'ORDER_ESCROW_CREATED' | 'ORDER_ESCROW_UPDATED';
  orderId: string;
  ownerUserId: string | null;
  state: 'held' | 'released' | 'refunded' | 'on_hold';
  createdAt: string;
  simulated: true;
}

const emitter = new EventEmitter();

export function publishOrderEvent(event: OrderRealtimeEvent): void {
  emitter.emit('order-event', event);
}

export function subscribeOrderEvents(handler: (event: OrderRealtimeEvent) => void): () => void {
  emitter.on('order-event', handler);
  return () => emitter.off('order-event', handler);
}
