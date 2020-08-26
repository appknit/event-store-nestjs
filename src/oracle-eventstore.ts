import * as oracledb from 'oracledb';

import { StorableEvent } from './interfaces/storable-event';
import { OracleConfig, OracleConnectionOptions } from './interfaces/oracle';
// import { DatabaseConfig } from './interfaces/database.config';
// import { EventSourcingGenericOptions } from './interfaces/eventsourcing.options';

export interface IEventStore {
    isInitiated(): boolean;
    getEvents(aggregate: string, id: string): Promise<any[]>;
    // getEvents(aggregate: string, id: string): Promise<StorableEvent[]>;
    getEvent(number): Promise<StorableEvent>;
    storeEvent<T extends StorableEvent>(event: T): Promise<void>;
}

const DEFAULT_EVENTS_COLLECTION_NAME = 'events';
const DEFAULT_SNAPSHOTS_COLLECTION_NAME = 'snapshots';
const DEFAULT_TRANSACTIONS_COLLECTION_NAME = 'transactions';

type Payload = Record<string, any> | null;

interface SQLEvent {
    id?: string;          //              VARCHAR2(64) PRIMARY KEY,
    streamId?: string;    //        VARCHAR2(256) NOT NULL,
    aggregateId?: string; //     VARCHAR2(256) NOT NULL,
    aggregate?: string;   //       VARCHAR2(128) NOT NULL,
    context?: string;     //         VARCHAR2(256),
    commitId?: string;    //        VARCHAR2(256) NOT NULL,
    payload?: Payload;     //         VARCHAR2 (4000)
    commitSequence: number; //  NUMBER DEFAULT 0,
    commitStamp: Date;   //  DATE DEFAULT (sysdate),
    restInCommitStream: boolean; // NUMBER(1) DEFAULT 0,
    dispatched: boolean;      // NUMBER(1) DEFAULT 0
}

export const EventStoreLaunchError = new Error('Event store not launched');

export class OracleEventStore implements IEventStore {
  private connection: oracledb.Connection;
  private connectionOptions: OracleConnectionOptions;
  private useSodaApi = false;
  private eventStoreLaunched = false;

  private eventsCollectionName = DEFAULT_EVENTS_COLLECTION_NAME;
  private snapshotsCollectionName = DEFAULT_SNAPSHOTS_COLLECTION_NAME;
  private transactionsCollectionName = DEFAULT_TRANSACTIONS_COLLECTION_NAME;

  constructor(config: OracleConfig) {
    const connectionString = this.getConnectionString(config);
    this.useSodaApi = !!config.useSodaApi;
    this.connectionOptions = {
      user: config.user,
      password: config.password,
      connectString: connectionString,
    };
    if (config.eventsCollectionName) this.eventsCollectionName = config.eventsCollectionName;
    if (config.snapshotsCollectionName) this.snapshotsCollectionName = config.snapshotsCollectionName;
    if (config.transactionsCollectionName) this.transactionsCollectionName = config.transactionsCollectionName;
  }

  async connect(): Promise<any> {
    try {
      const connection = await oracledb.getConnection(this.connectionOptions);
      this.connection = connection;
      this.eventStoreLaunched = true;
      return connection;
    } catch (connectionError) {
      throw connectionError;
    }
  }

  private getConnectionString(config: OracleConfig): string {
    if (config.connectString) return config.connectString;
    return `${config.hostname}/${config.servicename}`
  }

  public isInitiated(): boolean {
    return this.eventStoreLaunched;
  }

  async initializeCollection(collectionName: string): Promise<oracledb.SodaCollection> {
    const soda = this.connection.getSodaDatabase();
    try {
      // const collectionOptions = {};
      // await soda.createCollection(collectionName, collectionOptions)
      return soda.createCollection(collectionName)
    } catch (collectionError) {
      throw collectionError;
    }
  }

  // async storeTransaction(): Promise<any> {}
  // async getTransaction(): Promise<any> {}

  // TODO:
  // async getFromSnapshot(aggregateId: string): Promise<any> {}

  async getEvent(eventId: string): Promise<StorableEvent> {
    if (this.useSodaApi) return this.getSODAEvent(eventId);
    return this.getSQLEvent(eventId);
  }

  private async getSQLEvent(eventId: string): Promise<any> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const sql = 'SELECT payload FROM events WHERE id = :id';
    try {
    const args = [eventId];
      const { rows } = await this.connection.execute(sql, args)
      return this.getStorableEventFromPayload(rows[0]);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private async getSODAEvent(eventId: string): Promise<StorableEvent> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const eventDocument = await eventsCollection.find().filter({ id: eventId }).getOne();
      return this.getStorableEventFromSODAPayload(eventDocument);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private getAggregateId(aggregate: string, id: string): string {
    return aggregate + '-' + id;
  }

  async getEvents(aggregate: string, id: string): Promise<Array<any>> {
    const aggregateId = this.getAggregateId(aggregate, id)
    if (this.useSodaApi) return this.getSODAEvents(aggregateId);
    return this.getSQLEvents(aggregateId);
  }

  private async getSQLEvents(aggregateId: string): Promise<any> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const sql = 'SELECT payload FROM events WHERE aggregateId = :id';
    try {
    const args = [aggregateId];
      const { rows } = await this.connection.execute(sql, args)
      return this.getStorableEventFromPayload(rows[0]);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private async getSODAEvents(aggregateId: string): Promise<StorableEvent[]> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const eventDocuments = await eventsCollection.find().filter({ aggregateId }).getDocuments();
      return eventDocuments.map(this.getStorableEventFromSODAPayload);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  async storeEvent(event: StorableEvent): Promise<void> {
    if (this.useSodaApi) return this.storeSODAEvent(event);
    return this.storeSQLEvent(event);
  }

  private async storeSODAEvent(event: StorableEvent): Promise<void> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const record: Record<string, any> = event;
      await eventsCollection.insertOne(record);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private async storeSQLEvent(event: StorableEvent): Promise<void> {
    if (!this.isInitiated()) throw EventStoreLaunchError;

    const sql = `INSERT INTO events(id, streamId, aggregateId, aggregate, context, commitId, payload)
    VALUES (:eventId, :streamId, :aggregateId, :aggregate, NULL, :commitId, :payload)`;

    try {
      const streamId = '';
      const aggregateId = '';
      const { id: eventId, eventAggregate: aggregate, ...rest } = event;
      const payload = JSON.stringify(rest);

      const args = [
        eventId,
        streamId,
        aggregateId,
        aggregate,
        eventId,
        payload,
      ];

      await this.connection.execute(sql, args);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private getStorableEventFromSODAPayload(document: oracledb.SodaDocument): StorableEvent {
    const content =  document.getContent();
    const eventId =  document.key;
    // const createdAt =  document.createdOn;
    // const updatedAt = document.lastModified;

    const event: StorableEvent = {
      id: eventId,
      eventName: content.title,
      eventVersion: 0,
      eventAggregate: content.title,
    };
    return event;
  }

  private getStorableEventFromPayload(document: any): StorableEvent {
    const event = JSON.parse(document);
    return event;
  }

  async disconnect(): Promise<void> {
    this.eventStoreLaunched = false;
    await this.connection.close();
  }
}
