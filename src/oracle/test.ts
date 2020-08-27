import { OracleEventStore } from './oracle-eventstore';
import * as shortid from 'short-uuid';

import { OracleConfig } from '../interfaces/oracle';
import { StorableEvent } from '../interfaces';

const oracleConfig: OracleConfig = {
  user: 'system',
  password: 'admin',
  hostname: '127.0.0.1:1521',
  useSodaApi: false,
  servicename: 'ORCLPDB1',
};

class SampleEvent extends StorableEvent {
  id: string;
  eventAggregate: string;
  eventVersion: number;
  eventName: string;
  public aggregateId: string;
  public payload?: object;
}

const init = async () => {
  const eventstore = new OracleEventStore(oracleConfig);
  try {
    await eventstore.connect();

    const eventId = shortid.generate();
    const aggregateId = shortid.generate();

    const event: SampleEvent = {
      id: eventId,
      eventName: 'IntegrationCreatedEvent',
      eventAggregate: 'integration-events',
      eventVersion: 0,
      aggregateId,
    };
    const id = await eventstore.storeEvent(event);
    const storedEvent = await eventstore.getEvent(id);
    console.log('stored event:', storedEvent);

    // const aggregate = 'integration-events';
    // const events = await eventstore.getEvents(aggregate, aggregateId);
    // console.log('events:', events);

    // const commitStamp = new Date('2020-06-25 00:00:00');
    // const events = await eventstore.getEventsSince(commitStamp);
    // console.log('events:', events);
  } catch (err) {
    console.error(err)
  }
};
