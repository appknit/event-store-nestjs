import { Injectable, Type } from '@nestjs/common';
import { IViewUpdater } from './interfaces';
import { IEvent } from '@nestjs/cqrs';
import { ModuleRef } from '@nestjs/core';
import { ViewUpdaters } from './view-updaters';
import { AggregateRootAsync } from '../aggregate-root-async';

@Injectable()
export class ViewUpdater {
  private instances = new Map<
    Type<IViewUpdater<IEvent>>,
    IViewUpdater<IEvent>
  >();

  constructor(private moduleRef: ModuleRef) {}

  async run<T extends IEvent>(
    event: T,
    rootAggregator?: AggregateRootAsync,
  ): Promise<void> {
    const updater = ViewUpdaters.get(event.constructor.name);
    if (updater) {
      if (!this.instances.has(updater)) {
        this.instances.set(
          updater,
          this.moduleRef.get(updater.name, { strict: false }),
        );
      }
      if (rootAggregator !== undefined) {
        await this.instances.get(updater).handle(event, rootAggregator);
      } else {
        await this.instances.get(updater).handle(event);
      }
    }
    return;
  }
}
