import { ViewUpdaters } from '../view-updaters';
import { IEvent } from '@nestjs/cqrs';
import { Type } from '@nestjs/common';
import { IViewUpdater } from '../interfaces';

export function ViewUpdaterHandler(
  event: Type<IEvent>,
): (target: Type<IViewUpdater<IEvent>>) => any {
  return (target: Type<IViewUpdater<IEvent>>) => {
    ViewUpdaters.add(event.name, target);
  };
}
