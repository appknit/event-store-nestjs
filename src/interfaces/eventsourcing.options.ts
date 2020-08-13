import { supportedDatabases } from './database.config';

export interface EventSourcingOptions {
    mongoURL: string;
}

export interface EventSourcingGenericOptions {
    dialect: supportedDatabases;
    url?: string;
    host?: string;
    port?: number;
    options: {
        ssl: boolean;
        [key: string]: unknown;
    }
} 