import * as eventStore from 'eventstore';
import { StorableEvent } from './interfaces/storable-event';
import { DatabaseConfig, isSupported, supportedDatabases } from './interfaces/database.config';
import { EventSourcingGenericOptions } from './interfaces/eventsourcing.options';
import { OracleEventStore, SnapshotRecord } from './oracle';
import * as eventstore from 'eventstore';
import * as url from 'url';
import { OracleConfig } from './interfaces/oracle';
import * as shortUuid from 'short-uuid'

export class EventStore {
  private eventstore: typeof eventStore;
  private oracleEventstore = false;
  private eventStoreLaunched = false;

  constructor(config: DatabaseConfig) {
    this.initEventStore(config);
  }

  private initEventStore(config: DatabaseConfig) {
    if (OracleEventStore.isOracleDatabase(config) && config as OracleConfig) {
      const oracleConfig = this.parseOracleConfig(config);
      this.eventstore = new OracleEventStore(oracleConfig);
      this.eventstore.connect().then(() => {
        this.oracleEventstore = true;
        this.eventStoreLaunched = true;
      });
    } else {
      switch (config.dialect) {
        case supportedDatabases.mongodb:
          const eventStoreConfig = this.parseDatabaseConfig(config);
          this.eventstore = eventStore(eventStoreConfig);
          this.eventstore.init(err => {
            if (err) {
              throw err;
            }
            this.eventStoreLaunched = true;
          });
          break;
      }
    }
  }

  private parseDatabaseConfig(
    config: DatabaseConfig,
  ): EventSourcingGenericOptions {
    let parsed: url.UrlWithParsedQuery;

    const eventstoreConfig: EventSourcingGenericOptions = {
      type: 'mongodb',
      options: {
        ssl: false,
      },
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

    if (config.snapshotsCollectionName) {
      eventstoreConfig.snapshotsCollectionName = config.snapshotsCollectionName;
    }

    if (config.transactionsCollectionName) {
      eventstoreConfig.transactionsCollectionName = config.transactionsCollectionName;
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
    const { user, password, hostname, servicename, connectString } = config;
    const oracleConfig: OracleConfig = {
      user,
      password,
      hostname,
      servicename,
      connectString,
      // useSodaApi: true,
    };
    if (!connectString) {
      oracleConfig.connectString = OracleEventStore.getConnectionString(config);
    }
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

    return new Promise<StorableEvent[]>((resolve, reject) => {
      this.eventstore.getFromSnapshot(
        this.getAggregateId(aggregate, id),
        (err, snapshot, stream) => {
          if (err){
            reject(err)
          }

          resolve(
            stream.events ? stream.events.map(event =>
              this.getStorableEventFromPayload(event.payload, event.streamRevision),
            ) : [],
          );
        },
      );
    });
  }

  public async getFromSnapshot(
    aggregate: string,
    id: string,
  ): Promise<{ snapshot: SnapshotRecord, history: StorableEvent[]}> {
    // TODO: Fix getEvents for Oracle, not implemented
    // if (this.oracleEventstore) {
    //   return this.eventstore.getFromSnapshot(this.getAggregateId(aggregate, id));
    // }

    return new Promise<{ snapshot: SnapshotRecord, history: StorableEvent[]}>((resolve, reject) => {
      this.eventstore.getFromSnapshot(
        this.getAggregateId(aggregate, id),
        (err, snapshot, stream) => {
          if (err){
            reject(err)
          }

          const history = stream && stream.events ? stream.events.map(event =>
            this.getStorableEventFromPayload(event.payload, event.streamRevision),
          ) : [];

          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          resolve({ snapshot, history });
        },
      );
    });
  }

  public async createSnapshot(
    aggregate: string,
    id: string,
    data: Record<string, any> | null,
    revision?: number,
    version?: number,
  ) {
    const snapshot: SnapshotRecord = {
      snapshotId: shortUuid.generate(),
      aggregateId: this.getAggregateId(aggregate, id),
      aggregate: aggregate,
      // context?: string,
      revision: revision,
      version: version,
      commitStamp: new Date(),
      data,
    };
    return new Promise((resolve, reject) => {
      this.eventstore.createSnapshot(snapshot, (err) => {
        if (err) {
          console.error(err);
          reject(err)
        }
        resolve(undefined);
      })
    });
  }

  public async getEvent(index: number): Promise<StorableEvent> {
    if (this.oracleEventstore) {
      return this.eventstore.getEvent(index);
    }

    return new Promise<StorableEvent>((resolve, reject) => {
      this.eventstore.getEvents(index, 1, (err, events) => {
        if (err){
          reject(err)
        }
        if (events.length > 0) {
          resolve(this.getStorableEventFromPayload(events[0].payload, events[0].streamRevision));
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
          try {
            stream.addEvent(event);
          } catch (error) {
            reject(error)
          }
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
  private getStorableEventFromPayload(payload: any, revision?: number): StorableEvent {
    if (this.oracleEventstore) {
      this.eventstore.getStorableEventFromPayload(payload);
    }

    const eventPlain = payload;
    if (revision) eventPlain.revision = revision;
    eventPlain.constructor = { name: eventPlain.eventName };

    return Object.assign(Object.create(eventPlain), eventPlain);
  }

  private getAggregateId(aggregate: string, id: string): string {
    return aggregate + '-' + id;
  }
}
