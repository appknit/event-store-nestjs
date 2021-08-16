import { Injectable } from '@nestjs/common';
import { IEvent } from '@nestjs/cqrs/dist/interfaces';
import { EventStore, parseHrtimeToSeconds } from './eventstore';
import { StorableEvent } from './interfaces';
import { IExtendedEventBus, ViewEventBus } from './view';
import { AggregateRootAsync } from './aggregate-root-async';

export interface IEventStore {
  isInitiated(): boolean;
  getEvents(aggregate: string, id: string): Promise<any[]>;
  // getEvents(aggregate: string, id: string): Promise<StorableEvent[]>;
  getEvent(number): Promise<StorableEvent>;
  storeEvent<T extends StorableEvent>(event: T): Promise<void>;
}

@Injectable()
export class StoreEventBus implements IExtendedEventBus {
  constructor(
    private readonly eventBus: ViewEventBus,
    private readonly eventStore: EventStore,
  ) {}

  async publishAsync<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void> {
    const storableEvent = (event as any) as StorableEvent;
    if (
      storableEvent.id === undefined ||
      storableEvent.eventAggregate === undefined ||
      storableEvent.eventVersion === undefined
    ) {
      throw new Error('Events must implement StorableEvent interface');
    }
    try {
      const storeEvent = process.hrtime();
      await this.eventStore.storeEvent(storableEvent);
      console.log(`StoreEventBus->storeEvent took time: ${parseHrtimeToSeconds(process.hrtime(storeEvent))}`);
      const publish = process.hrtime();
      const publishRes = this.eventBus.publish(event, rootAggregator);
      console.log(`StoreEventBus->publish took time: ${parseHrtimeToSeconds(process.hrtime(publish))}`);
      return publishRes;
    } catch (err) {
      throw err;
    }
  }

  publish<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void> {
    const storableEvent = (event as any) as StorableEvent;
    if (
      storableEvent.id === undefined ||
      storableEvent.eventAggregate === undefined ||
      storableEvent.eventVersion === undefined
    ) {
      throw new Error('Events must implement StorableEvent interface');
    }
    return this.eventStore
      .storeEvent(storableEvent)
      .then(() => this.eventBus.publish(event, rootAggregator))
      .catch(err => {
        throw err;
      });
  }

  publishAll(events: IEvent[], rootAggregator?: AggregateRootAsync): void {
    (events || []).forEach(event => this.publish(event, rootAggregator));
  }
}
