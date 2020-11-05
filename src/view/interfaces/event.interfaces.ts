import { IEventBus } from '@nestjs/cqrs';
import { IEvent } from '@nestjs/cqrs/dist/interfaces';
import { AggregateRootAsync } from '../../aggregate-root-async';

export interface IExtendedEventBus<EventBase extends IEvent = IEvent>
  extends IEventBus<EventBase> {
  publish<T extends EventBase>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): any;

  publishAsync<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void>;

  publishAll(events: EventBase[], rootAggregator?: AggregateRootAsync): any;
}
