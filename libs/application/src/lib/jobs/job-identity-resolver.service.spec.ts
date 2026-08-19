import { TestBed } from '@angular/core/testing';
import { Job, Settings } from '@applye/core';
import {
  AiService,
  DocumentsGateway,
  JobsGateway,
  JobSourceService,
  KeysService,
  ProfileSettingsGateway,
} from '@applye/data';
import { JobIdentityResolverService } from './job-identity-resolver.service';
import {
  JobIdentityOutcome,
  JobIdentityPromptService,
  JobIdentityRequest,
} from './job-identity-prompt.service';

interface SetIdentityCall {
  jobId: number;
  title?: string;
  company?: string;
  titleSource?: string;
  companySource?: string;
}

/** Lets the microtask queue drain, so a fire-and-forget phase can finish. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('JobIdentityResolverService', () => {
  let svc: JobIdentityResolverService;
  let setCalls: SetIdentityCall[];
  let skipCalls: number[];
  let asked: JobIdentityRequest[];
  let renderCalls: string[];
  let runCalls: number;
  let aiReply: string;
  /** When set, the AI call never settles - the hanging provider. */
  let aiHangs: boolean;
  let hasKey: boolean;
  let settings: Partial<Settings> | null;
  /** How the dialog ends: what was typed, a Skip, or replaced by a newer ask. */
  let dialogAnswer: JobIdentityOutcome;

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
    aiHangs = false;
    hasKey = true;
    dialogAnswer = 'skipped';
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
        if (aiHangs) return new Promise(() => undefined);
        return Promise.resolve({ text: aiReply, tokensInput: 1, tokensOutput: 1, cachedTokens: 0 });
      },
    };

    const prompt = {
      ask: (request: JobIdentityRequest) => {
        asked.push(request);
        return Promise.resolve(dialogAnswer);
      },
    };

    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = { getSettings: () => Promise.resolve(settings) };
    TestBed.configureTestingModule({
      providers: [
        JobIdentityResolverService,
        { provide: JobSourceService, useValue: source },
        { provide: AiService, useValue: ai },
        { provide: KeysService, useValue: { hasProviderKey: () => Promise.resolve(hasKey) } },
        { provide: ProfileSettingsGateway, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: JobIdentityPromptService, useValue: prompt },
      ],
    });
    svc = TestBed.inject(JobIdentityResolverService);
  });

  it('does nothing at all when the rules already named both fields', async () => {
    svc.start({ ...JOB, company: 'Acme GmbH', title: 'Backend Engineer' });
    await settled();

    expect(renderCalls).toEqual([]);
    expect(svc.identifyingJobId()).toBeNull();
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('still identifies a job whose skip is recorded, it just does not ask again', async () => {
    // The skip means "stop asking me", not "stop reading the posting". Bailing
    // out of the whole phase made every re-parse of a skipped job do nothing,
    // while the button beside the placeholder still worked - which is exactly
    // how it was reported.
    svc.start({ ...JOB, identityPromptSkipped: true });
    await settled();

    expect(renderCalls).toEqual(['job-identify']);
    expect(setCalls[0].title).toBe('AI-Native Software Developer');
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('returns before the AI call does, so the parse is never held on it', () => {
    // The regression. Blocking here is what left Parse & filter spinning: the
    // call is bounded only by a network, and the dialog behind it by nothing.
    aiHangs = true;

    svc.start(JOB);

    expect(svc.identifyingJobId()).toBe(7);
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('gives up on a provider that never answers, and asks instead', async () => {
    jest.useFakeTimers();
    aiHangs = true;
    try {
      svc.start(JOB);
      await jest.advanceTimersByTimeAsync(46_000);
    } finally {
      jest.useRealTimers();
    }

    expect(svc.identifyingJobId()).toBeNull();
    expect(svc.needsNameJobId()).toBe(7);
    expect(setCalls).toEqual([]);
  });

  it('stores what the AI named as inferred and flags the rest for the user', async () => {
    // The reported posting: the role is in the prose, the employer is genuinely
    // absent, and naming the platform would be the wrong answer.
    svc.start(JOB);
    await settled();

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
    // The service never opens the dialog itself - whoever is rendering the job
    // does, which is what keeps a modal off the page the user moved on to.
    expect(asked).toEqual([]);
    expect(svc.needsNameJobId()).toBe(7);
    expect(svc.resolved()?.title).toBe('AI-Native Software Developer');
  });

  it('does not flag a job the AI managed to name completely', async () => {
    aiReply = '{"company": "Contoso GmbH", "title": "Backend Engineer"}';

    svc.start(JOB);
    await settled();

    expect(svc.needsNameJobId()).toBeNull();
    expect(setCalls[0].companySource).toBe('inferred');
  });

  it('does not call the AI with no provider configured, and still flags the job', async () => {
    hasKey = false;

    svc.start(JOB);
    await settled();

    expect(renderCalls).toEqual([]);
    expect(runCalls).toBe(0);
    expect(svc.needsNameJobId()).toBe(7);
  });

  it('does not call the AI when there are no settings yet, and still flags the job', async () => {
    settings = null;

    svc.start(JOB);
    await settled();

    expect(runCalls).toBe(0);
    expect(svc.needsNameJobId()).toBe(7);
  });

  it('writes what the user typed with source user and clears the flag', async () => {
    dialogAnswer = { company: 'Contoso GmbH', title: 'Backend Engineer' };
    svc.start(JOB);
    await settled();
    expect(svc.needsNameJobId()).toBe(7);

    const result = await svc.ask(svc.resolved() ?? JOB);

    expect(setCalls[setCalls.length - 1]).toEqual({
      jobId: 7,
      title: 'Backend Engineer',
      company: 'Contoso GmbH',
      titleSource: 'user',
      companySource: 'user',
    });
    expect(result.company).toBe('Contoso GmbH');
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('leaves a field the user left blank alone rather than claiming it', async () => {
    dialogAnswer = { company: 'Contoso GmbH', title: '' };

    await svc.ask({ ...JOB, title: 'AI-Native Software Developer', titleSource: 'inferred' });

    const written = setCalls[setCalls.length - 1];
    expect(written.companySource).toBe('user');
    expect(written.titleSource).toBe('inferred');
    expect(written.title).toBe('AI-Native Software Developer');
  });

  it('records a skip and writes no identity', async () => {
    dialogAnswer = 'skipped';

    const result = await svc.ask(JOB);

    expect(skipCalls).toEqual([7]);
    expect(setCalls).toEqual([]);
    expect(result.identityPromptSkipped).toBe(true);
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('gives the AI another turn and then asks, on demand, even after a skip', async () => {
    aiReply = '{"company": null, "title": null}';
    dialogAnswer = { company: 'Contoso GmbH', title: 'Backend Engineer' };

    await svc.askAgain({ ...JOB, identityPromptSkipped: true });

    expect(runCalls).toBe(1);
    expect(asked.length).toBe(1);
    expect(setCalls[0].companySource).toBe('user');
    // The on-demand path is about to ask, so it must not also raise the badge.
    expect(svc.needsNameJobId()).toBeNull();
  });

  it('treats a model that answers in fences or filler as having named nothing', async () => {
    // Two failures at once: a fenced reply, and the strings a model reaches for
    // instead of null. Either one stored verbatim puts "unknown" on the card.
    aiReply = '```json\n{"company": "unknown", "title": "N/A"}\n```';

    svc.start(JOB);
    await settled();

    expect(setCalls).toEqual([]);
    expect(svc.needsNameJobId()).toBe(7);
  });

  it('survives an AI call that throws and still flags the job', async () => {
    aiReply = 'not json at all';

    svc.start(JOB);
    await settled();

    expect(svc.identifyingJobId()).toBeNull();
    expect(svc.needsNameJobId()).toBe(7);
  });

  it('does not record a skip for a dialog replaced by a newer one', async () => {
    // The fault that made the feature look dead. A second ask resolved the
    // first with the skip value, the skip was written to the job, and from then
    // on every parse of that posting did nothing - a first paste dedupes on the
    // text's hash, so re-pasting landed back on the same flagged row. The user
    // had never pressed Skip.
    dialogAnswer = 'superseded';

    const result = await svc.ask(JOB);

    expect(skipCalls).toEqual([]);
    expect(setCalls).toEqual([]);
    expect(result.identityPromptSkipped).toBeUndefined();
  });

  it('taking the published job does not cancel the dialog it came with', async () => {
    // The trap. One identify call sets both: the AI named the title, so a job
    // is published, and it could not name the company, so the same call flags
    // the job. A page that took the published job with the wider `clear` would
    // wipe the flag and the dialog would never open.
    svc.start(JOB);
    await settled();
    expect(svc.resolved()?.id).toBe(7);
    expect(svc.needsNameJobId()).toBe(7);

    svc.consumeResolved(7);

    expect(svc.resolved()).toBeNull();
    expect(svc.needsNameJobId()).toBe(7);
  });

  it('forgets a job that was named or went away', async () => {
    svc.start(JOB);
    await settled();
    expect(svc.needsNameJobId()).toBe(7);

    svc.clear(7);

    expect(svc.needsNameJobId()).toBeNull();
    expect(svc.resolved()).toBeNull();
  });
});
