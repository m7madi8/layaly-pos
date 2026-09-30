export const APP_NAME = 'ليالي كافيه';
export const APP_TAGLINE = 'نظام نقاط البيع';
/** الشعار الرسمي للموقع — الملف: public/logo5.png */
export const APP_LOGO = `${process.env.PUBLIC_URL || ''}/logo5.png`;

/** شعار العرض والطباعة والـ PDF (الشعار المعتمد logo5.png) */
export function resolveAppLogo() {
  return APP_LOGO;
}
export const FONT_UI = 'var(--font-ui)';
export const FONT_HEADING = 'var(--font-ui)';

/** للاستخدام في style={{ ... }} — يطابق :root في theme.css */
export const theme = {
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  accent: 'var(--color-accent)',
  accentHover: 'var(--color-accent-hover)',
  accentSoft: 'var(--color-accent-soft)',
  bg: 'var(--color-bg)',
  bgWarm: 'var(--color-bg-warm)',
  bgApp: 'var(--color-bg-app)',
  surface: 'var(--color-surface)',
  surfaceMuted: 'var(--color-surface-muted)',
  sidebar: 'var(--color-sidebar)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  textInverse: 'var(--color-text-inverse)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  border: 'var(--color-border)',
};
