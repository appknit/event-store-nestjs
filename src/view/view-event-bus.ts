import { EventBus } from '@nestjs/cqrs/dist/event-bus';
import { Injectable } from '@nestjs/common';
import { IEvent, IEventBus } from '@nestjs/cqrs/dist/interfaces';
import { ViewUpdater } from './view-updater';

@Injectable()
export class ViewEventBus implements IEventBus {

    constructor(
        private readonly eventBus: EventBus,
        private viewUpdater: ViewUpdater,
    ) {
    }

    async publishAsync<T extends IEvent>(event: T): Promise<void> {
        await this.viewUpdater.run(event);
        try {
            this.eventBus.publish(event);
            return;
        } catch (err) {
            throw err;
        }
    }

    publish<T extends IEvent>(event: T): void {
        this.viewUpdater.run(event)
        .then(() => this.eventBus.publish(event))
        .catch(err => { throw err; });
    }

    publishAll(events: IEvent[]): void {
        (events || []).forEach(event => this.publish(event));
    }
}
