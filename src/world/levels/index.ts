import type { LevelDef } from '../types';
import { town } from './town';
import { drain } from './drain';
import { factory } from './factory';
import { rail } from './rail';
import { archive } from './archive';
import { forest } from './forest';
import { sea } from './sea';
import { blank } from './blankland';
import { field } from './field';

/** 이어지는 순서 (세계는 하나, 구간은 개발용 구분) */
export const LEVEL_ORDER = ['town', 'drain', 'factory', 'rail', 'archive', 'forest', 'sea', 'blank', 'field'] as const;

export const LEVELS: Record<string, LevelDef> = { town, drain, factory, rail, archive, forest, sea, blank, field };
