export enum supportedDatabases {
  mongodb = 'mongodb',
  redis = 'redis',
  elasticsearch = 'elasticsearch',
  inmemory = 'inmemory',
  dynamodb = 'dynamodb',
}

export const isSupported = (dbname: string): boolean => !!supportedDatabases[dbname]

// NOTE: DBs supported by eventstore - [inmemory, mongodb, redis, tingodb, elasticsearch, azuretable, dynamodb]

/**
 * Sample DatabaseConfig
 * {
 *  dialect: 'mongodb',
 *  url: 'mongo://localhost:27017/<collectionName>',
 *  host: 'localhost',
 *  port: 27017, 
 * }
 */

export interface DatabaseConfig {
  dialect: string,
  url?: string,
  host?: string;
  port?: number;
  options?: {
    ssl: boolean;
    [key: string]: unknown;
  }
}
