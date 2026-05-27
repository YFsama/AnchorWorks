/**
 * Onboarding state — tiny localStorage helpers, factored out of the
 * `Onboarding` React component so `Fast Refresh` doesn't get confused by
 * a file that exports both a component and non-component helpers.
 *
 * Keys are intentionally co-located with the Onboarding modal that consumes
 * them; touching either file independently is safe.
 */

const STORAGE_KEY = 'vector.onboarded';

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* noop */
  }
}
