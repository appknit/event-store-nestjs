import * as oracledb from 'oracledb';
import * as shortid from 'short-uuid';

import { StorableEvent } from '../interfaces/storable-event';
import { OracleConfig, OracleConnectionOptions } from '../interfaces/oracle';
import { DatabaseConfig } from '../interfaces/database.config';
import { SnapshotRecord, Payload } from '../interfaces/record';
import tableCreationsScripts from './tables';

export interface IEventStore {
  isInitiated(): boolean;
  getEvents(aggregate: string, id: string): Promise<StorableEvent[]>;
  getEvent(number): Promise<StorableEvent>;
  storeEvent<T extends StorableEvent>(event: T): Promise<void>;
}

const DEFAULT_EVENTS_COLLECTION_NAME = 'events';
const DEFAULT_SNAPSHOTS_COLLECTION_NAME = 'snapshots';
const DEFAULT_TRANSACTIONS_COLLECTION_NAME = 'transactions';
const DEFAULT_OUTPUT_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const DATE_FORMAT = 'DD-MMM-YY';

export const EventStoreLaunchError = new Error('Event store not launched');

export class OracleEventStore implements IEventStore {
  private connection: oracledb.Connection;
  private connectionOptions: OracleConnectionOptions;
  private useSodaApi = false;
  private eventStoreLaunched = false;

  private eventsCollectionName = DEFAULT_EVENTS_COLLECTION_NAME;
  private snapshotsCollectionName = DEFAULT_SNAPSHOTS_COLLECTION_NAME;
  private transactionsCollectionName = DEFAULT_TRANSACTIONS_COLLECTION_NAME;

  static isOracleDatabase(config: DatabaseConfig): boolean {
    return config.dialect === 'oracledb';
  }

