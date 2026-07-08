import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-cv-photo-crop',
  standalone: true,
  imports: [],
  templateUrl: './cv-photo-crop.component.html',
  styleUrl: './cv-photo-crop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPhotoCropComponent {
  protected readonly t = inject(TranslateService).t;

  readonly TARGET_W = 360;
  readonly TARGET_H = 480;

  /** Source image as a data URI (any supported format). */
  readonly sourceDataUri = input.required<string>();

  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly zoom = signal(1); // 1..3
  private readonly offsetX = signal(0);
  private readonly offsetY = signal(0);
  private readonly img = signal<HTMLImageElement | null>(null);
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor() {
    // Load the source image whenever the input changes.
    effect(() => {
      const src = this.sourceDataUri();
      const image = new Image();
      image.onload = () => {
        this.img.set(image);
        this.zoom.set(1);
        this.offsetX.set(0);
        this.offsetY.set(0);
        this.draw();
      };
      image.src = src;
    });
  }

  onZoom(value: number) {
    this.zoom.set(value);
    this.draw();
  }

  onPointerDown(ev: PointerEvent) {
    this.dragging = true;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.dragging) return;
    this.offsetX.update((x) => x + (ev.clientX - this.lastX));
    this.offsetY.update((y) => y + (ev.clientY - this.lastY));
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.draw();
  }

  onPointerUp() {
    this.dragging = false;
  }

  /** Draw the source into the fixed 3:4 canvas at current zoom/offset (cover). */
  private draw() {
    const canvas = this.canvasRef().nativeElement;
    canvas.width = this.TARGET_W;
    canvas.height = this.TARGET_H;
    const ctx = canvas.getContext('2d');
    const image = this.img();
    if (!ctx || !image) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // base scale = cover the target, then apply user zoom
    const base = Math.max(canvas.width / image.width, canvas.height / image.height);
    const scale = base * this.zoom();
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    // center + user offset
    const dx = (canvas.width - drawW) / 2 + this.offsetX();
    const dy = (canvas.height - drawH) / 2 + this.offsetY();
    ctx.drawImage(image, dx, dy, drawW, drawH);
  }

  confirm() {
    const canvas = this.canvasRef().nativeElement;
    this.confirmed.emit(canvas.toDataURL('image/jpeg', 0.85));
  }

  cancel() {
    this.cancelled.emit();
  }
}
