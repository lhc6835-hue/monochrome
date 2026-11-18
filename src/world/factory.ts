import type { EntityDef } from './types';
import { Box, Cctv, Faller, Gate, Memory, PetalPickup, Plate, Resident, type Entity } from './entities';
import { Echo, Ladder, Lever, Shaft, Water } from './entities2';

export function createEntity(def: EntityDef): Entity {
  switch (def.type) {
    case 'box':
      return new Box(def.id, def.x, def.y ?? 0, def.size);
    case 'plate':
      return new Plate(def.id, def.x, def.y ?? 0, def.w ?? 120, def.signal);
    case 'gate':
      return new Gate(def.id, def.x, def.y ?? 0, def.w ?? 46, def.h ?? 300, def.signal);
    case 'resident':
      return new Resident(def);
    case 'petal':
      return new PetalPickup(def.id, def.x, def.y, def.color);
    case 'memory':
      return new Memory(def.id, def.x, def.y ?? 0, def.art);
    case 'cctv':
      return new Cctv(def);
    case 'faller':
      return new Faller(def);
    case 'water':
      return new Water(def);
    case 'lever':
      return new Lever(def);
    case 'ladder':
      return new Ladder(def);
    case 'echo':
      return new Echo(def);
    case 'shaft':
      return new Shaft(def);
  }
}
