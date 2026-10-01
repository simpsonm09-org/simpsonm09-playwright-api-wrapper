import type { Locator as PwLocator, Page } from 'playwright';

import type { LocatorSpec } from '../schema/request.js';

type AriaRole = Parameters<Page['getByRole']>[0];

export function resolveLocator(page: Page, spec: LocatorSpec): PwLocator {
  switch (spec.by) {
    case 'role':
      return spec.name === undefined
        ? page.getByRole(spec.role as AriaRole)
        : page.getByRole(spec.role as AriaRole, { name: spec.name });
    case 'label':
      return page.getByLabel(spec.text);
    case 'testId':
      return page.getByTestId(spec.value);
    case 'text':
      return page.getByText(spec.text);
    case 'css':
      return page.locator(spec.selector);
  }
}

export function describeLocator(spec: LocatorSpec): string {
  switch (spec.by) {
    case 'role':
      return spec.name === undefined
        ? `role=${spec.role}`
        : `role=${spec.role} name=${JSON.stringify(spec.name)}`;
    case 'label':
      return `label=${JSON.stringify(spec.text)}`;
    case 'testId':
      return `testId=${JSON.stringify(spec.value)}`;
    case 'text':
      return `text=${JSON.stringify(spec.text)}`;
    case 'css':
      return `css=${JSON.stringify(spec.selector)}`;
  }
}
