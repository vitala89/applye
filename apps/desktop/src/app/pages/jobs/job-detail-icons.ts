import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  Copy,
  Database,
  ExternalLink,
  FileDown,
  FileText,
  Flag,
  GitCompare,
  Hammer,
  Languages,
  ListChecks,
  Minus,
  Pencil,
  PencilLine,
  Plus,
  RotateCw,
  ScanLine,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-angular';
import { JobDetailIcons } from './scoring.utils';

/**
 * The icons the job detail template asks for by name. `JobDetailIcons` covers
 * the set the scoring view shares; the rest are this page's own.
 *
 * A table rather than thirty component fields, and a module rather than a
 * component member, because a missing key here is a template error - the one
 * class of mistake `npm run type-check` does not see, and only a full
 * `nx build desktop` reports.
 */
export type JobDetailIconTable = JobDetailIcons & {
  empty: typeof Search;
  copy: typeof Copy;
  add: typeof Plus;
  remove: typeof X;
  another: typeof RotateCw;
  trash: typeof Trash2;
  dangerGlyph: typeof CircleX;
};

export const JOB_DETAIL_ICONS: JobDetailIconTable = {
  empty: Search,
  atsPass: Check,
  atsFail: X,
  tag: Tag,
  flag: Flag,
  scan: ScanLine,
  checklist: ListChecks,
  next: ArrowRight,
  star: Star,
  db: Database,
  bookmark: Bookmark,
  wand: WandSparkles,
  back: ArrowLeft,
  checkCircle: CheckCircle2,
  languages: Languages,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  shieldCheck: ShieldCheck,
  sparkles: Sparkles,
  gitCompare: GitCompare,
  alertTriangle: AlertTriangle,
  minus: Minus,
  plus: Plus,
  pencil: Pencil,
  hammer: Hammer,
  scanSearch: ScanSearch,
  pencilLine: PencilLine,
  fileText: FileText,
  fileDown: FileDown,
  externalLink: ExternalLink,
  copy: Copy,
  check: Check,
  add: Plus,
  remove: X,
  another: RotateCw,
  trash: Trash2,
  dangerGlyph: CircleX,
};
