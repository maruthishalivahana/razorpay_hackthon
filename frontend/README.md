# Agentic Commerce - Merchant Dashboard Frontend

Next.js + TypeScript + Tailwind CSS + shadcn/ui frontend foundation for the Agentic Commerce Merchant Dashboard.

## Prerequisites

- Node.js >= 20.0.0
- npm

## Getting Started

### 1. Environment Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure `NEXT_PUBLIC_API_URL` to point to the backend API (default: `http://localhost:5000`).

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 4. Build for Production

```bash
npm run build
```

### 5. Linting

```bash
npm run lint
```

## Folder Structure

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── merchant/
│       └── page.tsx
├── components/
│   ├── ui/          # shadcn components (Button, Card, Input)
│   └── shared/      # Shared application components
├── lib/
│   ├── utils.ts     # cn helper
│   └── api/
│       └── client.ts # Lightweight API client foundation
├── hooks/           # Custom React hooks
├── types/           # Shared TypeScript interfaces (ApiError, etc.)
└── public/          # Static assets
```
