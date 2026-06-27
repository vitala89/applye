import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  readonly theme = signal<'dark' | 'light'>('dark');

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: '⬛' },
    { label: 'Profile', route: '/profile', icon: '👤' },
    { label: 'Jobs', route: '/jobs', icon: '🔍' },
    { label: 'Pipeline', route: '/pipeline', icon: '📋' },
    { label: 'Interview Prep', route: '/interview-prep', icon: '🎯' },
    { label: 'Documents', route: '/documents', icon: '📄' },
    { label: 'Settings', route: '/settings', icon: '⚙' },
  ];

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-theme', next);
  }
}
