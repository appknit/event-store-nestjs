import { EventBus } from '@nestjs/cqrs/dist/event-bus';
import { Injectable } from '@nestjs/common';
import { IEvent } from '@nestjs/cqrs/dist/interfaces';
import { ViewUpdater } from './view-updater';
import { IExtendedEventBus } from './interfaces';
import { AggregateRootAsync } from '../aggregate-root-async';

@Injectable()
export class ViewEventBus implements IExtendedEventBus {
  constructor(
    private readonly eventBus: EventBus,
    private viewUpdater: ViewUpdater,
  ) {}

  async publishAsync<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void> {
    try {
      await this.viewUpdater.run(event, rootAggregator);
      return this.eventBus.publish(event);
    } catch (err) {
      throw err;
    }
  }

  publish<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void> {
    return this.viewUpdater
      .run(event, rootAggregator)
      .then(() => this.eventBus.publish(event))
      .catch(err => {
        throw err;
      });
  }

  publishAll(events: IEvent[] = [], rootAggregator?: AggregateRootAsync): void {
    for (const event of events) {
      this.publish(event, rootAggregator);
    }
  }
}
