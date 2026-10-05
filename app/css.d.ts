// Declara os imports de CSS "de efeito colateral" (ex.: import "./globals.css" no layout.tsx).
// Resolve o erro TS2882 quando o TypeScript está com noUncheckedSideEffectImports ligado.
declare module "*.css";
