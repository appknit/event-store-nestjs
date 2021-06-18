export interface EventSourcingOptions {
    mongoURL: string;
}

export interface EventSourcingGenericOptions {
    type: string;
    uri?: string;
    host?: string;
    port?: number;
    snapshotsCollectionName?: string;
    transactionsCollectionName?: string;
    options?: {
        ssl: boolean;
        [key: string]: unknown;
    }
}
