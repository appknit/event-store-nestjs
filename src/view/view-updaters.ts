import { IEvent } from '@nestjs/cqrs';
import { IViewUpdater } from './interfaces';
import { Type } from '@nestjs/common';

export class ViewUpdaters {
  private static updaters = new Map<string, Type<IViewUpdater<IEvent>>>();

  static add(name: string, handler: Type<IViewUpdater<IEvent>>): void {
    ViewUpdaters.updaters.set(name, handler);
  }

  static get(name: string): Type<IViewUpdater<IEvent>> {
    return ViewUpdaters.updaters.get(name);
  }
}
