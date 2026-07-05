import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  let component: Skeleton;
  let fixture: ComponentFixture<Skeleton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Skeleton],
    }).compileComponents();

    fixture = TestBed.createComponent(Skeleton);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the design-system shimmer class', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.applye-skeleton')).toBeTruthy();
  });

  it('uses the given width and height for a bar', () => {
    fixture.componentRef.setInput('width', '55%');
    fixture.componentRef.setInput('height', 12);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('.applye-skeleton') as HTMLElement;
    expect(span.style.width).toBe('55%');
    expect(span.style.height).toBe('12px');
  });

  it('renders a circle sized by height with a full radius', () => {
    fixture.componentRef.setInput('circle', true);
    fixture.componentRef.setInput('height', 76);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('.applye-skeleton') as HTMLElement;
    expect(span.style.width).toBe('76px');
    expect(span.style.height).toBe('76px');
    expect(span.style.borderRadius).toBe('var(--radius-full)');
  });
});
