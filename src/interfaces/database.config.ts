export enum supportedDatabases {
  mongodb = 'mongodb',
  redis = 'redis',
  elasticsearch = 'elasticsearch',
  inmemory = 'inmemory',
  oracledb = 'oracledb',
  // dynamodb = 'dynamodb',
}

export const isSupported = (dbname: string): boolean => !!supportedDatabases[dbname]

// NOTE: DBs supported by eventstore - [inmemory, mongodb, redis, tingodb, elasticsearch, azuretable, dynamodb]

/**
 * Sample DatabaseConfig
 * {
 *  dialect: 'mongodb',
 *  uri: 'mongo://localhost:27017/<collectionName>?useUnifiedTopology=true',
 *  host: 'localhost',
 *  port: 27017,
 * }
 */

export interface DatabaseConfig {
  dialect: string;
  uri?: string;
  user?: string;
  password?: string;
  connectString?: string;
  host?: string;
  hostname?: string;
  servicename?: string;
  port?: number;
  snapshotsCollectionName?: string;
  transactionsCollectionName?: string;
  options?: {
    ssl: boolean;
    [key: string]: unknown;
  }
}
