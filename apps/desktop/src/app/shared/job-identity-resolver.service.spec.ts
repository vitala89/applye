import { TestBed } from '@angular/core/testing';
import { Job, Settings } from '@applye/core';
import { AiService, JobSourceService, KeysService, SettingsService } from '@applye/data';
import { JobIdentityResolverService } from './job-identity-resolver.service';
import {
  JobIdentityPromptService,
  JobIdentityRequest,
} from './job-identity-prompt/job-identity-prompt.service';

interface SetIdentityCall {
  jobId: number;
  title?: string;
  company?: string;
  titleSource?: string;
  companySource?: string;
}

describe('JobIdentityResolverService', () => {
  let svc: JobIdentityResolverService;
  let setCalls: SetIdentityCall[];
  let skipCalls: number[];
  let asked: JobIdentityRequest[];
  let renderCalls: string[];
  let runCalls: number;
  let aiReply: string;
  let hasKey: boolean;
  let settings: Partial<Settings> | null;
  /** What the dialog answers with, or null for a Skip. */
  let dialogAnswer: { company: string; title: string } | null;

  const JOB: Job = {
    id: 7,
    jdText: 'This position is listed on behalf of a partner company.',
    hardFilterPassed: true,
  };

  beforeEach(() => {
    setCalls = [];
    skipCalls = [];
    asked = [];
    renderCalls = [];
    runCalls = 0;
    aiReply = '{"company": null, "title": "AI-Native Software Developer"}';
    hasKey = true;
    dialogAnswer = null;
    settings = { aiMode: 'api', provider: 'claude', economyModel: 'haiku' };

    const source = {
      jobSetIdentity: (
        jobId: number,
        title?: string,
        company?: string,
        titleSource?: string,
        companySource?: string,
      ) => {
        setCalls.push({ jobId, title, company, titleSource, companySource });
        return Promise.resolve({ ...JOB, title, company, titleSource, companySource } as Job);
      },
      jobSkipIdentityPrompt: (jobId: number) => {
        skipCalls.push(jobId);
        return Promise.resolve();
      },
    };

    const ai = {
      renderSkill: (name: string) => {
        renderCalls.push(name);
        return Promise.resolve({ version: '1', systemPrompt: 'sys', userPrompt: 'user' });
      },
      run: () => {
        runCalls += 1;
        return Promise.resolve({ text: aiReply, tokensInput: 1, tokensOutput: 1, cachedTokens: 0 });
      },
    };

    const prompt = {
      ask: (request: JobIdentityRequest) => {
        asked.push(request);
        return Promise.resolve(dialogAnswer);
      },
    };

    TestBed.configureTestingModule({
      providers: [
        JobIdentityResolverService,
        { provide: JobSourceService, useValue: source },
        { provide: AiService, useValue: ai },
        { provide: KeysService, useValue: { hasProviderKey: () => Promise.resolve(hasKey) } },
        { provide: SettingsService, useValue: { current: () => settings } },
        { provide: JobIdentityPromptService, useValue: prompt },
      ],
    });
    svc = TestBed.inject(JobIdentityResolverService);
  });

  it('does nothing at all when the rules already named both fields', async () => {
    const named: Job = { ...JOB, company: 'Acme GmbH', title: 'Backend Engineer' };

    const result = await svc.resolve(named);

    expect(result).toBe(named);
    expect(renderCalls).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('stores what the AI named as inferred and asks about the rest', async () => {
    // The reported posting: the role is in the prose, the employer is genuinely
    // absent, and naming the platform would be the wrong answer.
    await svc.resolve(JOB);

    expect(renderCalls).toEqual(['job-identify']);
    expect(setCalls).toEqual([
      {
        jobId: 7,
        title: 'AI-Native Software Developer',
        company: undefined,
        titleSource: 'inferred',
        companySource: undefined,
      },
    ]);
    // Only the company is still in question, and the dialog says only that.
    expect(asked).toEqual([
      {
        missingCompany: true,
        missingTitle: false,
        company: '',
        title: 'AI-Native Software Developer',
      },
    ]);
  });

  it('does not call the AI with no provider configured, and still asks', async () => {
    hasKey = false;

    await svc.resolve(JOB);

    expect(renderCalls).toEqual([]);
    expect(runCalls).toBe(0);
    expect(asked.length).toBe(1);
  });

  it('does not call the AI before settings have loaded, and still asks', async () => {
    settings = null;

    await svc.resolve(JOB);

    expect(runCalls).toBe(0);
    expect(asked.length).toBe(1);
  });

  it('writes what the user typed with source user', async () => {
    aiReply = '{"company": null, "title": null}';
    dialogAnswer = { company: 'Contoso GmbH', title: 'Backend Engineer' };

    const result = await svc.resolve(JOB);

    expect(setCalls).toEqual([
      {
        jobId: 7,
        title: 'Backend Engineer',
        company: 'Contoso GmbH',
        titleSource: 'user',
        companySource: 'user',
      },
    ]);
    expect(result.company).toBe('Contoso GmbH');
  });

  it('leaves a field the user left blank alone rather than claiming it', async () => {
    dialogAnswer = { company: 'Contoso GmbH', title: '' };

    await svc.resolve(JOB);

    const written = setCalls[setCalls.length - 1];
    expect(written.companySource).toBe('user');
    expect(written.titleSource).toBe('inferred');
    expect(written.title).toBe('AI-Native Software Developer');
  });

  it('records a skip and writes no identity', async () => {
    aiReply = '{"company": null, "title": null}';
    dialogAnswer = null;

    const result = await svc.resolve(JOB);

    expect(skipCalls).toEqual([7]);
    expect(setCalls).toEqual([]);
    expect(result.identityPromptSkipped).toBe(true);
  });

  it('does not raise the dialog again for a job whose skip is recorded', async () => {
    aiReply = '{"company": null, "title": null}';

    await svc.resolve({ ...JOB, identityPromptSkipped: true });

    expect(asked).toEqual([]);
    expect(skipCalls).toEqual([]);
  });

  it('reopens the dialog on demand even after a skip', async () => {
    aiReply = '{"company": null, "title": null}';
    dialogAnswer = { company: 'Contoso GmbH', title: 'Backend Engineer' };

    await svc.askAgain({ ...JOB, identityPromptSkipped: true });

    expect(asked.length).toBe(1);
    expect(setCalls[0].companySource).toBe('user');
  });

  it('treats a model that answers in prose or fences as having named nothing', async () => {
    // Two failures at once: a fenced reply, and the strings a model reaches for
    // instead of null. Either one stored verbatim puts "unknown" on the card.
    aiReply = '```json\n{"company": "unknown", "title": "N/A"}\n```';

    await svc.resolve(JOB);

    expect(setCalls).toEqual([]);
    expect(asked.length).toBe(1);
  });

  it('survives an AI call that throws and falls through to the dialog', async () => {
    aiReply = 'not json at all';

    const result = await svc.resolve(JOB);

    expect(asked.length).toBe(1);
    expect(result.id).toBe(7);
  });
});
