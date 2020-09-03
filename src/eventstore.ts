import { StorableEvent } from './interfaces/storable-event';
import { DatabaseConfig, isSupported, supportedDatabases } from './interfaces/database.config';
import { EventSourcingGenericOptions } from './interfaces/eventsourcing.options';
import * as eventstore from 'eventstore';
import * as url from 'url';
// import { parse } from 'path';

export class EventStore {
  private readonly eventstore;
  private eventStoreLaunched = false;

  constructor(config: DatabaseConfig) {
    const eventstoreConfig = this.parseDatabaseConfig(config);
    this.eventstore = eventstore(eventstoreConfig);

    this.eventstore.init(err => {
      if (err) {
        throw err;
      }
      this.eventStoreLaunched = true;
    });
  }

  private parseDatabaseConfig(config: DatabaseConfig): EventSourcingGenericOptions {
    let parsed: url.UrlWithParsedQuery;

    const eventstoreConfig: EventSourcingGenericOptions = {
      type: 'mongodb',
      options: {
        ssl: false,
      }
    };

    if (config.options) {
      eventstoreConfig.options = config.options;
    }

    if (typeof config.dialect === 'string' && isSupported(config.dialect)) {
      eventstoreConfig.type = config.dialect;
    }

    if (config.uri) {
      if (config.dialect === 'mongodb') {
        eventstoreConfig.url = config.uri;
      } else {
        parsed = url.parse(config.uri, true);
        eventstoreConfig.host = parsed.hostname;
        eventstoreConfig.port = +parsed.port;
      }
    } else {
      if (config.host) {
        eventstoreConfig.host = config.host;
      }
      if (config.port) {
        eventstoreConfig.port = config.port;
      }
    }

    // if (parsed && parsed.query && parsed.query.ssl !== undefined && parsed.query.ssl === 'true') {
    //   eventstoreConfig.options.ssl = true;
    // }

    if (parsed?.query?.ssl !== undefined && parsed.query.ssl === 'true') {
      eventstoreConfig.options.ssl = true;
    }

    return eventstoreConfig;
  }

  public isInitiated(): boolean {
    return this.eventStoreLaunched;
  }

  public async getEvents(
    aggregate: string,
    id: string,
  ): Promise<StorableEvent[]> {
    return new Promise<StorableEvent[]>(resolve => {
      this.eventstore.getFromSnapshot(
        this.getAgrregateId(aggregate, id),
        (err, snapshot, stream) => {
          // snapshot.data; // Snapshot
          resolve(
            stream.events.map(event =>
              this.getStorableEventFromPayload(event.payload),
            ),
          );
        },
      );
    });
  }

  public async getEvent(index: number): Promise<StorableEvent> {
    return new Promise<StorableEvent>((resolve, reject) => {
      this.eventstore.getEvents(index, 1, (err, events) => {
        if (events.length > 0) {
          resolve(this.getStorableEventFromPayload(events[0].payload));
        } else {
          resolve(null);
        }
      });
    });
  }

  public async storeEvent<T extends StorableEvent>(event: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.eventStoreLaunched) {
        reject('Event Store not launched!');
        return;
      }
      this.eventstore.getEventStream(
        {
          aggregateId: this.getAgrregateId(event.eventAggregate, event.id),
          aggregate: event.eventAggregate,
        },
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          stream.addEvent(event);
          stream.commit(commitErr => {
            if (commitErr) {
              reject(commitErr);
            }
            resolve();
          });
        },
      );
    });
  }

  // Monkey patch to obtain event 'instances' from db
  private getStorableEventFromPayload(payload: any): StorableEvent {
    const eventPlain = payload;
    eventPlain.constructor = { name: eventPlain.eventName };

    return Object.assign(Object.create(eventPlain), eventPlain);
  }

  private getAgrregateId(aggregate: string, id: string): string {
    return aggregate + '-' + id;
  }
}