  constructor(config: OracleConfig) {
    const connectionString = OracleEventStore.getConnectionString(config);
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

  private async initializeTables(): Promise<any> {
    await this.createTableIfNotExists('events', this.eventsCollectionName);
    await this.createTableIfNotExists('snapshots', this.snapshotsCollectionName);
    // await this.createTableIfNotExists('transactions', this.transactionsCollectionName);
  }

  async connect(): Promise<any> {
    try {
      const connection = await oracledb.getConnection(this.connectionOptions);
      this.connection = connection;
      await this.initializeTables()
      this.eventStoreLaunched = true;
      return connection;
    } catch (connectionError) {
      throw connectionError;
    }
  }

  private async _run(
    sqlString: string,
    bindArgs: oracledb.BindParameters,
  ): Promise<oracledb.Result<unknown>> {
    return this.connection.execute(sqlString, bindArgs, DEFAULT_OUTPUT_OPTIONS);
  }

  private async _runAndCommit(
    sqlString: string,
    bindArgs: oracledb.BindParameters,
  ): Promise<oracledb.Result<unknown>> {
    const result = await this._run(sqlString, bindArgs);
    await this.connection.commit();
    return result;
  }

  private async _rollback(): Promise<any> {
    return this.connection.rollback();
  }

  async doesTableExist(tableName: string) {
    const sql = `SELECT COUNT(*) AS tableCount FROM dba_tables WHERE table_name = :id`;
    const bindArgs = [tableName.toUpperCase()];
    const { rows } = await this._run(sql, bindArgs);
    const [row] = rows;
    return !!row['TABLECOUNT'];
  }

  async createTableIfNotExists(tableName: string, alias?: string): Promise<any> {
    const tableAlias = alias || tableName;
    const createStatementFunction = tableCreationsScripts[tableName];
    const createStatement = createStatementFunction(tableAlias);
    const tableExists = await this.doesTableExist(tableName);
    if (tableExists) return false;
    await this._runAndCommit(createStatement, []);
    return true;
  }


  async deleteTableIfExists(tableName: string) {
    const tableExists = await this.doesTableExist('events');
    if (!tableExists) return false;
    tableName = tableName.toUpperCase()
    const sql = `DROP TABLE ${tableName} PURGE`;
    await this._runAndCommit(sql, []);
    return true;
  }

  async truncateTableIfExists(tableName: string) {
    const tableExists = await this.doesTableExist('events');
    if (!tableExists) return false;
    tableName = tableName.toUpperCase()
    const sql = `TRUNCATE TABLE ${tableName}`;
    await this._run(sql, []);
    return true;
  }

  static getConnectionString(config: OracleConfig): string {
    if (config.connectString) return config.connectString;
    return `${config.hostname}/${config.servicename}`
  }

  public isInitiated(): boolean {
    return this.eventStoreLaunched;
  }

  async initializeCollection(collectionName: string): Promise<oracledb.SodaCollection> {
    const soda = this.connection.getSodaDatabase();
    try {
      return soda.createCollection(collectionName)
    } catch (collectionError) {
      throw collectionError;
    }
  }

  private getSnapshotFromRecord(record: Payload): SnapshotRecord {
    const { SNAPSHOTID, AGGREGATEID, AGGREGATE, CONTEXT, REVISION, VERSION, COMMITSTAMP, DATA } = record;
    const snapshot = {
      snapshotId: SNAPSHOTID,
      aggregateId: AGGREGATEID,
      aggregate: AGGREGATE,
      context: CONTEXT,
      revision: REVISION,
      version: VERSION,
      commitStamp: COMMITSTAMP,
      data: DATA
    };
    return snapshot;
  }

  async getSnapshot(aggregateId: string): Promise<SnapshotRecord> {
    const sql = `SELECT
        id AS SNAPSHOTID, aggregateId, aggregate,
        context, revision, version, commitStamp,
        TO_CHAR(data) AS data
      FROM ${this.snapshotsCollectionName}
      WHERE aggregate_id = :aggregateId`;
    const args = { aggregateId };
    const { rows } = await this._run(sql, args);
    if (!rows.length) return null;
    const [row] = rows;
    return this.getSnapshotFromRecord(row);
  }

  async getFromSnapshot(aggregateId: string, revMax: number): Promise<any> {
    const snapshot = await this.getSnapshot(aggregateId);
    // const events = await this.getSQLEvents(aggregateId);
    let revMin = 0;
    if (snapshot && (snapshot.revision !== undefined && snapshot.revision !== null)) {
      revMin = snapshot.revision + 1;
    }
    const stream = await this.getEventStream(aggregateId, revMin, revMax);
    return [snapshot, stream]; 
  }

  async getEventsSince(commitStamp: Date, skip = 0, limit = 1000): Promise<StorableEvent[]> {
    const sql = `SELECT 
      id, streamId, aggregateId, aggregate, context, commitId, TO_CHAR(payload) AS payload,
      commitSequence, commitStamp, restInCommitStream, dispatched
    FROM events
    -- WHERE commitStamp >= TIMESTAMP :timestampString
    WHERE commitStamp >= :commitStamp
    OFFSET :skip ROWS 
    FETCH  NEXT :limit ROWS ONLY `;

    try {
      const args = { commitStamp, skip, limit };
      const { rows } = await this._run(sql, args);
      return rows.map(this.getStorableEventFromPayload);
    } catch (collectionError) {
      throw collectionError;
    }
  }

  async getEventStream(
    aggregateId: string,
    revMin?: number,
    revMax?: number,
  ): Promise<any> {
    return [];
  }

  async getEventsByRevision(
    aggregateId: string,
    revMin?: number,
    revMax?: number,
  ): Promise<any> {
    /*
    if (typeof revMin === 'function') {
      callback = revMin;
      revMin = 0;
      revMax = -1;
    } else if (typeof revMax === 'function') {
      callback = revMax;
      revMax = -1;
    }

    if (!aggregateId) {
      throw new Error('An aggregateId should be passed!');
    }

    return this.getEventsByRevision(aggregateId, revMin, revMax);
    */
   return [];
  }


  async getEvent(eventId: string): Promise<StorableEvent> {
    if (this.useSodaApi) return this.getSODAEvent(eventId);
    return this.getSQLEvent(eventId);
  }

  private async getSQLEvent(eventId: string): Promise<any> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const sql = `SELECT 
      id, streamId, aggregateId, aggregate, context, commitId, TO_CHAR(payload) AS payload,
      commitSequence, commitStamp, restInCommitStream, dispatched
    FROM events WHERE id = :id`;
    try {
      const args = [eventId];
      const { rows } = await this._run(sql, args);
      if (!rows[0]) return null;
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
    return `${aggregate}-${id}`;
  }

  async getEvents(aggregate: string, id: string): Promise<StorableEvent[]> {
    const aggregateId = this.getAggregateId(aggregate, id)
    if (this.useSodaApi) return this.getSODAEvents(aggregateId);
    return this.getSQLEvents(aggregateId);
  }

  private async getSQLEvents(aggregateId: string): Promise<StorableEvent[]> {
    if (!this.isInitiated()) throw EventStoreLaunchError;
    const sql = `SELECT 
      id, streamId, aggregateId, aggregate, context, commitId, TO_CHAR(payload) AS payload,
      commitSequence, commitStamp, restInCommitStream, dispatched
    FROM events
    WHERE aggregateId = :id`;

    try {
    const args = [aggregateId];
      const { rows } = await this._run(sql, args)
      return rows.map(this.getStorableEventFromPayload);
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

  async storeEvent<T extends StorableEvent>(event: T): Promise<any> {
    if (this.useSodaApi) return this.storeSODAEvent(event);
    return this.storeSQLEvent(event);
  }

  private async storeSODAEvent<T extends StorableEvent>(event: T): Promise<any> {
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

  private async storeSQLEvent<T extends StorableEvent>(event: T): Promise<any> {
    if (!this.isInitiated()) throw EventStoreLaunchError;

    const sql = `INSERT INTO events(id, streamId, aggregateId, aggregate, context, commitId, payload)
    VALUES (:id, :streamId, :aggregateId, :aggregate, NULL, :commitId, :payload)`;

    try {
      const id = shortid.generate();
      const { id: eventId, eventAggregate: aggregate, ...rest } = event;
      const aggregateId = this.getAggregateId(aggregate, eventId);
      const payload = JSON.stringify(rest);

      const args = {
        id,
        streamId: aggregateId,
        aggregateId,
        aggregate,
        commitId: eventId,
        payload,
      };

      await this._runAndCommit(sql, args);
      return id;
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
    const {
      ID,
      STREAMID,
      AGGREGATEID,
      AGGREGATE,
      CONTEXT,
      COMMITID,
      PAYLOAD,
      COMMITSEQUENCE,
      COMMITSTAMP,
      RESTINCOMMITSTREAM,
      DISPATCHED,
    } = document;

    const payload = JSON.parse(PAYLOAD);

    const event = {
      id: ID,
      streamId: STREAMID,
      aggregateId: AGGREGATEID,
      aggregate: AGGREGATE,
      eventName: payload.eventName,
      eventAggregate: payload.eventAggregate,
      eventVersion: payload.eventVersion,
      context: CONTEXT,
      commitId: COMMITID,
      payload: payload,
      commitSequence: COMMITSEQUENCE,
      commitStamp: COMMITSTAMP,
      restInCommitStream: RESTINCOMMITSTREAM,
      dispatched: DISPATCHED
    };
    return event;
  }

  async disconnect(): Promise<void> {
    this.eventStoreLaunched = false;
    await this.connection.close();
  }
}
