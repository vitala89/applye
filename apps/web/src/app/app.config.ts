import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      // The whole site is one document scroll, so without this a reader who is
      // halfway down a docs page and clicks the next section lands halfway down
      // that one - looking at its middle with no sign the page changed.
      // `enabled` sends new navigations to the top and still restores the old
      // position on back/forward, which is what a reader expects from both.
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
  ],
};
