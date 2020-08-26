import { OracleEventStore } from './oracle-eventstore';
import { OracleConfig } from './interfaces/oracle';

const oracleConfig: OracleConfig = {
  user: 'system',
  password: 'admin',
  hostname: '127.0.0.1:1521',
  useSodaApi: false,
  servicename: 'ORCLPDB1',
};

const init = async () => {
  const eventId = '5f3bcea2f1fad9490649a8e10';
  const eventstore = new OracleEventStore(oracleConfig);
  try {
    await eventstore.connect();
    const events = await eventstore.getEvent(eventId);
    console.log('events:', events);
  } catch (err) {
    console.error(err)
  }
};

init();
