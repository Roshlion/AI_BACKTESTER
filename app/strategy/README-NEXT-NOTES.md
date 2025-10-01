# Strategy Page Next.js Notes

- Parse query strings via `Page({ searchParams })` in the **Server Component** `app/strategy/page.tsx`.
- Do **not** call `useSearchParams` or `useRouter` in Server Components.
- If you must read the URL in a client component, wrap it in a `<Suspense>` boundary.
- This page is marked `dynamic` and `revalidate = 0` because its UI depends on request-time search params.
