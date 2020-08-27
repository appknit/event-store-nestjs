export const getEventsTableSQL = (tableName: string): string => {
  return `CREATE TABLE ${tableName} (
    id             VARCHAR2(64) PRIMARY KEY,
    streamId        VARCHAR2(256),
    aggregateId     VARCHAR2(256),
    aggregate       VARCHAR2(128) NOT NULL,
    context         VARCHAR2(256),
    commitId        VARCHAR2(256) NOT NULL,
    payload 		    BLOB CONSTRAINT ensure_payload_json CHECK (payload IS JSON),
    POSITION        NUMBER,
    commitSequence  NUMBER DEFAULT 0,
    commitStamp     DATE DEFAULT (sysdate),
    restInCommitStream NUMBER(1) DEFAULT 0,
    dispatched      NUMBER(1) DEFAULT 0
  )`;
};

export const getSnapshotsTableSQL = (tableName: string): string => {
  return `CREATE TABLE ${tableName} (
    id              VARCHAR2(64) PRIMARY KEY,
    aggregateId     VARCHAR2(256),
    aggregate       VARCHAR2(128) NOT NULL,
    context         VARCHAR2(256),
    revision        NUMBER DEFAULT 0,
    version         NUMBER DEFAULT 0,
    commitStamp     DATE DEFAULT (sysdate),
    data 		        BLOB CONSTRAINT ensure_data_json CHECK (data IS JSON)
  )`;
};

export const tableCreationsScripts: Record<string, Function> = {
  events: getEventsTableSQL,
  snapshots: getSnapshotsTableSQL,
};

export default tableCreationsScripts;
