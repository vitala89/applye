import { AiProvider } from '../types/common.types';

/** One supported CLI-bridge binary and whether it is usable on this machine. */
export interface CliStatus {
  provider: AiProvider;
  command: string;
  label: string;
  /** A file with this name exists on the search path. */
  installed: boolean;
  path: string | null;
  /**
   * The binary exists **and** actually ran. `installed` alone is not enough:
   * these CLIs ship as npm wrappers that spawn a platform-specific binary, and
   * a partial install leaves the wrapper on the path with the binary missing -
   * which passes a file-existence check and then fails on the first real call.
   */
  working: boolean;
  /** Version the CLI printed, when it ran. */
  version: string | null;
  /** Why it did not run, when it did not. */
  error: string | null;
}
