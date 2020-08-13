export interface EventSourcingOptions {
    mongoURL: string;
}

export interface EventSourcingGenericOptions {
    dialect: string;
    url?: string;
    host?: string;
    port?: number;
    options: {
        ssl: boolean;
        [key: string]: unknown;
    }
} 