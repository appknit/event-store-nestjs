import { Module, DynamicModule, Scope } from '@nestjs/common';
import { EventSourcingGenericOptions } from './interfaces';
import { CqrsModule } from '@nestjs/cqrs';
import { EventStore } from './eventstore';
import { createEventSourcingProviders } from './eventsourcing.providers';

@Module({})
export class EventSourcingModule {
  static forRoot(options: EventSourcingGenericOptions): DynamicModule {
    return {
      module: EventSourcingModule,
      providers: [
        {
          provide: EventStore,
          useValue: new EventStore(options),
        },
      ],
      exports: [EventStore],
      global: true,
    };
  }

  static forFeature(): DynamicModule {
    const providers = createEventSourcingProviders();
    return {
      module: EventSourcingModule,
      imports: [CqrsModule],
      providers: providers,
      exports: providers,
    };
  }
}
