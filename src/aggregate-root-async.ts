import { IEvent } from '@nestjs/cqrs/dist/interfaces';
import { debug } from './util';

const INTERNAL_EVENTS = Symbol();
const IS_AUTO_COMMIT_ENABLED = Symbol();

export abstract class AggregateRootAsync<EventBase extends IEvent = IEvent> {
  public [IS_AUTO_COMMIT_ENABLED] = false;
  private readonly [INTERNAL_EVENTS]: EventBase[] = [];

  set autoCommit(value: boolean) {
    this[IS_AUTO_COMMIT_ENABLED] = value;
  }

  get autoCommit(): boolean {
    return this[IS_AUTO_COMMIT_ENABLED];
  }

  publish<T extends EventBase = EventBase>(event: T): void {}

  async publishAsync<T extends EventBase = EventBase>(
    event: T,
  ): Promise<void> {}

  commit(): void {
    this[INTERNAL_EVENTS].forEach(event => this.publish(event));
    this[INTERNAL_EVENTS].length = 0;
  }

  async commitAsync(): Promise<void> {
    debug('commitAsync')
    const publishPromises = this[INTERNAL_EVENTS].map(event =>
      this.publishAsync(event),
    );
    await Promise.all(publishPromises);
    this[INTERNAL_EVENTS].length = 0;
  }

  uncommit(): void {
    this[INTERNAL_EVENTS].length = 0;
  }

  getUncommittedEvents(): EventBase[] {
    return this[INTERNAL_EVENTS];
  }

  loadFromHistory(history: EventBase[]): void {
    history.forEach(event => this.apply(event, true));
  }

  loadFromSnapshot({ snapshot, history }) {
    if (snapshot && snapshot.data) {
      Object.assign(this, snapshot.data);
    }
    history.forEach((event) => this.apply(event, true));
  }

  apply<T extends EventBase = EventBase>(
    event: T,
    isFromHistory = false,
  ): AggregateRootAsync {
    if (!isFromHistory && !this.autoCommit) {
      this[INTERNAL_EVENTS].push(event);
    }
    this.autoCommit && this.publish(event);

    const handler = this.getEventHandler(event);
    handler && handler.call(this, event);
    return this;
  }

  private getEventHandler<T extends EventBase = EventBase>(
    event: T,
  ): (...args: any) => any | undefined {
    const handler = `on${this.getEventName(event)}`;
    return this[handler];
  }

  protected getEventName<T extends EventBase = EventBase>(event: T): string {
    const { constructor } = Object.getPrototypeOf(event);
    return constructor.name as string;
  }
}
