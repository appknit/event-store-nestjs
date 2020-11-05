import { IEvent, IEventHandler } from '@nestjs/cqrs';
import { AggregateRootAsync } from '../../aggregate-root-async';

export interface IViewUpdater<T extends IEvent> extends IEventHandler<IEvent> {
  handle(event: T, rootAggregator?: AggregateRootAsync): Promise<void>;
}
