export interface OracleConfig {
  user: string;
  password: string;
  connectString: string; 
  hostname: string;
  servicename: string;
  eventsCollectionName?: string;
  snapshotsCollectionName?: string;
  transactionsCollectionName?: string;
}

export interface OracleConnectionOptions {
  user: string;
  password: string;
  connectString: string; 
}