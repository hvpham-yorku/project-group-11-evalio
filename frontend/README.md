# Evalio Frontend

Modern Next.js 14+ frontend for Evalio with dark glass UI.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Components:** Shadcn/UI (Radix Primitives)
- **Animation:** Framer Motion
- **State Management:** TanStack Query (React Query)
- **Icons:** Lucide React

## Setup

### 1. Install Node Modules

```bash
npm install
```

### 2. Environment Variables

Already set in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Pages and layouts
│   ├── layout.tsx         # Root layout
│   ├── globals.css        # Global styles
│   ├── page.tsx           # Landing page
│   └── dashboard/         # Dashboard route
├── components/
│   ├── landing/           # Landing page components
│   │   ├── landing.tsx
│   │   ├── navbar.tsx
│   │   ├── hero.tsx
│   │   └── bento.tsx
│   └── dashboard/         # Dashboard components
│       └── shell.tsx
└── lib/
    └── api/               # API client and types
        ├── client.ts
        └── models.ts
```

## Styling

All components use CSS variables defined in `globals.css`:
- Dark glass aesthetic with backdrop blur
- Radial gradients for ambient background
- Shimmer animations for interactive elements
- Responsive Tailwind utilities

## Build

```bash
npm run build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Framer Motion](https://www.framer.com/motion)
