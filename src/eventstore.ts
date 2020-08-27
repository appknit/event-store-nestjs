import { StorableEvent } from './interfaces/storable-event';
import { DatabaseConfig, isSupported, supportedDatabases } from './interfaces/database.config';
import { EventSourcingGenericOptions } from './interfaces/eventsourcing.options';
import { OracleEventStore } from './oracle';
import * as eventstore from 'eventstore';
import * as url from 'url';
import { OracleConfig } from './interfaces/oracle';

export class EventStore {
  private readonly eventstore;
  private oracleEventstore = false;
  private eventStoreLaunched = false;

  constructor(config: DatabaseConfig) {
    if (OracleEventStore.isOracleDatabase(config) && config as OracleConfig) {
      const oracleConfig = this.parseOracleConfig(config);
      this.eventstore = new OracleEventStore(oracleConfig);
      this.eventstore.connect().then(() => {
        this.oracleEventstore = true;
        this.eventStoreLaunched = true;
      });
    } else {
      const eventstoreConfig = this.parseDatabaseConfig(config);
      this.eventstore = eventstore(eventstoreConfig);
      this.eventstore.init(err => {
        if (err) {
          throw err;
        }
        this.eventStoreLaunched = true;
      });
    }
  }

  private parseDatabaseConfig(config: DatabaseConfig): EventSourcingGenericOptions {
    let parsed: url.UrlWithParsedQuery;

    const eventstoreConfig: EventSourcingGenericOptions = {
      type: 'mongodb',
      options: {
        ssl: false,
      }
    };

    if (typeof config.dialect === 'string' && isSupported(config.dialect)) {
      eventstoreConfig.type = config.dialect;
    }

    if (config.uri) {
      parsed = url.parse(config.uri, true);
      eventstoreConfig.host = parsed.hostname;
      eventstoreConfig.port = +parsed.port;
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

  private parseOracleConfig(config: DatabaseConfig): OracleConfig {
    const { user, password, connectString } = config;
    const oracleConfig: OracleConfig = {
      user,
      password,
      connectString,
      useSodaApi: true,
    };
    return oracleConfig;
  }

  public isInitiated(): boolean {
    return this.eventStoreLaunched;
  }

  public async getEvents(
    aggregate: string,
    id: string,
  ): Promise<StorableEvent[]> {
    if (this.oracleEventstore) {
      return this.eventstore.getEvents(aggregate, id);
    }

    return new Promise<StorableEvent[]>(resolve => {
      this.eventstore.getFromSnapshot(
        this.getAggregateId(aggregate, id),
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
    if (this.oracleEventstore) {
      return this.eventstore.getEvent(index);
    }

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

      if (this.oracleEventstore) {
        return this.eventstore.storeEvent(event);
      }

      this.eventstore.getEventStream(
        {
          aggregateId: this.getAggregateId(event.eventAggregate, event.id),
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
    if (this.oracleEventstore) {
      this.eventstore.getStorableEventFromPayload(payload);
    }

    const eventPlain = payload;
    eventPlain.constructor = { name: eventPlain.eventName };

    return Object.assign(Object.create(eventPlain), eventPlain);
  }

  private getAggregateId(aggregate: string, id: string): string {
    return aggregate + '-' + id;
  }
}
