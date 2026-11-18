import type { LevelDef } from '../types';
import { town } from './town';
import { drain } from './drain';

/** 이어지는 순서 (세계는 하나, 구간은 개발용 구분) */
export const LEVEL_ORDER = ['town', 'drain'] as const;

export const LEVELS: Record<string, LevelDef> = { town, drain };
