# FiberNorth Underground (fibernorth.com)

## Tech Stack
- Next.js 16 (App Router) + TypeScript (strict)
- Tailwind CSS with CSS variable theming (dark default)
- Firebase (Firestore, Auth, Storage) — client + admin SDK
- shadcn/ui component library (Radix UI primitives)
- Vercel deployment
- Google Maps JavaScript API

## Project Structure
- `src/app/(public)/` — Public marketing pages
- `src/app/(auth)/` — Login page
- `src/app/(admin)/admin/` — Admin CMS (protected)
- `src/app/api/` — API routes
- `src/components/` — React components
- `src/lib/` — Core utilities, Firebase init, types
- `src/services/` — Backend services (Admin SDK, notifications)
- `src/actions/` — Server actions
- `src/hooks/` — Custom hooks (Firestore subscriptions)
- `src/context/` — Auth context provider

## Patterns
- Use `@/` absolute imports
- Server actions: verify token via verifyServerActionCaller() before Admin SDK ops
- API routes: use verifyApiAuth() for Bearer token verification
- Client data: use useFirestoreDocument / useFirestoreCollection hooks
- Forms: react-hook-form + zod validation
- Icons: lucide-react
- Dates: date-fns
- Styling: Tailwind classes, cn() utility for conditional classes

## Commands
- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — lint check

## Brand Colors
- Background: #0C1017 (dark)
- Primary: #E8672A (burnt orange)
- Secondary: #F4A42B (amber)
- Accent: earth greens
