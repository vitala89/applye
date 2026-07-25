import { SupportedLanguage } from '@applye/core';

import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { ru } from './ru';
import { TranslationMap } from './types';
import { uk } from './uk';

export type { TranslationMap };

export const TRANSLATIONS: Record<SupportedLanguage, TranslationMap> = { en, de, ru, es, fr, uk };
