import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { JobIdentityPromptComponent } from './job-identity-prompt.component';
import { JobIdentityPromptService } from './job-identity-prompt.service';

/**
 * These render the dialog for real.
 *
 * The unit tests around it all passed while the dialog threw NG0600 on every
 * open - "Writing to signals is not allowed in a `computed`" - because seeding
 * the two inputs happened inside a computed. Nothing that stubs the component
 * away can catch that: it is a rule Angular enforces at render time. So the
 * component is built, opened, and read.
 */
describe('JobIdentityPromptComponent', () => {
  let fixture: ComponentFixture<JobIdentityPromptComponent>;
  let prompt: JobIdentityPromptService;

  const inputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input'));
  const text = (): string => fixture.nativeElement.textContent ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JobIdentityPromptComponent],
      providers: [TranslateService],
    }).compileComponents();
    fixture = TestBed.createComponent(JobIdentityPromptComponent);
    prompt = TestBed.inject(JobIdentityPromptService);
    fixture.detectChanges();
  });

  it('renders nothing until it is asked', () => {
    expect(inputs()).toHaveLength(0);
  });

  it('opens and seeds both fields from what is already known', () => {
    void prompt.ask({
      missingCompany: true,
      missingTitle: false,
      company: '',
      title: 'AI-Native Software Developer',
      aiOutcome: 'answered',
    });
    fixture.detectChanges();

    const [company, title] = inputs();
    expect(company.value).toBe('');
    expect(title.value).toBe('AI-Native Software Developer');
  });

  it('starts a second job from that job, not from the last answer', () => {
    void prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: 'First Corp',
      title: 'First Role',
      aiOutcome: 'answered',
    });
    fixture.detectChanges();
    prompt.skip();
    fixture.detectChanges();

    void prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });
    fixture.detectChanges();

    expect(inputs().map((i) => i.value)).toEqual(['', '']);
  });

  it('resolves with what was typed', async () => {
    const answer = prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });
    fixture.detectChanges();

    const [company, title] = inputs();
    company.value = '  Contoso GmbH  ';
    company.dispatchEvent(new Event('input'));
    title.value = 'Backend Engineer';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    prompt.save();

    expect(await answer).toEqual({ company: 'Contoso GmbH', title: 'Backend Engineer' });
  });

  it('reports a replaced request as superseded, never as a skip', async () => {
    // Conflating the two is what made the whole feature look dead: the resolver
    // reads a skip as the user declining and writes it to the job, and a job
    // with the skip recorded was then never identified again on any parse.
    const first = prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });
    void prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });

    expect(await first).toBe('superseded');
  });

  it('reports Skip as a skip', async () => {
    const answer = prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });
    prompt.skip();

    expect(await answer).toBe('skipped');
  });

  it('says so when nothing read the posting, rather than implying the posting is silent', () => {
    void prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'no-provider',
    });
    fixture.detectChanges();

    // The resolved English, not the key: TranslateService is real here, so a
    // key leaking through would itself be a failure worth seeing.
    expect(text()).toContain('nothing read this posting for you');
  });

  it('does not blame the AI when the AI actually answered', () => {
    void prompt.ask({
      missingCompany: true,
      missingTitle: true,
      company: '',
      title: '',
      aiOutcome: 'answered',
    });
    fixture.detectChanges();

    expect(text()).not.toContain('nothing read this posting for you');
    expect(text()).not.toContain('could not be reached');
  });
});
