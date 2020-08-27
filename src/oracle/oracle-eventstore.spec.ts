import { OracleEventStore } from './oracle-eventstore';

const oracleConfig = {
  user: 'system',
  password: 'admin',
  hostname: '127.0.0.1:1521',
  port: 1521,
  servicename: 'ORCLPDB1',
};

describe('OracleEventStore', () => {
  it('Should initialize an eventstore', async () => {
    const eventstore = new OracleEventStore(oracleConfig);
    expect(eventstore.isInitiated()).toBe(false);
  })

  it('Should initialize an eventstore', async () => {
    const eventstore = new OracleEventStore(oracleConfig);
    await eventstore.connect();
    expect(eventstore.isInitiated()).toBe(true);
  })

  it('Should return an array of events for aggregate and id', async () => {
    const aggregate = 'integration-events';
    const id = '5f3bcea2f1fad9490649a8e10';
    const eventstore = new OracleEventStore(oracleConfig);
    await eventstore.connect();
    const events = await eventstore.getEvents(aggregate, id);
    expect(events).toBeInstanceOf(Array);
  })

  it('Should return an event instance', async () => {
    const eventId = '5f3bcea2f1fad9490649a8e10';
    const eventstore = new OracleEventStore(oracleConfig);
    await eventstore.connect();
    const event = await eventstore.getEvent(eventId);
    expect(event).toBeDefined();
  })

})
