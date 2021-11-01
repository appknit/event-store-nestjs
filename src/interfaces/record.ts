export type Payload = Record<string, any> | null;

export interface SnapshotRecord {
  snapshotId: string,
  aggregateId?: string,
  aggregate?: string,
  context?: string,
  revision: number,
  version: number,
  commitStamp: Date,
  data?: Payload;
}

export interface EventRecord {
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
