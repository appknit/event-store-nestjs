import * as oracledb from 'oracledb';

import { StorableEvent } from './interfaces/storable-event';
import { DatabaseConfig } from './interfaces/database.config';
import { OracleConfig, OracleConnectionOptions } from './interfaces/oracle';
import { EventSourcingGenericOptions } from './interfaces/eventsourcing.options';

export interface IEventStore {
    isInitiated(): boolean;
    getEvents(aggregate: string, id: string): Promise<StorableEvent[]>;
    getEvent(number): Promise<StorableEvent>;
    storeEvent<T extends StorableEvent>(event: T): Promise<void>;
}

const DEFAULT_EVENTS_COLLECTION_NAME = 'events';
const DEFAULT_SNAPSHOTS_COLLECTION_NAME = 'snapshots';
// const DEFAULT_TRANSACTIONS_COLLECTION_NAME = 'transactions';

export const EventStoreLaunchError = new Error('Event store not launched');

export class OracleEventStore implements IEventStore {
  private connection: oracledb.Connection;
  private eventStoreLaunched = false;

  private eventsCollectionName = DEFAULT_EVENTS_COLLECTION_NAME;
  private snapshotsCollectionName = DEFAULT_SNAPSHOTS_COLLECTION_NAME;
  // private transactionsCollectionName = DEFAULT_TRANSACTIONS_COLLECTION_NAME;

  constructor(config: OracleConfig) {
    const connectionString = this.getConnectionString(config);
    const connectionOptions: OracleConnectionOptions = {
      user: config.user,
      password: config.password,
      connectString: connectionString,
    };

    oracledb.getConnection(connectionOptions)
      .then(connection => {
        this.connection = connection;
        this.eventStoreLaunched = true;
        if (config.eventsCollectionName) this.eventsCollectionName = config.eventsCollectionName;
        if (config.snapshotsCollectionName) this.snapshotsCollectionName = config.snapshotsCollectionName;
        // if (config.transactionsCollectionName) this.transactionsCollectionName = config.transactionsCollectionName;
      })
      .catch(connectionError => {
        throw connectionError;
      })
      ;
  }

  private getConnectionString(config: OracleConfig): string {
    if (config.connectString) return config.connectString;
    return `${config.hostname}/${config.servicename}`
  }

  private parseDatabaseConfig(config: DatabaseConfig): EventSourcingGenericOptions {
    const eventstoreConfig: EventSourcingGenericOptions = {
      type: 'oracledb',
      options: {
        ssl: false,
      }
    };
    return eventstoreConfig;
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

  // async getFromSnapshot(): Promise<any> {}

  async getEvent(eventId: number): Promise<StorableEvent> {
    if (!this.eventStoreLaunched) throw EventStoreLaunchError;
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const eventDocument = await eventsCollection.find().filter({ eventId }).getOne();
      return this.getStorableEventFromPayload(eventDocument);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private getAggregateId(aggregate: string, id: string): string {
    return aggregate + '-' + id;
  }

  async getEvents(aggregate: string, id: string): Promise<StorableEvent[]> {
    if (!this.eventStoreLaunched) throw EventStoreLaunchError;
    const aggregateId = this.getAggregateId(aggregate, id)
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const eventDocuments = await eventsCollection.find().filter({ aggregateId }).getDocuments();
      return eventDocuments.map(this.getStorableEventFromPayload);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  async storeEvent(): Promise<void> {
    if (!this.eventStoreLaunched) throw EventStoreLaunchError;
    const soda = this.connection.getSodaDatabase();
    try {
      const eventsCollection = await soda.openCollection(this.eventsCollectionName);
      const record: Record<string, any> = {};
      await eventsCollection.insertOne(record);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  getStorableEventFromPayload(document: oracledb.SodaDocument): StorableEvent {
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


  async disconnect(): Promise<void> {
    await this.connection.close();
  }
}

/*

Fields automatically created by SODA
- Version
- Creation timestamp
- Last modified timestamp

getMetadata()
getMetadata()

{
   "schemaName" : "mySchemaName",
   "tableName" : "myTableName",
   "keyColumn" :
   {
      "name" : "ID",
      "sqlType" : "VARCHAR2",
      "maxLength" : 255,
      "assignmentMethod" : "UUID"
   },
   "contentColumn" :
   {
      "name" : "JSON_DOCUMENT",
      "sqlType" : "BLOB",
      "compress" : "NONE",
      "cache" : true,
      "encrypt" : "NONE",
      "validation" : "STANDARD"
   },
   "versionColumn" :
   {
     "name" : "VERSION",
     "method" : "SHA256"
   },
   "lastModifiedColumn" :
   {
     "name" : "LAST_MODIFIED"
   },
   "creationTimeColumn" :
   {
      "name" : "CREATED_ON"
   },
   "readOnly" : false
}
*/
