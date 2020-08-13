import { Injectable } from '@nestjs/common';
import { StoreEventBus } from './store-event-bus';
import { IEvent } from '@nestjs/cqrs';
import { AggregateRootAsync } from './aggregate-root-async';

export interface Constructor<T> {
  new (...args: any[]): T;
}

@Injectable()
export class StoreEventPublisher {
  constructor(private readonly eventBus: StoreEventBus) {}

  mergeClassContext<T extends Constructor<AggregateRootAsync>>(metatype: T): T {
    const eventBus = this.eventBus;
    return class extends metatype {
      constructor(...args) {
        super(...args);
      }

      publish(event: IEvent) {
        eventBus.publish(event);
      }

      publishAsync = async (event: IEvent) => {
        await eventBus.publishAsync(event);
      }

      commitAsync = async () => {
        const events = this.getUncommittedEvents()
        const promises = events.map((event) => this.publishAsync(event));
        await Promise.all(promises);
        this.uncommit();
      }
    };
  }

  mergeObjectContext<T extends AggregateRootAsync>(object: T): T {
    const eventBus = this.eventBus;
    object.publish = (event: IEvent) => {
      eventBus.publish(event);
    };

    object.publishAsync = async (event: IEvent) => {
      await eventBus.publishAsync(event);
    };

    object.commitAsync = async () => {
      const events = object.getUncommittedEvents()
      const promises = events.map((event) => object.publishAsync(event));
      await Promise.all(promises);
      object.uncommit();
    }

    return object;
  }
}
