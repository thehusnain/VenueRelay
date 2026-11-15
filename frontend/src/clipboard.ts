export async function copyText(value: string, field: HTMLInputElement | HTMLTextAreaElement) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, value.length);
    try {
      if (document.execCommand('copy')) {
        previous?.focus({ preventScroll: true });
        return true;
      }
    } catch {}
    // Keep the real field selected if the browser blocks both clipboard methods.
    return false;
  }
}
