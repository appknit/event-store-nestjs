export interface EventSourcingOptions {
  mongoURL: string;
}

export interface EventSourcingGenericOptions {
  type: string;
  uri?: string;
  url?: string;
  host?: string;
  port?: number;
  options?: {
    ssl: boolean;
    [key: string]: unknown;
  };
}
